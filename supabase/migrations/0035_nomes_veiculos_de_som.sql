-- Nomes dos veículos de som: vehicle:carro_som = "Carro de som" (picape); vehicle:caminhao = "Caminhão de som" (caminhão de baú).
update public.catalog_items set label = 'Carro de som' where id = 'vehicle:carro_som';
update public.catalog_items set label = 'Caminhão de som' where id = 'vehicle:caminhao';
