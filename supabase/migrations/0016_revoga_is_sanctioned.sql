-- is_sanctioned é só para as Edge Functions (service_role): usuários logados não consultam sanção alheia.
revoke execute on function public.is_sanctioned(uuid, text[]) from public, anon, authenticated;
grant execute on function public.is_sanctioned(uuid, text[]) to service_role;
