-- Cartazes das vitrines (migração `posters`, já aplicada no projeto): bucket público "posters" (um arquivo webp por vaga) e tabela com o endereço de cada vaga.
-- Todos leem; só o admin (public.is_admin()) envia, troca e apaga. Realtime ligado na tabela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 716800, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 716800, allowed_mime_types = array['image/webp','image/png','image/jpeg'];
create policy "cartazes visiveis para todos" on storage.objects for select to anon, authenticated using (bucket_id = 'posters');
create policy "admin envia cartaz" on storage.objects for insert to authenticated with check (bucket_id = 'posters' and public.is_admin());
create policy "admin troca cartaz" on storage.objects for update to authenticated using (bucket_id = 'posters' and public.is_admin()) with check (bucket_id = 'posters' and public.is_admin());
create policy "admin apaga cartaz" on storage.objects for delete to authenticated using (bucket_id = 'posters' and public.is_admin());
create table if not exists public.posters (
  slot_id text primary key check (slot_id ~ '^[A-Za-z0-9_]{1,40}$'),
  url text not null check (url like 'https://%'),
  updated_at timestamptz not null default now()
);
alter table public.posters enable row level security;
create policy "cartazes visiveis" on public.posters for select to anon, authenticated using (true);
create policy "admin insere cartaz" on public.posters for insert to authenticated with check (public.is_admin());
create policy "admin altera cartaz" on public.posters for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin apaga cartaz linha" on public.posters for delete to authenticated using (public.is_admin());
grant select on public.posters to anon, authenticated;
grant insert, update, delete on public.posters to authenticated;
alter publication supabase_realtime add table public.posters;
