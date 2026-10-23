-- Canal Realtime do antigo mapa "Av. Paulista" (REMOVIDO do jogo; as regras abaixo ficaram no banco sem uso e podem ser apagadas).
create policy "paulista: logado envia" on realtime.messages for insert to authenticated
  with check (((select realtime.topic()) = 'avenue:paulista') and (extension = any (array['broadcast'::text, 'presence'::text])));
create policy "paulista: logado recebe" on realtime.messages for select to authenticated
  using (((select realtime.topic()) = 'avenue:paulista') and (extension = any (array['broadcast'::text, 'presence'::text])));
