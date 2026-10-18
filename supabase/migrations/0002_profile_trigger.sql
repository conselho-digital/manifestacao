-- Cria automaticamente um profile quando um usuário entra via Supabase Auth
-- (login só Google). O apelido inicial vem do nome do Google (sugestão
-- editável); o google_sub vem do provedor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, google_sub, nickname)
  values (
    new.id,
    new.raw_user_meta_data ->> 'provider_id',
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      'Anônimo'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
