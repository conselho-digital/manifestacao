-- Realtime: o canal da avenida passa a ser PRIVADO — só usuário logado entra,
-- lê e envia (presence + broadcast). Sem estas policies, um canal privado não
-- deixa ninguém entrar. O cliente usa `config: { private: true }`.
-- IMPORTANTE: para valer de verdade, desligue "Allow public access" em
-- Realtime Settings (Dashboard) — senão ainda dá pra entrar num canal público.

create policy "avenida: logado recebe" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'avenue'
    and realtime.messages.extension in ('broadcast', 'presence')
  );

create policy "avenida: logado envia" on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'avenue'
    and realtime.messages.extension in ('broadcast', 'presence')
  );

-- Validações de dados do usuário (defesa em profundidade).
alter table avatars
  add constraint avatars_model_id_len check (model_id is null or char_length(model_id) <= 40),
  add constraint avatars_shirt_range check (shirt is null or shirt between 0 and 16777215);

-- Imagem do cartaz só pode vir do nosso storage (evita rastrear quem vê o
-- cartaz por URL externa).
alter table custom_signs
  add constraint custom_signs_image_origin check (
    image_url is null
    or image_url like 'https://jifhdgmgcfzkpnlpuuzm.supabase.co/storage/v1/object/public/%'
  );
