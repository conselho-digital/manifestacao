-- Adiciona a bandeira vermelha ao catálogo (espelha packages/shared/catalog.ts).
-- Idempotente via on conflict.

insert into catalog_items (id, kind, label, price_cents, active) values
  ('flag:vermelha', 'flag', 'Bandeira vermelha', 0, true)
on conflict (id) do update
  set label = excluded.label,
      price_cents = excluded.price_cents,
      active = excluded.active;
