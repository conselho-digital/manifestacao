-- A cota diária de uploads contava linhas de storage.objects com o RLS do próprio usuário; sem policy de SELECT o
-- resultado era sempre 0 e a cota nunca bloqueava. Agora a contagem roda numa função security definer.
create or replace function public.my_uploads_today() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'user-media' and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day';
$$;
revoke all on function public.my_uploads_today() from public, anon;
grant execute on function public.my_uploads_today() to authenticated;

drop policy if exists "media: logado envia na própria pasta" on storage.objects;
create policy "media: logado envia na própria pasta" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_uploads_today() < 12
  );
