-- Schema inicial — Manifestação Online
-- Dados duráveis: contas, catálogo, pedidos, entitlements, créditos, conteúdo
-- do usuário e moderação. NÃO guardar aqui: chat, posições, pixações, IP cru.
--
-- RLS ligada em tudo. O cliente usa a chave ANÔNIMA e só enxerga o que as
-- políticas permitem. Escritas sensíveis (pedidos, entitlements, créditos)
-- são feitas pelas Edge Functions com a chave service_role, que ignora RLS.

-- Times permitidos (espelha packages/shared/teams.ts).
create type team_id as enum ('verde', 'roxo', 'neutro');

create type order_status as enum ('pending', 'paid', 'failed', 'refunded');
create type sign_status as enum ('pending', 'approved', 'rejected');
create type item_kind as enum ('flag', 'vehicle', 'object', 'sound', 'character', 'pass');

-- Perfil do jogador, 1:1 com auth.users (login só via Google).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  google_sub text unique,
  nickname text not null check (char_length(nickname) between 1 and 20),
  team team_id,
  created_at timestamptz not null default now()
);

create table avatars (
  user_id uuid primary key references profiles (id) on delete cascade,
  model_id text,
  team team_id,
  shirt integer,
  appearance jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Catálogo público de itens à venda.
create table catalog_items (
  id text primary key,
  kind item_kind not null,
  label text not null,
  price_cents integer not null check (price_cents >= 0),
  team_restriction team_id,
  active boolean not null default true
);

-- Pedidos (Pix/Mercado Pago). Idempotência por external_reference.
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  item_id text not null references catalog_items (id),
  amount_cents integer not null check (amount_cents >= 0),
  mp_payment_id text,
  external_reference text unique,
  status order_status not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Direitos concedidos (compra, passe, brinde).
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  item_id text not null references catalog_items (id),
  source text not null default 'purchase',
  granted_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create table user_credits (
  user_id uuid primary key references profiles (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0)
);

-- Cartazes personalizados (moderados antes de exibir/cobrar).
create table custom_signs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  image_url text,
  text text check (char_length(text) <= 200),
  status sign_status not null default 'pending',
  credit_used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Lances de telão (leilão). Lance superado vira crédito.
create table billboard_bids (
  id uuid primary key default gen_random_uuid(),
  billboard_id text not null,
  user_id uuid not null references profiles (id) on delete cascade,
  media_url text,
  link text,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Superchats (não exige conta; criados pela Edge Function após pagamento).
create table superchats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 40),
  message text not null check (char_length(message) <= 200),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table moderation_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references profiles (id),
  target text,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Índices úteis.
create index orders_user_idx on orders (user_id);
create index entitlements_user_idx on entitlements (user_id);
create index custom_signs_status_idx on custom_signs (status);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table avatars enable row level security;
alter table catalog_items enable row level security;
alter table orders enable row level security;
alter table entitlements enable row level security;
alter table user_credits enable row level security;
alter table custom_signs enable row level security;
alter table billboard_bids enable row level security;
alter table superchats enable row level security;
alter table moderation_log enable row level security;

-- Perfil/avatar: o dono lê e escreve o próprio registro.
create policy "perfil próprio" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "avatar próprio" on avatars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Catálogo: leitura pública (inclusive anônimo).
create policy "catálogo público" on catalog_items
  for select using (active);

-- Pedidos/entitlements/créditos: dono só LÊ; escrita é via service_role
-- (Edge Functions), que ignora RLS. Sem policy de insert/update para o cliente.
create policy "pedidos do dono" on orders
  for select using (auth.uid() = user_id);
create policy "entitlements do dono" on entitlements
  for select using (auth.uid() = user_id);
create policy "créditos do dono" on user_credits
  for select using (auth.uid() = user_id);

-- Cartazes: dono lê os seus; aprovados são lidos por todos.
create policy "cartazes do dono" on custom_signs
  for select using (auth.uid() = user_id or status = 'approved');
create policy "cria cartaz próprio" on custom_signs
  for insert with check (auth.uid() = user_id);

-- Lances ativos: leitura pública; criação via service_role após pagamento.
create policy "lances públicos" on billboard_bids
  for select using (true);

-- Superchats aprovados: leitura pública.
create policy "superchats aprovados" on superchats
  for select using (status = 'approved');

-- moderation_log: nenhuma policy para o cliente (acesso só via service_role).
