-- Link do outdoor do parque (aba Outdoor do admin) fica em game_config.screen.
alter table public.game_config drop constraint game_config_key_check;
alter table public.game_config
  add constraint game_config_key_check check (key = any (array['teams', 'flags', 'models', 'rigs', 'screen']));
