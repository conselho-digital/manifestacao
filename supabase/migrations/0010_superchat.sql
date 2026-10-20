-- Superchat: fila de moderação → cobrança Pix → exibição.
-- Fluxo: review → awaiting_payment (admin aprova) → paid (webhook) | rejected | refunded.
-- Escrita só via Edge Functions (service_role) e admin (RLS); o cliente nunca grava direto.

alter table superchats
  add column if not exists user_id uuid references profiles (id) on delete cascade,
  add column if not exists external_reference text unique,
  add column if not exists mp_payment_id text,
  add column if not exists reviewed_by uuid references profiles (id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists paid_at timestamptz;

alter table superchats alter column status set default 'review';
alter table superchats add constraint superchats_status_check
  check (status in ('review', 'awaiting_payment', 'paid', 'rejected', 'refunded'));
alter table superchats add constraint superchats_amount_range
  check (amount_cents between 500 and 20000);

create index if not exists superchats_status_idx on superchats (status, created_at);
create index if not exists superchats_user_idx on superchats (user_id);

drop policy if exists "superchats aprovados" on superchats;
-- Só superchats JÁ PAGOS aparecem para todos (e chegam pelo Realtime).
create policy "superchats pagos públicos" on superchats
  for select using (status = 'paid');
create policy "superchats do dono" on superchats
  for select using (auth.uid() = user_id);
-- Admin: lê a fila e aprova/recusa (só status/revisão; o INSERT é da Edge Function).
create policy "superchats admin lê" on superchats
  for select using (public.is_admin());
create policy "superchats admin modera" on superchats
  for update using (public.is_admin() and status in ('review', 'awaiting_payment'))
  with check (status in ('awaiting_payment', 'rejected'));
-- Trilha de moderação: admin registra a própria ação.
create policy "moderação admin registra" on moderation_log
  for insert with check (public.is_admin() and actor = auth.uid());
create policy "moderação admin lê" on moderation_log
  for select using (public.is_admin());

-- Realtime (postgres_changes) para exibir superchats pagos na hora.
alter publication supabase_realtime add table superchats;
