-- Seed do catálogo (espelha packages/shared/catalog.ts). Preços de referência;
-- a cobrança/posse só vale na Fase 3. Idempotente via on conflict.

insert into catalog_items (id, kind, label, price_cents, active) values
  ('character:comum',        'character', 'Brasileiro comum', 0,     true),
  ('character:jovem',        'character', 'Jovem',            0,     true),
  ('character:trabalhador',  'character', 'Trabalhador',      2990,  true),
  ('character:tiozao',       'character', 'Tiozão do Zap',    2990,  true),
  ('flag:time',              'flag',      'Bandeira do time', 0,     true),
  ('flag:verde',             'flag',      'Bandeira verde',   0,     true),
  ('flag:amarela',           'flag',      'Bandeira amarela', 0,     true),
  ('flag:branca',            'flag',      'Bandeira branca',  0,     true),
  ('vehicle:moto',           'vehicle',   'Moto',             0,     true),
  ('vehicle:carro',          'vehicle',   'Carro',            0,     true),
  ('vehicle:carro_som',      'vehicle',   'Carro de som',     20000, true)
on conflict (id) do update
  set label = excluded.label,
      price_cents = excluded.price_cents,
      active = excluded.active;
