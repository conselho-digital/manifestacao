-- Produto novo criado pelo admin só pode ser veículo ou personagem (antes: objeto, som, passe).
drop policy if exists "catálogo admin cria produto" on catalog_items;
create policy "catálogo admin cria produto" on catalog_items
  for insert to authenticated
  with check (public.is_admin() and kind in ('vehicle', 'character') and id ~ '^produto:[a-z0-9-]{1,40}$');
