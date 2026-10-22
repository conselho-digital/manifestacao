-- Exclusão de conta mais segura (revisão): recusa com Pix aberto de superchat/cartaz/lance e com crédito positivo
-- (dinheiro do usuário), e deixa ex-admins excluírem a conta (vínculos de revisão/moderação viram NULL).

alter table public.entitlements drop constraint entitlements_granted_by_fkey,
  add constraint entitlements_granted_by_fkey foreign key (granted_by) references public.profiles (id) on delete set null;
alter table public.moderation_log drop constraint moderation_log_actor_fkey,
  add constraint moderation_log_actor_fkey foreign key (actor) references public.profiles (id) on delete set null;
alter table public.billboard_private drop constraint billboard_private_reviewed_by_fkey,
  add constraint billboard_private_reviewed_by_fkey foreign key (reviewed_by) references public.profiles (id) on delete set null;
alter table public.sign_private drop constraint sign_private_reviewed_by_fkey,
  add constraint sign_private_reviewed_by_fkey foreign key (reviewed_by) references public.profiles (id) on delete set null;
alter table public.superchat_private drop constraint superchat_private_reviewed_by_fkey,
  add constraint superchat_private_reviewed_by_fkey foreign key (reviewed_by) references public.profiles (id) on delete set null;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if public.is_admin() then raise exception 'admin_not_allowed'; end if;
  perform 1 from public.profiles where id = auth.uid() for update;
  if exists (select 1 from public.sanctions where user_id = auth.uid() and lifted_at is null and (expires_at is null or expires_at > now())) then
    raise exception 'active_sanction';
  end if;
  if exists (select 1 from public.orders where user_id = auth.uid() and status = 'pending') then
    raise exception 'pending_payment';
  end if;
  -- Pix aberto de superchat/cartaz/lance: se pagasse depois da exclusão, o dinheiro entraria sem dono e sem estorno.
  if exists (
    select 1 from public.superchat_payments pay join public.superchat_private p on p.superchat_id = pay.superchat_id
    where p.user_id = auth.uid() and pay.state in ('creating', 'pending')
  ) or exists (
    select 1 from public.sign_payments pay join public.sign_private p on p.sign_id = pay.sign_id
    where p.user_id = auth.uid() and pay.state in ('creating', 'pending')
  ) or exists (
    select 1 from public.billboard_payments pay join public.billboard_private p on p.bid_id = pay.bid_id
    where p.user_id = auth.uid() and pay.state in ('creating', 'pending')
  ) then
    raise exception 'pending_payment';
  end if;
  if exists (
    select 1 from public.billboard_private p join public.billboard_bids b on b.id = p.bid_id
    where p.user_id = auth.uid() and b.status in ('active', 'awaiting_payment')
  ) then
    raise exception 'active_bid';
  end if;
  if exists (select 1 from public.user_credits where user_id = auth.uid() and balance_cents < 0) then
    raise exception 'credit_debt';
  end if;
  -- Crédito positivo é dinheiro do usuário: não some em silêncio.
  if exists (select 1 from public.user_credits where user_id = auth.uid() and balance_cents > 0) then
    raise exception 'credit_balance';
  end if;
  delete from public.superchats where id in (select superchat_id from public.superchat_private where user_id = auth.uid());
  delete from public.custom_signs where id in (select sign_id from public.sign_private where user_id = auth.uid());
  delete from public.billboard_bids where id in (select bid_id from public.billboard_private where user_id = auth.uid());
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
