-- Canal Realtime da arena PvP: mesmas regras do canal da avenida (logado, não banido, só broadcast/presence).
drop policy if exists "avenida: logado recebe" on realtime.messages;
create policy "avenida: logado recebe" on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) in ('avenue', 'arena')
    and extension = any (array['broadcast', 'presence'])
    and not (select public.i_am_sanctioned(array['ban']))
  );
drop policy if exists "avenida: logado envia" on realtime.messages;
create policy "avenida: logado envia" on realtime.messages for insert to authenticated
  with check (
    (select realtime.topic()) in ('avenue', 'arena')
    and extension = any (array['broadcast', 'presence'])
    and not (select public.i_am_sanctioned(array['ban']))
  );
