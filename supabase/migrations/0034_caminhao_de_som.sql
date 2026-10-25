-- O item "Carro de som" passa a se chamar "Caminhão de som" (o id vehicle:carro_som continua o mesmo).
update public.catalog_items set label = 'Caminhão de som' where id = 'vehicle:carro_som' and label = 'Carro de som';
