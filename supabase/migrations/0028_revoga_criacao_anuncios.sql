-- Criar cartaz/lance só pelas Edge Functions (service_role): elas checam sanção, conteúdo e imagem.
-- Antes, qualquer usuário logado podia chamar estas funções direto e pular as checagens.
revoke execute on function public.sign_create_v2(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.bid_create_v2(uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.sign_create_v2(uuid, text, text, text) to service_role;
grant execute on function public.bid_create_v2(uuid, text, text, text, integer, text) to service_role;
