-- Moderação (Fase 5): silenciar e banir contas. Tudo pelo painel admin (RPCs); o cliente só lê as próprias sanções.
-- Sanção é por CONTA (Google): vale mais que IP cru, que não guardamos (LGPD).

create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('mute', 'ban')),
  reason text check (reason is null or char_length(reason) <= 200),
  expires_at timestamptz,            -- null = permanente
  lifted_at timestamptz,             -- preenchido quando um admin levanta a sanção
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sanctions_active_idx on public.sanctions (user_id, kind) where lifted_at is null;

alter table public.sanctions enable row level security;
revoke all on public.sanctions from anon, authenticated;   -- sem policy: só as funções abaixo (security definer)

-- Sanções ativas de quem chama (o cliente bloqueia chat/entrada com isto).
create or replace function public.my_sanctions()
returns table (kind text, reason text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.kind, s.reason, s.expires_at
  from public.sanctions s
  where s.user_id = auth.uid() and s.lifted_at is null and (s.expires_at is null or s.expires_at > now());
$$;

-- Admin: procura contas por apelido ou e-mail.
create or replace function public.admin_find_users(p_q text)
returns table (id uuid, nickname text, email text, muted boolean, banned boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if char_length(v_q) < 2 then return; end if;
  return query
    select p.id, p.nickname, u.email::text,
      exists (select 1 from public.sanctions s where s.user_id = p.id and s.kind = 'mute' and s.lifted_at is null and (s.expires_at is null or s.expires_at > now())),
      exists (select 1 from public.sanctions s where s.user_id = p.id and s.kind = 'ban' and s.lifted_at is null and (s.expires_at is null or s.expires_at > now()))
    from public.profiles p join auth.users u on u.id = p.id
    where p.nickname ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%'
    order by p.nickname
    limit 20;
end $$;

-- Admin: aplica silêncio (minutos obrigatórios, até 30 dias) ou banimento (minutos nulo = permanente).
create or replace function public.admin_sanction(p_user uuid, p_kind text, p_minutes integer, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_exp timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_kind not in ('mute', 'ban') then raise exception 'kind_invalid'; end if;
  if p_user = auth.uid() then raise exception 'self_not_allowed'; end if;
  if exists (select 1 from auth.users u join public.admin_emails a on lower(a.email) = lower(u.email) where u.id = p_user) then
    raise exception 'target_is_admin';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found'; end if;
  if p_minutes is null then
    if p_kind = 'mute' then raise exception 'minutes_required'; end if;
  elsif p_minutes < 1 or p_minutes > 43200 then
    raise exception 'minutes_invalid';
  else
    v_exp := now() + make_interval(mins => p_minutes);
  end if;
  -- uma sanção ativa por tipo: a nova substitui a anterior
  update public.sanctions set lifted_at = now() where user_id = p_user and kind = p_kind and lifted_at is null;
  insert into public.sanctions (user_id, kind, reason, expires_at, created_by)
    values (p_user, p_kind, nullif(left(trim(coalesce(p_reason, '')), 200), ''), v_exp, auth.uid())
    returning id into v_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), p_user::text, p_kind, left(coalesce(p_reason, ''), 200) || case when v_exp is null then ' [permanente]' else ' [até ' || v_exp::text || ']' end);
  return v_id;
end $$;

-- Admin: levanta uma sanção.
create or replace function public.admin_lift_sanction(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_kind text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.sanctions set lifted_at = now() where id = p_id and lifted_at is null returning user_id, kind into v_user, v_kind;
  if v_user is null then return false; end if;
  insert into public.moderation_log (actor, target, action, reason) values (auth.uid(), v_user::text, 'lift_' || v_kind, null);
  return true;
end $$;

-- Admin: sanções ativas agora.
create or replace function public.admin_list_sanctions()
returns table (id uuid, user_id uuid, nickname text, email text, kind text, reason text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select s.id, s.user_id, p.nickname, u.email::text, s.kind, s.reason, s.expires_at, s.created_at
    from public.sanctions s
    left join public.profiles p on p.id = s.user_id
    left join auth.users u on u.id = s.user_id
    where s.lifted_at is null and (s.expires_at is null or s.expires_at > now())
    order by s.created_at desc
    limit 100;
end $$;

-- Admin: últimas ações de moderação.
create or replace function public.admin_moderation_log()
returns table (created_at timestamptz, actor_nickname text, target text, action text, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select l.created_at, p.nickname, coalesce(t.nickname, l.target), l.action, l.reason
    from public.moderation_log l
    left join public.profiles p on p.id = l.actor
    left join public.profiles t on t.id::text = l.target
    order by l.created_at desc
    limit 50;
end $$;

-- Usado pelas Edge Functions (service_role): a conta está silenciada/banida agora?
create or replace function public.is_sanctioned(p_user uuid, p_kinds text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sanctions s
    where s.user_id = p_user and s.kind = any (p_kinds) and s.lifted_at is null and (s.expires_at is null or s.expires_at > now())
  );
$$;

revoke all on function public.my_sanctions(), public.admin_find_users(text), public.admin_sanction(uuid, text, integer, text),
  public.admin_lift_sanction(uuid), public.admin_list_sanctions(), public.admin_moderation_log(), public.is_sanctioned(uuid, text[])
  from public, anon;
grant execute on function public.my_sanctions(), public.admin_find_users(text), public.admin_sanction(uuid, text, integer, text),
  public.admin_lift_sanction(uuid), public.admin_list_sanctions(), public.admin_moderation_log() to authenticated;
grant execute on function public.is_sanctioned(uuid, text[]) to service_role;
