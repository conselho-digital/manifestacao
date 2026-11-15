-- Endurecimento de segurança (revisão): admin só com Google, ranking atômico com teto por hora,
-- cartaz com vagas reais, lance máximo, limite por conta e cota de envio.

-- 1) is_admin: além do e-mail da lista, exige que a conta tenha sido criada pelo Google (cadastro por e-mail/senha com o e-mail do admin não vale)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
     and exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- 2) ranking: limite de 4 s atômico (várias chamadas em paralelo não furam) e no máximo 300 abates e 300 mortes por hora
alter table public.ranking
  add column if not exists win_start timestamptz not null default now(),
  add column if not exists win_kills int not null default 0,
  add column if not exists win_deaths int not null default 0;

create or replace function public.report_score(p_name text, p_kills int, p_deaths int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  n text;
  k int;
  d int;
  done int;
begin
  if uid is null then raise exception 'login necessario'; end if;
  k := least(greatest(coalesce(p_kills, 0), 0), 10);
  d := least(greatest(coalesce(p_deaths, 0), 0), 10);
  n := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 20);
  if n = '' then n := 'Jogador'; end if;
  insert into public.ranking as r (user_id, name, kills, deaths, updated_at, win_start, win_kills, win_deaths)
  values (uid, n, k, d, now(), now(), k, d)
  on conflict (user_id) do update set
    name = excluded.name,
    kills = r.kills + least(k, greatest(0, 300 - case when now() - r.win_start >= interval '1 hour' then 0 else r.win_kills end)),
    deaths = r.deaths + least(d, greatest(0, 300 - case when now() - r.win_start >= interval '1 hour' then 0 else r.win_deaths end)),
    win_kills = case when now() - r.win_start >= interval '1 hour' then k else least(300, r.win_kills + k) end,
    win_deaths = case when now() - r.win_start >= interval '1 hour' then d else least(300, r.win_deaths + d) end,
    win_start = case when now() - r.win_start >= interval '1 hour' then now() else r.win_start end,
    updated_at = now()
  where r.updated_at <= now() - interval '4 seconds';
  get diagnostics done = row_count;
  return done > 0;
end $$;
revoke all on function public.report_score(text, int, int) from public, anon;
grant execute on function public.report_score(text, int, int) to authenticated;

create or replace function public.my_ranking() returns table (pos bigint, kills int, deaths int)
language sql security definer set search_path = public, pg_temp stable as $$
  select (select count(*) + 1 from public.ranking o where o.kills > m.kills or (o.kills = m.kills and o.deaths < m.deaths)), m.kills, m.deaths
  from public.ranking m where m.user_id = auth.uid();
$$;
revoke all on function public.my_ranking() from public, anon;
grant execute on function public.my_ranking() to authenticated;

