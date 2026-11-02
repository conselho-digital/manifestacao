-- O canal 'avenue:paulista' foi removido do jogo; as regras antigas não checavam banimento. Apagadas.
drop policy if exists "paulista: logado envia" on realtime.messages;
drop policy if exists "paulista: logado recebe" on realtime.messages;
