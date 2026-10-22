-- Nova lista de personagens (valem para todas as equipes). Os antigos ficam INATIVOS (quem já comprou mantém o direito).
insert into catalog_items (id, kind, label, price_cents, active) values
  ('character:homem_comum',        'character', 'Homem comum',        0,    true),
  ('character:homem_alternativo',  'character', 'Homem alternativo',  2990, true),
  ('character:menino',             'character', 'Menino',             0,    true),
  ('character:mulher_comum',       'character', 'Mulher comum',       0,    true),
  ('character:mulher_alternativa', 'character', 'Mulher alternativa', 2990, true),
  ('character:menina',             'character', 'Menina',             0,    true),
  ('character:policial',           'character', 'Policial',           2990, true)
on conflict (id) do update set label = excluded.label, active = true;

update catalog_items set active = false
where id in ('character:comum', 'character:jovem', 'character:trabalhador', 'character:tiozao');
