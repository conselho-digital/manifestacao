-- Apagar de vez um produto que já tem compras: remove também os pedidos e os direitos (itens dos jogadores) ligados a ele.
-- Só admin. Deixa um registro em moderation_log com a contagem (sem dados pessoais).
create or replace function public.admin_hard_delete_product(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders integer; v_paid integer; v_ents integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.catalog_items where id = p_id) then raise exception 'not_found'; end if;
  select count(*), count(*) filter (where status = 'paid') into v_orders, v_paid from public.orders where item_id = p_id;
  delete from public.entitlements where item_id = p_id;
  get diagnostics v_ents = row_count;
  delete from public.orders where item_id = p_id;
  delete from public.catalog_items where id = p_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'product:' || p_id, 'product_hard_delete', v_orders || ' pedidos (' || v_paid || ' pagos), ' || v_ents || ' direitos apagados');
  return jsonb_build_object('orders', v_orders, 'paid', v_paid, 'entitlements', v_ents);
end $$;
revoke all on function public.admin_hard_delete_product(text) from public, anon;
grant execute on function public.admin_hard_delete_product(text) to authenticated;
