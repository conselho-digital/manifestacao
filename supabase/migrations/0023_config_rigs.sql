-- Marcações de esqueleto dos personagens (editor do admin) ficam em game_config.rigs.
alter table public.game_config drop constraint game_config_key_check;
alter table public.game_config
  add constraint game_config_key_check check (key = any (array['teams', 'flags', 'models', 'rigs']));
