-- Uma única bandeira por equipe (a imagem é enviada em Admin → Equipes e bandeiras). As bandeiras avulsas saem da loja.
update catalog_items set active = false where id in ('flag:verde','flag:amarela','flag:branca','flag:vermelha');
-- (opcional) a config antiga de bandeiras não é mais lida pelo jogo: delete from game_config where key = 'flags';
