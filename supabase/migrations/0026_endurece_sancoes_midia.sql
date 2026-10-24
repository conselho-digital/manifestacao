-- Revisão de segurança: banimento vale também no canal em tempo real; crédito não paga lance de conta sancionada;
-- imagem moderada não pode ser trocada depois da aprovação; limite de tamanho do visual do avatar.

-- Só pergunta sobre o PRÓPRIO usuário (não vaza sanção alheia), por isso pode ser chamada por quem está logado.
create or replace function public.i_am_sanctioned(p_kinds text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_sanctioned(auth.uid(), p_kinds);
$$;
revoke all on function public.i_am_sanctioned(text[]) from public, anon;
grant execute on function public.i_am_sanctioned(text[]) to authenticated;

-- Banido não envia nem recebe no canal da avenida (silenciar continua barrando chat/voz na interface e nas funções).
drop policy if exists "avenida: logado recebe" on realtime.messages;
create policy "avenida: logado recebe" on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) = 'avenue'
    and extension = any (array['broadcast', 'presence'])
    and not (select public.i_am_sanctioned(array['ban']))
  );
drop policy if exists "avenida: logado envia" on realtime.messages;
create policy "avenida: logado envia" on realtime.messages for insert to authenticated
  with check (
    (select realtime.topic()) = 'avenue'
    and extension = any (array['broadcast', 'presence'])
    and not (select public.i_am_sanctioned(array['ban']))
  );

-- Quem tem sanção não paga lance com crédito.
create or replace function public.bid_pay_with_credit(p_bid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_bid public.billboard_bids; v_bal integer; v_board text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if public.is_sanctioned(auth.uid(), array['mute', 'ban']) then raise exception 'sanctioned'; end if;
  select b.billboard_id into v_board from public.billboard_bids b
    join public.billboard_private p on p.bid_id = b.id where b.id = p_bid and p.user_id = auth.uid();
  if v_board is null then raise exception 'not_found'; end if;
  perform pg_advisory_xact_lock(hashtext('bb:' || v_board));
  select b.* into v_bid from public.billboard_bids b
    join public.billboard_private p on p.bid_id = b.id
    where b.id = p_bid and p.user_id = auth.uid() for update of b;
  if not found then raise exception 'not_found'; end if;
  if v_bid.status <> 'awaiting_payment' then raise exception 'not_approved'; end if;
  if v_bid.amount_cents < public.bid_minimum(v_bid.billboard_id) then raise exception 'bid_too_low'; end if;
  select balance_cents into v_bal from public.user_credits where user_id = auth.uid() for update;
  if coalesce(v_bal, 0) < v_bid.amount_cents then raise exception 'no_credit'; end if;
  update public.user_credits set balance_cents = balance_cents - v_bid.amount_cents where user_id = auth.uid();
  update public.billboard_private set credit_paid = true where bid_id = p_bid;
  return public.bid_settle(p_bid);
end $$;

-- Sem apagar o próprio arquivo: senão dava para aprovar uma imagem e reenviar outra no mesmo caminho (e zerar a cota diária).
drop policy if exists "media: dono apaga" on storage.objects;

-- Visual do avatar não pode crescer sem limite.
alter table public.avatars drop constraint if exists avatars_appearance_size;
alter table public.avatars add constraint avatars_appearance_size check (pg_column_size(appearance) < 4096);
