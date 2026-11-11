-- Grafite por equipe + outdoor da praça. Migração `graffiti_and_billboard` (aplicar no projeto Supabase).

-- Grafite por equipe: endereço da imagem (arquivo webp no bucket público "graffiti")
alter table public.teams add column if not exists graffiti_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('graffiti', 'graffiti', true, 524288, array['image/webp','image/png'])
on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp','image/png'];

create policy "grafite visivel para todos" on storage.objects for select to anon, authenticated using (bucket_id = 'graffiti');
create policy "admin envia grafite" on storage.objects for insert to authenticated with check (bucket_id = 'graffiti' and public.is_admin());
create policy "admin troca grafite" on storage.objects for update to authenticated using (bucket_id = 'graffiti' and public.is_admin()) with check (bucket_id = 'graffiti' and public.is_admin());
create policy "admin apaga grafite" on storage.objects for delete to authenticated using (bucket_id = 'graffiti' and public.is_admin());

-- Outdoor da praça: uma linha só; o admin controla, todos veem (Realtime)
create table if not exists public.billboard (
  id int primary key default 1 check (id = 1),
  video_id text not null default '',
  live boolean not null default false,
  playing boolean not null default false,
  position double precision not null default 0,
  rate double precision not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.billboard (id) values (1) on conflict do nothing;
alter table public.billboard enable row level security;
create policy "outdoor visivel para todos" on public.billboard for select to anon, authenticated using (true);
create policy "admin altera outdoor" on public.billboard for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.billboard to anon, authenticated;
grant update on public.billboard to authenticated;

create or replace function public.billboard_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists billboard_touch on public.billboard;
create trigger billboard_touch before update on public.billboard for each row execute function public.billboard_touch();

-- hora do servidor (o navegador calcula a diferença do relógio dele)
create or replace function public.server_time() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_time() to anon, authenticated;

alter publication supabase_realtime add table public.billboard;
