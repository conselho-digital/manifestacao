-- Ranking global (migração `ranking`): abates e mortes por conta (Google), somando todas as sessões e mapas.
-- Todos leem nome, abates e mortes (o user_id não é exposto); ninguém escreve direto: só a função report_score (security definer) soma, com limites.
create table if not exists public.ranking (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  kills int not null default 0 check (kills >= 0),
  deaths int not null default 0 check (deaths >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ranking enable row level security;
revoke all on public.ranking from anon, authenticated;
grant select (name, kills, deaths, updated_at) on public.ranking to anon, authenticated;
create policy "ranking visivel" on public.ranking for select to anon, authenticated using (true);
create index if not exists ranking_kills_idx on public.ranking (kills desc, deaths asc);

-- soma abates/mortes da conta logada: no máximo 10 de cada por chamada e uma chamada a cada 4 s (devolve false se for cedo demais: o cliente tenta de novo)
create or replace function public.report_score(p_name text, p_kills int, p_deaths int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n text;
  prev timestamptz;
begin
  if uid is null then raise exception 'login necessario'; end if;
  p_kills := least(greatest(coalesce(p_kills, 0), 0), 10);
  p_deaths := least(greatest(coalesce(p_deaths, 0), 0), 10);
  n := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 20);
  if n = '' then n := 'Jogador'; end if;
  select updated_at into prev from public.ranking where user_id = uid;
  if prev is not null and now() - prev < interval '4 seconds' then return false; end if;
  insert into public.ranking as r (user_id, name, kills, deaths, updated_at) values (uid, n, p_kills, p_deaths, now())
  on conflict (user_id) do update set name = excluded.name, kills = r.kills + p_kills, deaths = r.deaths + p_deaths, updated_at = now();
  return true;
end $$;
revoke all on function public.report_score(text, int, int) from public, anon;
grant execute on function public.report_score(text, int, int) to authenticated;

-- posição e números da própria conta
create or replace function public.my_ranking() returns table (pos bigint, kills int, deaths int)
language sql security definer set search_path = public stable as $$
  select (select count(*) + 1 from public.ranking o where o.kills > m.kills or (o.kills = m.kills and o.deaths < m.deaths)), m.kills, m.deaths
  from public.ranking m where m.user_id = auth.uid();
$$;
revoke all on function public.my_ranking() from public, anon;
grant execute on function public.my_ranking() to authenticated;
