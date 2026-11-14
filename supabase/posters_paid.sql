-- Cartazes pagos (migração `posters_paid`, já aplicada no projeto): qualquer jogador com login pode pôr uma imagem numa vaga.
-- 1ª imagem = $2; fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. A conta é feita na função `claim_poster`
-- (o dinheiro do jogo fica no navegador, então só a regra "pagar mais que o anterior" é garantida pelo servidor).
alter table public.posters
  add column if not exists price integer not null default 0,
  add column if not exists owner uuid,
  add column if not exists expires_at timestamptz;

-- envio de arquivo: qualquer login, só em "<vaga>/<número>.webp" (nome novo a cada envio); apagar: só arquivo que nenhuma vaga usa (ou admin)
create policy "login envia cartaz" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and name ~ '^[A-Za-z0-9_]{1,40}/[0-9]{10,14}\.webp$');
create policy "limpa cartaz sem uso" on storage.objects for delete to authenticated
  using (bucket_id = 'posters' and not exists (select 1 from public.posters p where position(storage.objects.name in p.url) > 0));

create or replace function public.claim_poster(p_slot text, p_path text, p_price integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  adm boolean;
  cur public.posters%rowtype;
  live boolean := false;
  minp integer;
  paid integer;
  exp timestamptz := now() + interval '24 hours';
  u text;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  if p_slot !~ '^[A-Za-z0-9_]{1,40}$' or p_path !~ '^[A-Za-z0-9_]{1,40}/[0-9]{10,14}\.webp$' or split_part(p_path, '/', 1) <> p_slot
     or not exists (select 1 from storage.objects o where o.bucket_id = 'posters' and o.name = p_path) then
    return jsonb_build_object('ok', false, 'error', 'invalido');
  end if;
  adm := public.is_admin();
  select * into cur from public.posters where slot_id = p_slot for update;
  if found then live := cur.expires_at is null or cur.expires_at > now(); end if;
  minp := case when live then greatest(cur.price + 1, 2) else 2 end;
  paid := case when adm then 0 else coalesce(p_price, 0) end;
  if not adm and (paid < minp or paid > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'preco', 'min', minp);
  end if;
  u := 'https://jifhdgmgcfzkpnlpuuzm.supabase.co/storage/v1/object/public/posters/' || p_path;
  insert into public.posters(slot_id, url, price, owner, expires_at, updated_at) values (p_slot, u, paid, uid, exp, now())
  on conflict (slot_id) do update set url = excluded.url, price = excluded.price, owner = excluded.owner, expires_at = excluded.expires_at, updated_at = now();
  return jsonb_build_object('ok', true, 'url', u, 'price', paid, 'expires_at', exp);
end $$;
revoke all on function public.claim_poster(text, text, integer) from public, anon;
grant execute on function public.claim_poster(text, text, integer) to authenticated;