-- 3) cartazes: só vagas que existem (lista de public/posters/LEIA.md; refazer se os prédios mudarem), lance máximo, limite por conta
create table if not exists public.poster_slots (id text primary key);
alter table public.poster_slots enable row level security;
revoke all on public.poster_slots from anon, authenticated;
insert into public.poster_slots(id) values ('H1_zn1'),('H1_zn2'),('H1_zp1'),('H1_zp2'),('H2_xn1'),('H2_xn2'),('H2_zn1'),('H2_zn2'),('H2_zp1'),('H2_zp2'),('N1_xn1'),('N1_xn2'),('N1_xn3'),('N1_xp1'),('N1_xp2'),('N1_xp3'),('N1_zn1'),('N1_zn2'),('N1_zn3'),('N1_zp1'),('N1_zp2'),('N1_zp3'),('N2_xn1'),('N2_xn2'),('N2_xn3'),('N2_xp1'),('N2_xp2'),('N2_xp3'),('N2_zn1'),('N2_zn2'),('N2_zp1'),('N2_zp2'),('NB1_xn1'),('NB1_xn2'),('NB1_xn3'),('NB1_xp1'),('NB1_xp2'),('NB1_xp3'),('NB1_zn1'),('NB1_zn2'),('NB1_zp1'),('NB1_zp2'),('NB2_xp1'),('NB2_xp2'),('NB2_zn1'),('NB2_zp1'),('NB3_zp1'),('NB3_zp2'),('NC_xn1'),('NC_xn2'),('NC_xn3'),('NC_zn1'),('NC_zn2'),('NC_zp1'),('NC_zp2'),('NG_xp1'),('NG_xp2'),('NG_xp3'),('NG_zn1'),('NG_zn2'),('NG_zp1'),('NG_zp2'),('NK1_xn1'),('NK1_xp1'),('NK1_zn1'),('NK1_zp1'),('NK2_xn1'),('NK2_xn2'),('NK2_xp1'),('NK2_xp2'),('NK2_zn1'),('NK2_zn2'),('NK2_zp1'),('NK2_zp2'),('NK3_xn1'),('NK3_xp1'),('NK3_zn1'),('NK3_zn2'),('NK3_zp1'),('NK3_zp2'),('NK4_zp1'),('NK4_zp2'),('NK5_xp1'),('NK5_xp2'),('NK5_zn1'),('NK5_zp1'),('NM_xn1'),('NM_xn2'),('NM_xn3'),('NM_xp1'),('NM_xp2'),('NM_xp3'),('NM_zn1'),('NM_zn2'),('NM_zn3'),('NM_zp1'),('NM_zp2'),('NM_zp3'),('NR1_xp1'),('NR1_xp2'),('NR1_zp1'),('NR1_zp2'),('NR2_xn1'),('NR2_xn2'),('NR2_xn3'),('NR3_xp1'),('NR3_xp2'),('NR3_zn1'),('NR3_zp1'),('NR4_zn1'),('NR4_zn2'),('NR4_zp1'),('NR4_zp2'),('NR5_zn1'),('NR5_zn2'),('NR5_zp1'),('NR5_zp2'),('NT_xn1'),('NT_xn2'),('NT_xn3'),('NT_xn4'),('NT_xp1'),('NT_xp2'),('NT_xp3'),('NT_xp4'),('NT_zn1'),('NT_zn2'),('NT_zn3'),('SD_xn1'),('SD_xn2'),('SD_xp1'),('SD_xp2'),('SD_zn1'),('SD_zn2'),('SD_zn3'),('SD_zp1'),('SD_zp2'),('SH2_zn1'),('SH2_zn2'),('SH2_zn3'),('SH2_zp1'),('SH2_zp2'),('SH2_zp3'),('SH_xn1'),('SH_xn2'),('SH_xp1'),('SH_xp2'),('SH_zn1'),('SH_zn2'),('SH_zp1'),('SH_zp2'),('SL1_xn1'),('SL1_xn2'),('SL1_zn1'),('SL1_zn2'),('SL1_zn3'),('SL1_zn4'),('SL1_zp1'),('SL1_zp2'),('SL1_zp3'),('SL1_zp4'),('SL2a_zn1'),('SL2a_zn2'),('SL2a_zp1'),('SL2a_zp2'),('SL2b_xn1'),('SL2b_xn2'),('SL2b_xn3'),('SL2b_xn4'),('SL2b_zn1'),('SL2b_zn2'),('SL2b_zp1'),('SL2b_zp2'),('SL2c_zn1'),('SL2c_zn2'),('SL2c_zp1'),('SL2c_zp2'),('SL3_xn1'),('SL3_xn2'),('SL3_xp1'),('SL3_xp2'),('SL3_zn1'),('SL3_zn2'),('SL3_zn3'),('SL3_zp1'),('SL3_zp2'),('SL3_zp3'),('SL4_xn1'),('SL4_xn2'),('SL4_xn3'),('SL4_xp1'),('SL4_xp2'),('SL4_xp3'),('SL4_zn1'),('SL4_zn2'),('SL4_zp1'),('SL4_zp2'),('SL5_xp1'),('SL5_xp2'),('SL5_xp3'),('SL5_zn1'),('SL5_zn2'),('SL5_zp1'),('SL5_zp2'),('SL6_xn1'),('SL6_xn2'),('SL6_xn3'),('SL6_zn1'),('SL6_zn2'),('SL6_zp1'),('SL6_zp2'),('SL7_xn1'),('SL7_xn2'),('SL7_xn3'),('SL7_xp1'),('SL7_xp2'),('SL7_xp3'),('SL7_zn1'),('SL7_zn2'),('SL7_zp1'),('SL7_zp2'),('SLONG_xp1'),('SLONG_xp2'),('SLONG_xp3'),('SR1_xp1'),('SR1_xp2'),('SR1_xp3'),('SR1_xp4'),('SR1_zp1'),('SR1_zp2'),('SR2_xn1'),('SR2_xn2'),('SR2_zn1'),('SR2_zp1'),('SR3_xn1'),('SR3_xn2'),('SR3_xn3'),('SR3_xn4'),('SR3_xn5'),('SR3_zn1'),('SR3_zn2'),('SR3_zp1'),('SR3_zp2'),('SR4_xn1'),('SR4_xn2'),('SR4_xn3'),('SR4_zn1'),('SR4_zn2') on conflict do nothing;

create or replace function public.claim_poster(p_slot text, p_path text, p_price integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
     or not exists (select 1 from public.poster_slots s where s.id = p_slot)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'posters' and o.name = p_path) then
    return jsonb_build_object('ok', false, 'error', 'invalido');
  end if;
  perform pg_advisory_xact_lock(hashtext('poster:' || p_slot)); -- duas ofertas na mesma vaga não se atropelam
  adm := public.is_admin();
  select * into cur from public.posters where slot_id = p_slot for update;
  if found then live := cur.expires_at is null or cur.expires_at > now(); end if;
  minp := case when live then greatest(cur.price + 1, 2) else 2 end;
  paid := case when adm then 0 else coalesce(p_price, 0) end;
  if not adm and (paid < minp or paid > minp + 100) then
    return jsonb_build_object('ok', false, 'error', 'preco', 'min', minp, 'max', minp + 100);
  end if;
  if not adm and (select count(*) from public.posters p where p.owner = uid and p.slot_id <> p_slot and p.expires_at > now()) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'limite');
  end if;
  u := 'https://jifhdgmgcfzkpnlpuuzm.supabase.co/storage/v1/object/public/posters/' || p_path;
  insert into public.posters(slot_id, url, price, owner, expires_at, updated_at) values (p_slot, u, paid, uid, exp, now())
  on conflict (slot_id) do update set url = excluded.url, price = excluded.price, owner = excluded.owner, expires_at = excluded.expires_at, updated_at = now();
  return jsonb_build_object('ok', true, 'url', u, 'price', paid, 'expires_at', exp);
end $$;
revoke all on function public.claim_poster(text, text, integer) from public, anon;
grant execute on function public.claim_poster(text, text, integer) to authenticated;

-- 4) envio de cartaz: no máximo 6 arquivos por conta no bucket (o jogo apaga os que sobram); o admin tem política própria
drop policy if exists "login envia cartaz" on storage.objects;
create policy "login envia cartaz" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and name ~ '^[A-Za-z0-9_]{1,40}/[0-9]{10,14}\.webp$'
    and (select count(*) from storage.objects o where o.bucket_id = 'posters' and o.owner_id = auth.uid()::text) < 6);
