-- Perfil: o dono lê e atualiza só nickname/team; não apaga (apagar em cascata
-- destruiria pedidos/entitlements) nem troca google_sub. Criação é feita pelo
-- trigger handle_new_user (security definer), não pelo cliente.

drop policy if exists "perfil próprio" on profiles;
create policy "perfil lê próprio" on profiles for select using (auth.uid() = id);
create policy "perfil atualiza próprio" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

revoke insert, update, delete on profiles from anon, authenticated;
grant update (nickname, team) on profiles to authenticated;
