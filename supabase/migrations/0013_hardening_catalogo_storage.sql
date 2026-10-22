-- Correções da revisão: imagens no bucket, admin de produtos, uma cobrança pendente por item e grants mínimos.

-- 1) Imagens de bandeira/spray (PNG/JPG/WebP) além do .glb.
update storage.buckets
  set allowed_mime_types = array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp']
  where id = 'game-assets';

-- 2) Admin cria produtos novos (tipos genéricos, id "produto:<slug>") e apaga produtos.
create policy "catálogo admin cria produto" on catalog_items
  for insert to authenticated
  with check (public.is_admin() and kind in ('object', 'sound', 'pass') and id ~ '^produto:[a-z0-9-]{1,40}$');
create policy "catálogo admin apaga" on catalog_items
  for delete to authenticated using (public.is_admin());

-- 3) No máximo UM pedido pendente por usuário e item (fecha a corrida de cliques duplos que gera 2 Pix).
-- Pendentes antigos duplicados viram 'failed' antes de criar o índice.
update orders o set status = 'failed'
  where status = 'pending'
    and exists (select 1 from orders n where n.user_id = o.user_id and n.item_id = o.item_id
                and n.status = 'pending' and (n.created_at, n.id) > (o.created_at, o.id));
create unique index if not exists orders_one_pending_idx on orders (user_id, item_id) where status = 'pending';

-- 4) Grants mínimos: só o RLS não pode ser a única barreira.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on admin_emails, moderation_log from anon, authenticated;
revoke all on orders, entitlements, user_credits from anon;
revoke insert, update, delete on orders, entitlements, user_credits from authenticated; -- escrita só via service_role/RPC
revoke insert, update, delete on all tables in schema public from anon; -- anon só lê
