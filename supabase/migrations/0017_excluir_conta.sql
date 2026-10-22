-- LGPD: o titular exclui a própria conta. Apaga auth.users; o resto cai em cascata
-- (perfil, avatar, pedidos, direitos, créditos, cartazes, superchats, lances, sanções).
-- Recusa: contas admin (têm vínculos de revisão/moderação) e quem tem Pix pendente (evita pagamento órfão).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if public.is_admin() then raise exception 'admin_not_allowed'; end if;
  if exists (select 1 from public.orders where user_id = auth.uid() and status = 'pending') then
    raise exception 'pending_payment';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
