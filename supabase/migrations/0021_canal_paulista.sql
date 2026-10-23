-- Canal Realtime do mapa "Av. Paulista" (o da avenida original continua 'avenue').
create policy "paulista: logado envia" on realtime.messages for insert to authenticated
  with check (((select realtime.topic()) = 'avenue:paulista') and (extension = any (array['broadcast'::text, 'presence'::text])));
create policy "paulista: logado recebe" on realtime.messages for select to authenticated
  using (((select realtime.topic()) = 'avenue:paulista') and (extension = any (array['broadcast'::text, 'presence'::text])));
