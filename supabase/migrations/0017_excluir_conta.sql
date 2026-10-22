-- LGPD: o titular exclui a própria conta. Apaga o conteúdo público da pessoa (superchats, cartazes, lances: texto livre e
-- nome) e depois auth.users; o resto cai em cascata (perfil, avatar, pedidos, direitos, créditos, sanções).
-- Recusa: sanção ativa, contas admin, Pix pendente, lance no ar/aguardando pagamento e crédito negativo (dívida de estorno).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if public.is_admin() then raise exception 'admin_not_allowed'; end if;
  -- Trava o perfil: pedidos novos (FK) esperam esta transação, fechando a corrida com o Pix pendente.
  perform 1 from public.profiles where id = auth.uid() for update;
  -- Sanção ativa não se apaga excluindo a conta (o banido voltaria limpo).
  if exists (select 1 from public.sanctions where user_id = auth.uid() and lifted_at is null and (expires_at is null or expires_at > now())) then
    raise exception 'active_sanction';
  end if;
  if exists (select 1 from public.orders where user_id = auth.uid() and status = 'pending') then
    raise exception 'pending_payment';
  end if;
  -- Lance no ar ou aguardando Pix: sem dono, o telão travaria na hora de devolver o crédito.
  if exists (
    select 1 from public.billboard_private p join public.billboard_bids b on b.id = p.bid_id
    where p.user_id = auth.uid() and b.status in ('active', 'awaiting_payment')
  ) then
    raise exception 'active_bid';
  end if;
  if exists (select 1 from public.user_credits where user_id = auth.uid() and balance_cents < 0) then
    raise exception 'credit_debt';
  end if;
  -- Conteúdo público não tem FK para o usuário: apaga antes (as tabelas *_private somem em cascata depois).
  delete from public.superchats where id in (select superchat_id from public.superchat_private where user_id = auth.uid());
  delete from public.custom_signs where id in (select sign_id from public.sign_private where user_id = auth.uid());
  delete from public.billboard_bids where id in (select bid_id from public.billboard_private where user_id = auth.uid());
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
