-- Personagens criados na ferramenta /personagens (migração `custom_characters`, já aplicada): cabeças 3D novas, receitas e fotos de rosto.
-- Todos leem; só o admin (public.is_admin()) cria, troca e apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chars', 'chars', true, 3145728, array['model/gltf-binary','application/octet-stream','image/webp','image/png'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['model/gltf-binary','application/octet-stream','image/webp','image/png'];
create policy "chars visiveis" on storage.objects for select to anon, authenticated using (bucket_id = 'chars');
create policy "admin envia chars" on storage.objects for insert to authenticated with check (bucket_id = 'chars' and public.is_admin());
create policy "admin troca chars" on storage.objects for update to authenticated using (bucket_id = 'chars' and public.is_admin()) with check (bucket_id = 'chars' and public.is_admin());
create policy "admin apaga chars" on storage.objects for delete to authenticated using (bucket_id = 'chars' and public.is_admin());

create table if not exists public.custom_heads (
  id text primary key check (id ~ '^h_[a-z0-9]{4,16}$'),
  name text not null check (char_length(name) between 1 and 30),
  url text not null check (url like 'https://%'),
  created_at timestamptz not null default now()
);
create table if not exists public.custom_characters (
  id text primary key check (id ~ '^c_[a-z0-9]{4,16}$'),
  name text not null check (char_length(name) between 1 and 24),
  recipe jsonb not null,
  face_url text not null check (face_url like 'https://%'),
  created_at timestamptz not null default now()
);
alter table public.custom_heads enable row level security;
alter table public.custom_characters enable row level security;
create policy "cabecas visiveis" on public.custom_heads for select to anon, authenticated using (true);
create policy "personagens visiveis" on public.custom_characters for select to anon, authenticated using (true);
create policy "admin cabecas" on public.custom_heads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin personagens" on public.custom_characters for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.custom_heads, public.custom_characters to anon, authenticated;
grant insert, update, delete on public.custom_heads, public.custom_characters to authenticated;
