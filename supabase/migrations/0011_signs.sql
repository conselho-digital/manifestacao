-- Cartazes personalizados: texto curto + cor, moderados ANTES de cobrar e de exibir.
-- Fluxo: review → awaiting_payment (admin aprova) → active (Pix confirmado) | rejected | refunded.
-- Mesmo desenho do superchat: tabela pública só com o que é de todos; autor e
-- pagamentos em tabelas privadas; escrita só por Edge Function/RPC.

-- A tabela do 0001 nunca foi usada pelo app: é renomeada (sem apagar nada) e fechada para o cliente.
alter table custom_signs rename to custom_signs_legacy_0001;
alter table custom_signs_legacy_0001 rename constraint custom_signs_pkey to custom_signs_legacy_0001_pkey;
alter index custom_signs_status_idx rename to custom_signs_legacy_0001_status_idx;
revoke all on custom_signs_legacy_0001 from anon, authenticated;

create table custom_signs (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 40),
  color text not null check (color in ('#f8f9fa', '#ffd43b', '#51cf66', '#4dabf7', '#ff6b6b', '#b197fc')),
  status text not null default 'review'
    check (status in ('review', 'awaiting_payment', 'active', 'rejected', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index custom_signs_status_idx on custom_signs (status, created_at);

create table sign_private (
  sign_id uuid primary key references custom_signs (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sign_private_user_idx on sign_private (user_id, created_at);

create table sign_payments (
  id uuid primary key default gen_random_uuid(),
  sign_id uuid not null references custom_signs (id) on delete cascade,
  external_reference text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  mp_payment_id text,
  state text not null default 'creating' check (state in ('creating', 'pending', 'dead')),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index sign_payments_open_idx on sign_payments (sign_id) where state in ('creating', 'pending');
create unique index sign_payments_settled_idx on sign_payments (sign_id) where settled;

alter table custom_signs enable row level security;
alter table sign_private enable row level security;
alter table sign_payments enable row level security;

-- Público: cartazes ATIVOS (pagos) — é contra isso que os outros jogadores validam o que veem — e os
-- estornados (o Realtime avisa para retirar da cena).
create policy "cartazes ativos públicos" on custom_signs
  for select to anon, authenticated using (status in ('active', 'refunded'));
revoke all on custom_signs, sign_private, sign_payments from anon, authenticated;
grant select on custom_signs to anon, authenticated;

create or replace function sign_create(p_user uuid, p_text text, p_color text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_open int; v_day int;
begin
  perform pg_advisory_xact_lock(hashtext('sign:' || p_user::text));
  select count(*) into v_open from public.sign_private p
    join public.custom_signs s on s.id = p.sign_id
    where p.user_id = p_user and s.status in ('review', 'awaiting_payment')
      and s.created_at > now() - interval '24 hours';
  if v_open >= 2 then raise exception 'too_many_open'; end if;
  select count(*) into v_day from public.sign_private
    where user_id = p_user and created_at > now() - interval '24 hours';
  if v_day >= 5 then raise exception 'too_many_daily'; end if;
  insert into public.custom_signs (text, color) values (p_text, p_color) returning id into v_id;
  insert into public.sign_private (sign_id, user_id) values (v_id, p_user);
  return v_id;
end $$;
revoke all on function sign_create(uuid, text, text) from public, anon, authenticated;
grant execute on function sign_create(uuid, text, text) to service_role;

create or replace function my_signs()
returns table (id uuid, text text, color text, status text, created_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.id, s.text, s.color, s.status, s.created_at
  from public.custom_signs s join public.sign_private p on p.sign_id = s.id
  where p.user_id = auth.uid()
  order by s.created_at desc limit 10;
$$;

create or replace function sign_queue()
returns table (id uuid, text text, color text, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select s.id, s.text, s.color, s.status, s.created_at
    from public.custom_signs s where s.status = 'review'
    order by s.created_at asc limit 50;
end $$;

create or replace function moderate_sign(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.custom_signs
    set status = case when p_approve then 'awaiting_payment' else 'rejected' end
    where id = p_id and status = 'review';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'already_moderated'; end if;
  update public.sign_private set reviewed_by = auth.uid(), reviewed_at = now() where sign_id = p_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'sign:' || p_id,
            case when p_approve then 'sign_approved' else 'sign_rejected' end, p_reason);
end $$;

revoke all on function my_signs(), sign_queue(), moderate_sign(uuid, boolean, text) from public, anon;
grant execute on function my_signs(), sign_queue(), moderate_sign(uuid, boolean, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'custom_signs') then
    alter publication supabase_realtime add table custom_signs;
  end if;
end $$;
