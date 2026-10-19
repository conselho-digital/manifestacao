-- Moto e carro deixam de ser grátis: todo personagem começa a pé e veículos
-- são comprados (espelha packages/shared/catalog.ts). Idempotente.

update catalog_items set price_cents = 2990 where id = 'vehicle:moto';
update catalog_items set price_cents = 4990 where id = 'vehicle:carro';
