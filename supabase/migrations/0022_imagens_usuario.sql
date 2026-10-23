-- Imagens enviadas por jogadores: bandeira própria, cartaz e telão com imagem. Tudo passa por moderação ANTES de aparecer
-- para os outros. Arquivos num bucket público com nomes aleatórios (<id-do-usuário>/<uuid>.webp); só o dono grava.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-media', 'user-media', true, 600000, array['image/webp'])
on conflict (id) do nothing;

create policy "media: logado envia na própria pasta" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select count(*) from storage.objects o
         where o.bucket_id = 'user-media' and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day') < 12
  );
create policy "media: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'user-media' and owner_id = auth.uid()::text);

-- ── Bandeira própria (uma por jogador) ───────────────────────────────────
create table public.custom_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  status text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.custom_flags enable row level security;
revoke all on public.custom_flags from anon, authenticated;
-- Os outros jogadores só enxergam bandeiras APROVADAS, e só id e caminho (nunca de quem é).
grant select (id, image_path, status) on public.custom_flags to authenticated;
create policy "bandeiras aprovadas" on public.custom_flags for select to authenticated using (status = 'approved');

create or replace function public.flag_submit(p_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_path is null or p_path not like auth.uid()::text || '/%' then raise exception 'path_invalid'; end if;
  if public.is_sanctioned(auth.uid(), array['mute', 'ban']) then raise exception 'sanctioned'; end if;
  if exists (select 1 from public.custom_flags where user_id = auth.uid() and status = 'review' and created_at > now() - interval '10 minutes') then
    raise exception 'too_fast';
  end if;
  insert into public.custom_flags (user_id, image_path) values (auth.uid(), p_path)
    on conflict (user_id) do update
      set image_path = excluded.image_path, status = 'review', reviewed_by = null, reviewed_at = null, created_at = now()
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.my_flag()
returns table (id uuid, image_path text, status text)
language sql security definer set search_path = '' stable as $$
  select f.id, f.image_path, f.status from public.custom_flags f where f.user_id = auth.uid();
$$;

create or replace function public.flag_queue()
returns table (id uuid, image_path text, nickname text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select f.id, f.image_path, p.nickname, f.created_at
    from public.custom_flags f left join public.profiles p on p.id = f.user_id
    where f.status = 'review' order by f.created_at asc limit 50;
end $$;

create or replace function public.moderate_flag(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.custom_flags
    set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id and status = 'review';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'already_moderated'; end if;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'flag:' || p_id, case when p_approve then 'flag_approved' else 'flag_rejected' end, p_reason);
end $$;

-- ── Cartaz e telão com imagem ────────────────────────────────────────────
alter table public.custom_signs
  add column image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
alter table public.custom_signs drop constraint custom_signs_text_check1;
alter table public.custom_signs
  add constraint custom_signs_text_len check (char_length(text) <= 40 and (char_length(text) >= 1 or image_path is not null));

alter table public.billboard_bids
  add column image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');
alter table public.billboard_bids drop constraint billboard_bids_text_check;
alter table public.billboard_bids
  add constraint billboard_bids_text_len check (char_length(text) <= 60 and (char_length(text) >= 1 or image_path is not null));

create or replace function public.sign_create_v2(p_user uuid, p_text text, p_color text, p_image text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_open int; v_day int;
begin
  if p_image is not null and p_image not like p_user::text || '/%' then raise exception 'path_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('sign:' || p_user::text));
  select count(*) into v_open from public.sign_private p
    join public.custom_signs s on s.id = p.sign_id
    where p.user_id = p_user and s.status in ('review', 'awaiting_payment') and s.created_at > now() - interval '24 hours';
  if v_open >= 2 then raise exception 'too_many_open'; end if;
  select count(*) into v_day from public.sign_private where user_id = p_user and created_at > now() - interval '24 hours';
  if v_day >= 5 then raise exception 'too_many_daily'; end if;
  insert into public.custom_signs (text, color, image_path) values (p_text, p_color, p_image) returning id into v_id;
  insert into public.sign_private (sign_id, user_id) values (v_id, p_user);
  return v_id;
end $$;

create or replace function public.bid_create_v2(p_user uuid, p_board text, p_text text, p_color text, p_amount integer, p_image text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_open int; v_day int; v_min int;
begin
  if p_image is not null and p_image not like p_user::text || '/%' then raise exception 'path_invalid'; end if;
  perform pg_advisory_xact_lock(hashtext('bid:' || p_user::text));
  if coalesce((select balance_cents from public.user_credits where user_id = p_user), 0) < 0 then raise exception 'credit_debt'; end if;
  v_min := public.bid_minimum(p_board);
  if p_amount < v_min then raise exception 'bid_too_low:%', v_min; end if;
  select count(*) into v_open from public.billboard_private p
    join public.billboard_bids b on b.id = p.bid_id
    where p.user_id = p_user and b.status in ('review', 'awaiting_payment') and b.created_at > now() - interval '24 hours';
  if v_open >= 3 then raise exception 'too_many_open'; end if;
  select count(*) into v_day from public.billboard_private where user_id = p_user and created_at > now() - interval '24 hours';
  if v_day >= 10 then raise exception 'too_many_daily'; end if;
  insert into public.billboard_bids (billboard_id, text, color, amount_cents, image_path)
    values (p_board, p_text, p_color, p_amount, p_image) returning id into v_id;
  insert into public.billboard_private (bid_id, user_id) values (v_id, p_user);
  return v_id;
end $$;

-- Admin: caminhos das imagens dos itens da fila (cartaz e telão), para mostrar a prévia na moderação.
create or replace function public.admin_media_paths(p_ids uuid[])
returns table (id uuid, image_path text)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select s.id, s.image_path from public.custom_signs s where s.id = any (p_ids) and s.image_path is not null
    union all
    select b.id, b.image_path from public.billboard_bids b where b.id = any (p_ids) and b.image_path is not null;
end $$;

revoke all on function public.flag_submit(text), public.my_flag(), public.flag_queue(), public.moderate_flag(uuid, boolean, text),
  public.sign_create_v2(uuid, text, text, text), public.bid_create_v2(uuid, text, text, text, integer, text), public.admin_media_paths(uuid[])
  from public, anon;
grant execute on function public.flag_submit(text), public.my_flag(), public.flag_queue(), public.moderate_flag(uuid, boolean, text),
  public.admin_media_paths(uuid[]) to authenticated;
grant execute on function public.sign_create_v2(uuid, text, text, text), public.bid_create_v2(uuid, text, text, text, integer, text) to service_role;
