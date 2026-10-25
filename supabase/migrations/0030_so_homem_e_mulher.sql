-- Só "Homem" e "Mulher" ficam à venda/seleção; os outros personagens saem de cena (quem já comprou mantém o direito).
update public.catalog_items set active = false
where id in ('character:homem_alternativo', 'character:menino', 'character:mulher_alternativa', 'character:menina', 'character:policial');
update public.catalog_items set label = 'Homem' where id = 'character:homem_comum';
update public.catalog_items set label = 'Mulher' where id = 'character:mulher_comum';
