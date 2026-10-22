-- Telões: leilão. Quem paga mais exibe; o lance superado vira crédito.
-- Fluxo do lance: review → awaiting_payment (admin aprova) → active (Pix confirmado ou crédito) → outbid.
-- Mesmo desenho dos cartazes/superchat: tabela pública só com o que é de todos; autor e
-- pagamentos em tabelas privadas; escrita só por Edge Function / RPC.
-- Pré-requisito: tabela `user_credits` (0001).

-- A tabela do 0001 nunca foi usada pelo app: é renomeada (sem apagar nada) e fechada para o cliente.
alter table billboard_bids rename to billboard_bids_legacy_0001;
alter table billboard_bids_legacy_0001 rename constraint billboard_bids_pkey to billboard_bids_legacy_0001_pkey;
revoke all on billboard_bids_legacy_0001 from anon, authenticated;

create table billboard_bids (
  id uuid primary key default gen_random_uuid(),
  billboard_id text not null check (billboard_id in ('tela-1', 'tela-2', 'tela-3')),
  text text not null check (char_length(text) between 1 and 60),
  color text not null check (color in ('#f8f9fa', '#ffd43b', '#51cf66', '#4dabf7', '#ff6b6b', '#b197fc')),
  amount_cents integer not null check (amount_cents between 2000 and 1000000),
  status text not null default 'review'
    check (status in ('review', 'awaiting_payment', 'active', 'outbid', 'rejected', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
-- No máximo UM lance ativo por telão.
create unique index billboard_one_active_idx on billboard_bids (billboard_id) where status = 'active';
create index billboard_bids_status_idx on billboard_bids (status, created_at);

create table billboard_private (
  bid_id uuid primary key references billboard_bids (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  credit_paid boolean not null default false,
  created_at timestamptz not null default now()
);
create index billboard_private_user_idx on billboard_private (user_id, created_at);

create table billboard_payments (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references billboard_bids (id) on delete cascade,
  external_reference text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  mp_payment_id text,
  state text not null default 'creating' check (state in ('creating', 'pending', 'dead')),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index billboard_payments_open_idx on billboard_payments (bid_id) where state in ('creating', 'pending');
create unique index billboard_payments_settled_idx on billboard_payments (bid_id) where settled;

alter table billboard_bids enable row level security;
alter table billboard_private enable row level security;
alter table billboard_payments enable row level security;

-- Público: lance ativo (o que está no ar) e os que saíram (o Realtime avisa pra retirar da tela).
create policy "lances públicos" on billboard_bids
  for select to anon, authenticated using (status in ('active', 'outbid', 'refunded'));
revoke all on billboard_bids, billboard_private, billboard_payments from anon, authenticated;
grant select on billboard_bids to anon, authenticated;

-- O saldo pode ficar NEGATIVO (dívida): estorno/contestação de um Pix cujo crédito já foi gasto.
-- Quem está devendo não dá lance nem paga com crédito até quitar (bid_create / bid_pay_with_credit).
alter table user_credits drop constraint if exists user_credits_balance_cents_check;

-- Menor lance aceito agora: piso R$ 20 ou o ativo + max(R$ 5, 10%).
create or replace function bid_minimum(p_board text)
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce(
    (select greatest(2000, b.amount_cents + greatest(500, ceil(b.amount_cents * 0.1)::int))
       from public.billboard_bids b where b.billboard_id = p_board and b.status = 'active'),
    2000);
$$;
revoke all on function bid_minimum(text) from public;
grant execute on function bid_minimum(text) to anon, authenticated, service_role;

create or replace function bid_create(p_user uuid, p_board text, p_text text, p_color text, p_amount integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_open int; v_day int; v_min int;
begin
  perform pg_advisory_xact_lock(hashtext('bid:' || p_user::text));
  if coalesce((select balance_cents from public.user_credits where user_id = p_user), 0) < 0 then
    raise exception 'credit_debt';
  end if;
  v_min := public.bid_minimum(p_board);
  if p_amount < v_min then raise exception 'bid_too_low:%', v_min; end if;
  select count(*) into v_open from public.billboard_private p
    join public.billboard_bids b on b.id = p.bid_id
    where p.user_id = p_user and b.status in ('review', 'awaiting_payment')
      and b.created_at > now() - interval '24 hours';
  if v_open >= 3 then raise exception 'too_many_open'; end if;
  select count(*) into v_day from public.billboard_private
    where user_id = p_user and created_at > now() - interval '24 hours';
  if v_day >= 10 then raise exception 'too_many_daily'; end if;
  insert into public.billboard_bids (billboard_id, text, color, amount_cents)
    values (p_board, p_text, p_color, p_amount) returning id into v_id;
  insert into public.billboard_private (bid_id, user_id) values (v_id, p_user);
  return v_id;
end $$;
revoke all on function bid_create(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function bid_create(uuid, text, text, text, integer) to service_role;

create or replace function credit_add(p_user uuid, p_cents integer)
returns void language sql security definer set search_path = '' as $$
  insert into public.user_credits (user_id, balance_cents) values (p_user, p_cents)
  on conflict (user_id) do update set balance_cents = public.user_credits.balance_cents + excluded.balance_cents;
$$;
revoke all on function credit_add(uuid, integer) from public, anon, authenticated;

-- Obs.: se dois lances correm, vence o de maior valor; o incremento mínimo (bid_minimum) é exigido no envio e
-- no pagamento — numa corrida, um lance entre o atual e o atual + incremento ainda pode vencer (aceito).
-- Quita um lance (Pix confirmado ou crédito): vira o ativo e o anterior é superado e vira crédito.
-- Se outro lance maior entrou antes, ESTE é superado na hora e o valor volta como crédito.
create or replace function bid_settle(p_bid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_bid public.billboard_bids; v_cur public.billboard_bids; v_user uuid; v_board text;
begin
  -- Ordem de travas SEMPRE: telão (advisory) → lance → crédito. Evita deadlock entre Pix e crédito.
  select billboard_id into v_board from public.billboard_bids where id = p_bid;
  if v_board is null then return 'skip'; end if;
  perform pg_advisory_xact_lock(hashtext('bb:' || v_board));
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
revoke all on function bid_settle(uuid) from public, anon, authenticated;
grant execute on function bid_settle(uuid) to service_role;

-- Estorno do Pix de um lance quitado: sai do ar e, se já tinha virado crédito, o crédito é retirado.
create or replace function bid_refund(p_bid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bid public.billboard_bids; v_user uuid; v_bal integer; v_board text;
begin
  select billboard_id into v_board from public.billboard_bids where id = p_bid;
  if v_board is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('bb:' || v_board));
  select * into v_bid from public.billboard_bids where id = p_bid for update;
  if not found or v_bid.status not in ('active', 'outbid') then return; end if;
  update public.billboard_bids set status = 'refunded' where id = p_bid;
  if v_bid.status = 'outbid' then
    select user_id into v_user from public.billboard_private where bid_id = p_bid;
    select balance_cents into v_bal from public.user_credits where user_id = v_user for update;
    v_bal := coalesce(v_bal, 0);
    update public.user_credits set balance_cents = v_bal - v_bid.amount_cents where user_id = v_user;
    -- Crédito já gasto: o saldo fica negativo (dívida) e o valor é registrado (auditoria).
    if v_bal < v_bid.amount_cents then
      insert into public.moderation_log (actor, target, action, reason)
        values (null, 'bid:' || p_bid, 'credit_shortfall', (v_bid.amount_cents - v_bal)::text);
    end if;
  end if;
end $$;
revoke all on function bid_refund(uuid) from public, anon, authenticated;
grant execute on function bid_refund(uuid) to service_role;

-- Pagar com crédito (saldo cobre o lance inteiro; sem Pix).
create or replace function bid_pay_with_credit(p_bid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_bid public.billboard_bids; v_bal integer; v_board text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  -- Mesma ordem de travas do bid_settle: telão primeiro.
  select b.billboard_id into v_board from public.billboard_bids b
    join public.billboard_private p on p.bid_id = b.id where b.id = p_bid and p.user_id = auth.uid();
  if v_board is null then raise exception 'not_found'; end if;
  perform pg_advisory_xact_lock(hashtext('bb:' || v_board));
  select b.* into v_bid from public.billboard_bids b
    join public.billboard_private p on p.bid_id = b.id
    where b.id = p_bid and p.user_id = auth.uid() for update of b;
  if not found then raise exception 'not_found'; end if;
  if v_bid.status <> 'awaiting_payment' then raise exception 'not_approved'; end if;
  if v_bid.amount_cents < public.bid_minimum(v_bid.billboard_id) then raise exception 'bid_too_low'; end if;
  select balance_cents into v_bal from public.user_credits where user_id = auth.uid() for update;
  if coalesce(v_bal, 0) < v_bid.amount_cents then raise exception 'no_credit'; end if;
  update public.user_credits set balance_cents = balance_cents - v_bid.amount_cents where user_id = auth.uid();
  update public.billboard_private set credit_paid = true where bid_id = p_bid;
  return public.bid_settle(p_bid);
end $$;

create or replace function my_bids()
returns table (id uuid, billboard_id text, text text, color text, amount_cents integer, status text, created_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select b.id, b.billboard_id, b.text, b.color, b.amount_cents, b.status, b.created_at
  from public.billboard_bids b join public.billboard_private p on p.bid_id = b.id
  where p.user_id = auth.uid()
  order by b.created_at desc limit 10;
$$;

create or replace function my_credit()
returns integer language sql security definer set search_path = '' stable as $$
  select coalesce((select balance_cents from public.user_credits where user_id = auth.uid()), 0);
$$;

create or replace function bid_queue()
returns table (id uuid, billboard_id text, text text, color text, amount_cents integer, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select b.id, b.billboard_id, b.text, b.color, b.amount_cents, b.status, b.created_at
    from public.billboard_bids b where b.status = 'review'
    order by b.created_at asc limit 50;
end $$;

create or replace function moderate_bid(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.billboard_bids
    set status = case when p_approve then 'awaiting_payment' else 'rejected' end
    where id = p_id and status = 'review';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'already_moderated'; end if;
  update public.billboard_private set reviewed_by = auth.uid(), reviewed_at = now() where bid_id = p_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'bid:' || p_id,
            case when p_approve then 'bid_approved' else 'bid_rejected' end, p_reason);
end $$;

revoke all on function bid_pay_with_credit(uuid), my_bids(), my_credit(), bid_queue(), moderate_bid(uuid, boolean, text) from public, anon;
grant execute on function bid_pay_with_credit(uuid), my_bids(), my_credit(), bid_queue(), moderate_bid(uuid, boolean, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'billboard_bids') then
    alter publication supabase_realtime add table billboard_bids;
  end if;
end $$;
