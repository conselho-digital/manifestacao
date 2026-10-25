-- admin_hard_delete_product: não apaga itens essenciais (Homem, Mulher, veículos, passe) e registra o valor pago apagado.
create or replace function public.admin_hard_delete_product(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders integer; v_paid integer; v_ents integer; v_cents bigint;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.catalog_items where id = p_id) then raise exception 'not_found'; end if;
  if p_id in ('character:homem_comum', 'character:mulher_comum') or p_id like 'vehicle:%' or p_id like 'pass:%' then raise exception 'builtin_item'; end if;
  select count(*), count(*) filter (where status = 'paid'), coalesce(sum(amount_cents) filter (where status = 'paid'), 0)
    into v_orders, v_paid, v_cents from public.orders where item_id = p_id;
  delete from public.entitlements where item_id = p_id;
  get diagnostics v_ents = row_count;
  delete from public.orders where item_id = p_id;
  delete from public.catalog_items where id = p_id;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), 'product:' || p_id, 'product_hard_delete',
            v_orders || ' pedidos (' || v_paid || ' pagos, R$ ' || (v_cents / 100.0)::numeric(12,2) || '), ' || v_ents || ' direitos apagados');
  return jsonb_build_object('orders', v_orders, 'paid', v_paid, 'entitlements', v_ents, 'paid_cents', v_cents);
end $$;
revoke all on function public.admin_hard_delete_product(text) from public, anon;
grant execute on function public.admin_hard_delete_product(text) to authenticated;
