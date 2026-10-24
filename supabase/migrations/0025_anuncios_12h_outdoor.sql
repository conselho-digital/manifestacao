-- Cartazes e telões: texto OU imagem, 12 horas no ar (ou até um lance maior, nos telões);
-- outdoor do parque: reprodução sincronizada (play/pause/stop/seek do admin chega a todos).

-- ── texto OU imagem ─────────────────────────────────────────────────────────────────────────────
alter table public.custom_signs drop constraint custom_signs_text_check1;
alter table public.custom_signs add constraint custom_signs_text_len
  check (char_length(text) <= 40 and (char_length(text) >= 1 or image_path is not null));
alter table public.billboard_bids drop constraint billboard_bids_text_check;
alter table public.billboard_bids add constraint billboard_bids_text_len
  check (char_length(text) <= 60 and (char_length(text) >= 1 or image_path is not null));

-- ── 12 horas no ar e status "expired" ───────────────────────────────────────────────────────────
alter table public.custom_signs add column if not exists expires_at timestamptz;
alter table public.billboard_bids add column if not exists expires_at timestamptz;
alter table public.custom_signs drop constraint custom_signs_status_check;
alter table public.custom_signs add constraint custom_signs_status_check
  check (status in ('review', 'awaiting_payment', 'active', 'rejected', 'refunded', 'expired'));
alter table public.billboard_bids drop constraint billboard_bids_status_check;
alter table public.billboard_bids add constraint billboard_bids_status_check
  check (status in ('review', 'awaiting_payment', 'active', 'outbid', 'rejected', 'refunded', 'expired'));

create or replace function public.set_expiry() returns trigger language plpgsql as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    new.paid_at := coalesce(new.paid_at, now());
    new.expires_at := now() + interval '12 hours';
  end if;
  return new;
end $$;
drop trigger if exists custom_signs_expiry on public.custom_signs;
create trigger custom_signs_expiry before insert or update on public.custom_signs for each row execute function public.set_expiry();
drop trigger if exists billboard_bids_expiry on public.billboard_bids;
create trigger billboard_bids_expiry before insert or update on public.billboard_bids for each row execute function public.set_expiry();

drop policy if exists "cartazes ativos públicos" on public.custom_signs;
create policy "cartazes ativos públicos" on public.custom_signs
  for select to anon, authenticated using (status in ('active', 'refunded', 'expired'));
drop policy if exists "lances públicos" on public.billboard_bids;
create policy "lances públicos" on public.billboard_bids
  for select to anon, authenticated using (status in ('active', 'outbid', 'refunded', 'expired'));

-- lance mínimo e quitação ignoram o lance que já cumpriu as 12 h
create or replace function public.bid_minimum(p_board text)
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce(
    (select greatest(2000, b.amount_cents + greatest(500, ceil(b.amount_cents * 0.1)::int))
       from public.billboard_bids b
      where b.billboard_id = p_board and b.status = 'active' and (b.expires_at is null or b.expires_at > now())),
    2000);
$$;

create or replace function public.bid_settle(p_bid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_bid public.billboard_bids; v_cur public.billboard_bids; v_user uuid; v_board text;
begin
  select billboard_id into v_board from public.billboard_bids where id = p_bid;
  if v_board is null then return 'skip'; end if;
  perform pg_advisory_xact_lock(hashtext('bb:' || v_board));
  -- Lance que já cumpriu as 12 h sai do ar sem crédito (terminou o prazo).
  update public.billboard_bids set status = 'expired'
    where billboard_id = v_board and status = 'active' and expires_at is not null and expires_at <= now();
  select * into v_bid from public.billboard_bids where id = p_bid for update;
  if not found or v_bid.status <> 'awaiting_payment' then return 'skip'; end if;
  select * into v_cur from public.billboard_bids
    where billboard_id = v_bid.billboard_id and status = 'active' for update;
  select user_id into v_user from public.billboard_private where bid_id = p_bid;

  if v_cur.id is not null and v_cur.amount_cents >= v_bid.amount_cents then
    update public.billboard_bids set status = 'outbid', paid_at = now() where id = p_bid;
    perform public.credit_add(v_user, v_bid.amount_cents);
    return 'outbid_credit';
  end if;
  if v_cur.id is not null then
    update public.billboard_bids set status = 'outbid' where id = v_cur.id;
    perform public.credit_add((select user_id from public.billboard_private where bid_id = v_cur.id), v_cur.amount_cents);
  end if;
  update public.billboard_bids set status = 'active', paid_at = now() where id = p_bid;
  return 'active';
end $$;

-- listas do próprio usuário, agora com imagem e validade
create or replace function public.my_signs_v2()
returns table (id uuid, text text, color text, status text, created_at timestamptz, image_path text, expires_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.id, s.text, s.color,
         case when s.status = 'active' and s.expires_at is not null and s.expires_at <= now() then 'expired' else s.status end,
         s.created_at, s.image_path, s.expires_at
  from public.custom_signs s join public.sign_private p on p.sign_id = s.id
  where p.user_id = auth.uid() order by s.created_at desc limit 10;
$$;
create or replace function public.my_bids_v2()
returns table (id uuid, billboard_id text, text text, color text, amount_cents integer, status text, created_at timestamptz, image_path text, expires_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select b.id, b.billboard_id, b.text, b.color, b.amount_cents,
         case when b.status = 'active' and b.expires_at is not null and b.expires_at <= now() then 'expired' else b.status end,
         b.created_at, b.image_path, b.expires_at
  from public.billboard_bids b join public.billboard_private p on p.bid_id = b.id
  where p.user_id = auth.uid() order by b.created_at desc limit 10;
$$;
revoke all on function public.my_signs_v2(), public.my_bids_v2() from public, anon;
grant execute on function public.my_signs_v2(), public.my_bids_v2() to authenticated;

-- ── outdoor: hora do servidor e reprodução sincronizada ─────────────────────────────────────────
create or replace function public.server_time() returns timestamptz language sql stable as $$ select now(); $$;
grant execute on function public.server_time() to anon, authenticated;

alter table public.game_config drop constraint game_config_key_check;
alter table public.game_config add constraint game_config_key_check
  check (key = any (array['teams', 'flags', 'models', 'rigs', 'screen', 'screen_playback']));
do $$ begin
  alter publication supabase_realtime add table public.game_config;
exception when duplicate_object then null;
end $$;
