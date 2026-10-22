-- Veículos novos (2ª moto e caminhão), admin com todos os itens e ativação de teste sem pagar.

-- Preços provisórios; o admin ajusta na aba Produtos.
insert into catalog_items (id, kind, label, price_cents, active) values
  ('vehicle:moto2',    'vehicle', 'Moto esportiva', 2990, true),
  ('vehicle:caminhao', 'vehicle', 'Caminhão',       9990, true)
on conflict (id) do nothing;

-- Todos os itens para as contas admin (as do admin_emails) que já têm perfil.
insert into entitlements (user_id, item_id, source)
select p.id, c.id, 'admin'
from auth.users u
join admin_emails a on lower(a.email) = lower(u.email)
join profiles p on p.id = u.id
cross join catalog_items c
on conflict (user_id, item_id) do nothing;

-- Botão do painel: devolve TODOS os itens do catálogo (inclusive os criados depois) ao admin que chamou.
create or replace function admin_grant_all_to_me()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.entitlements (user_id, item_id, source)
    select auth.uid(), c.id, 'admin' from public.catalog_items c
    on conflict (user_id, item_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Teste de admin: ativa um superchat/cartaz/lance aprovado SEM pagar (nada é cobrado; fica no log).
create or replace function admin_test_activate(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_res text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_kind = 'superchat' then
    update public.superchats set status = 'paid', paid_at = now() where id = p_id and status = 'awaiting_payment';
    get diagnostics v_n = row_count;
    v_res := case when v_n > 0 then 'paid' else 'skip' end;
  elsif p_kind = 'sign' then
    update public.custom_signs set status = 'active', paid_at = now() where id = p_id and status = 'awaiting_payment';
    get diagnostics v_n = row_count;
    v_res := case when v_n > 0 then 'active' else 'skip' end;
  elsif p_kind = 'bid' then
    v_res := public.bid_settle(p_id);
  else
    raise exception 'kind_invalid';
  end if;
  insert into public.moderation_log (actor, target, action, reason)
    values (auth.uid(), p_kind || ':' || p_id, 'admin_test_activate', v_res);
  return v_res;
end $$;

revoke all on function admin_grant_all_to_me(), admin_test_activate(text, uuid) from public, anon;
grant execute on function admin_grant_all_to_me(), admin_test_activate(text, uuid) to authenticated;
