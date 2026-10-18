-- Adiciona o passe Premium ao catálogo (espelha packages/shared/catalog.ts).
-- Idempotente via on conflict.

insert into catalog_items (id, kind, label, price_cents, active) values
  ('pass:premium', 'pass', 'Premium', 1000, true)
on conflict (id) do update
  set label = excluded.label,
      price_cents = excluded.price_cents,
      active = excluded.active;
