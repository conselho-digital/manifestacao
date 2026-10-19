-- Painel de admin: configuração do jogo (equipes, bandeiras, modelos 3D) e
-- edição do catálogo. Quem é admin é decidido AQUI, no banco (nunca pelo
-- cliente): a lista de e-mails abaixo + a função is_admin() usada nas
-- policies de RLS e no bucket de arquivos.

-- E-mails de admin. RLS ligada e SEM policy: o cliente não lê nem escreve
-- esta tabela; só a função is_admin() (security definer) a consulta.
create table if not exists admin_emails (
  email text primary key check (email = lower(email))
);
alter table admin_emails enable row level security;

insert into admin_emails (email) values ('felipepmoraes1a@gmail.com')
on conflict do nothing;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  -- Só vale para login pelo Google (único provedor do projeto): uma conta
  -- criada por outro meio com o mesmo e-mail nunca vira admin.
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google';
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

-- Configuração do jogo: uma linha por seção (teams, flags, models), valor
-- em JSON. Leitura pública (todos os jogadores precisam); escrita só admin.
create table if not exists game_config (
  key text primary key check (key in ('teams', 'flags', 'models')),
  value jsonb not null check (pg_column_size(value) < 32768),
  updated_at timestamptz not null default now()
);
alter table game_config enable row level security;

create policy "config pública" on game_config for select using (true);
create policy "config admin insere" on game_config for insert with check (is_admin());
create policy "config admin atualiza" on game_config for update using (is_admin()) with check (is_admin());
create policy "config admin apaga" on game_config for delete using (is_admin());

-- Catálogo: admin edita nome/preço/ativo (a cobrança lê o preço daqui).
create policy "catálogo admin lê tudo" on catalog_items for select using (is_admin());
create policy "catálogo admin atualiza" on catalog_items
  for update using (is_admin()) with check (is_admin());

-- Bucket público de modelos 3D (.glb). Leitura pública; escrita só admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-assets', 'game-assets', true, 15728640,
        array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "assets admin envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'game-assets' and is_admin());
create policy "assets admin atualiza" on storage.objects
  for update to authenticated using (bucket_id = 'game-assets' and is_admin());
create policy "assets admin apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'game-assets' and is_admin());
