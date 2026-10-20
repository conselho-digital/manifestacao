-- Superchat: fila de moderação → cobrança Pix → exibição.
-- Fluxo: review → awaiting_payment (admin aprova) → paid (webhook) | rejected | refunded.
--
-- Desenho de segurança:
--  * `superchats` guarda SÓ o que é público (nome, mensagem, valor, status) — é o
--    que o Realtime entrega. Dados internos (autor, revisor, pagamentos) ficam em
--    tabelas sem policy (acesso só via service_role / RPCs security definer).
--  * Cliente nunca escreve direto: criar = Edge Function; moderar = RPC de admin;
--    ler os próprios/fila = RPCs.

-- A tabela do 0001 nunca foi usada pelo app (sem código até a Fase 4): é recriada
-- com o desenho novo. Se já houver linhas em produção, exporte antes de aplicar.
drop table if exists superchats cascade;

create table superchats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 200),
  amount_cents integer not null check (amount_cents between 500 and 20000),
  status text not null default 'review'
    check (status in ('review', 'awaiting_payment', 'paid', 'rejected', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index superchats_status_idx on superchats (status, created_at);

create table superchat_private (
  superchat_id uuid primary key references superchats (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index superchat_private_user_idx on superchat_private (user_id, created_at);

-- Cada tentativa de cobrança Pix. Várias por superchat (a anterior pode expirar);
-- no máximo UMA aberta por vez (índice parcial) — fecha a corrida de cliques duplos.
create table superchat_payments (
  id uuid primary key default gen_random_uuid(),
  superchat_id uuid not null references superchats (id) on delete cascade,
  external_reference text not null unique,
  amount_cents integer not null check (amount_cents > 0),
  mp_payment_id text,
  state text not null default 'creating' check (state in ('creating', 'pending', 'dead')),
  -- Tentativa que de fato quitou o superchat (no máximo uma; as demais pagas viram estorno).
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index superchat_payments_open_idx on superchat_payments (superchat_id)
  where state in ('creating', 'pending');

create unique index superchat_payments_settled_idx on superchat_payments (superchat_id) where settled;

alter table superchats enable row level security;
alter table superchat_private enable row level security;
alter table superchat_payments enable row level security;

-- Público: só superchats pagos — e os estornados, pra o Realtime avisar e o banner retirar.
create policy "superchats pagos públicos" on superchats
  for select to anon, authenticated using (status in ('paid', 'refunded'));
-- superchat_private / superchat_payments: sem policy = só service_role e RPCs.
revoke all on superchats, superchat_private, superchat_payments from anon, authenticated;
grant select on superchats to anon, authenticated;

-- Criação (Edge Function, service_role): limites atômicos por usuário.
create or replace function superchat_create(p_user uuid, p_name text, p_message text, p_amount integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_open int; v_day int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select count(*) into v_open from public.superchat_private p
    join public.superchats s on s.id = p.superchat_id
    where p.user_id = p_user and s.status in ('review', 'awaiting_payment')
      and s.created_at > now() - interval '24 hours'; -- aprovado e abandonado expira da contagem
  if v_open >= 3 then raise exception 'too_many_open'; end if;
  select count(*) into v_day from public.superchat_private
    where user_id = p_user and created_at > now() - interval '24 hours';
  if v_day >= 10 then raise exception 'too_many_daily'; end if;
  insert into public.superchats (name, message, amount_cents) values (p_name, p_message, p_amount)
    returning id into v_id;
  insert into public.superchat_private (superchat_id, user_id) values (v_id, p_user);
  return v_id;
end $$;
revoke all on function superchat_create(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function superchat_create(uuid, text, text, integer) to service_role;

-- Os superchats do usuário logado.
create or replace function my_superchats()
returns table (id uuid, name text, message text, amount_cents integer, status text, created_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select s.id, s.name, s.message, s.amount_cents, s.status, s.created_at
  from public.superchats s join public.superchat_private p on p.superchat_id = s.id
  where p.user_id = auth.uid()
  order by s.created_at desc limit 10;
$$;

-- Fila de moderação (admin).
create or replace function superchat_queue()
returns table (id uuid, name text, message text, amount_cents integer, status text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select s.id, s.name, s.message, s.amount_cents, s.status, s.created_at
    from public.superchats s where s.status = 'review'
    order by s.created_at asc limit 50;
end $$;

-- Moderar: só 'review' → awaiting_payment | rejected; revisor e log na MESMA transação.
create or replace function moderate_superchat(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.superchats
    set status = case when p_approve then 'awaiting_payment' else 'rejected' end
    where id = p_id and status = 'review';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'already_moderated'; end if;
  update public.superchat_private set reviewed_by = auth.uid(), reviewed_at = now() where superchat_id = p_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'superchat:' || p_id,
            case when p_approve then 'superchat_approved' else 'superchat_rejected' end, p_reason);
end $$;

revoke all on function my_superchats(), superchat_queue(), moderate_superchat(uuid, boolean, text) from public, anon;
grant execute on function my_superchats(), superchat_queue(), moderate_superchat(uuid, boolean, text) to authenticated;

-- Realtime (postgres_changes) para exibir superchats pagos na hora.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'superchats') then
    alter publication supabase_realtime add table superchats;
  end if;
end $$;
