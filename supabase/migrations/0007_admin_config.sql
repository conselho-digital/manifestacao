-- Painel de admin: configuração do jogo (equipes, bandeiras, modelos 3D) e
-- edição do catálogo. Quem é admin é decidido AQUI, no banco (nunca pelo
-- cliente): a lista de e-mails abaixo + a função is_admin() usada nas
-- policies de RLS e no bucket de arquivos.

-- E-mails de admin. RLS ligada e SEM policy: o cliente não lê nem escreve
-- esta tabela; só a função is_admin() (security definer) a consulta.
-- Os e-mails NÃO ficam nesta migration (ela vai pro git): cadastre-os por SQL
-- manual:  insert into admin_emails (email) values ('alguem@exemplo.com');
create table if not exists admin_emails (
  email text primary key check (email = lower(email))
);
alter table admin_emails enable row level security;

-- Admin = conta com identidade GOOGLE verificada cujo e-mail está na lista.
-- Usa auth.identities (o e-mail da identidade Google não muda se o usuário
-- trocar o e-mail da conta), e não o claim "email" do JWT, que é alterável.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.identities i
    join public.admin_emails a on a.email = lower(i.identity_data ->> 'email')
    where i.user_id = auth.uid()
      and i.provider = 'google'
      and coalesce((i.identity_data ->> 'email_verified')::boolean, false)
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Configuração do jogo: uma linha por seção (teams, flags, models), valor
-- em JSON. Leitura pública (todos os jogadores precisam); escrita só admin.
create table if not exists game_config (
  key text primary key check (key in ('teams', 'flags', 'models')),
  value jsonb not null check (pg_column_size(value) < 32768),
  updated_at timestamptz not null default now()
);
alter table game_config enable row level security;

create policy "config pública" on game_config for select using (true);
create policy "config admin insere" on game_config for insert to authenticated with check (public.is_admin());
create policy "config admin atualiza" on game_config for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "config admin apaga" on game_config for delete to authenticated using (public.is_admin());

-- Catálogo: admin edita nome/preço/ativo (a cobrança lê o preço daqui).
create policy "catálogo admin lê tudo" on catalog_items for select to authenticated using (public.is_admin());
create policy "catálogo admin atualiza" on catalog_items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bucket público de modelos 3D (.glb). Leitura pública; escrita só admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-assets', 'game-assets', true, 15728640,
        array['model/gltf-binary'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "assets admin envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'game-assets' and public.is_admin());
create policy "assets admin atualiza" on storage.objects
  for update to authenticated using (bucket_id = 'game-assets' and public.is_admin());
create policy "assets admin apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'game-assets' and public.is_admin());
