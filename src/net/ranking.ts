// Ranking global por conta (tabela `ranking`, ver supabase/ranking.sql): soma abates e mortes de todas as sessões e mapas.
// Os números ficam pendentes no navegador e são enviados em lote (a cada 15 s e ao sair); o servidor limita 10 de cada por envio, 1 envio a cada 4 s.
import { supabase } from './supabase';

export interface RankRow { name: string; kills: number; deaths: number }
export interface MyRank { pos: number; kills: number; deaths: number }

const FLUSH_MS = 15000;
let pendK = 0;
let pendD = 0;
let name = 'Jogador';
let timer = 0;
let sending = false;

export function setRankName(n: string): void { name = n; }

async function flush(): Promise<void> {
  if (!supabase || sending || (pendK === 0 && pendD === 0)) return;
  sending = true;
  const k = Math.min(pendK, 10);
  const d = Math.min(pendD, 10);
  try {
    const { data, error } = await supabase.rpc('report_score', { p_name: name, p_kills: k, p_deaths: d });
    if (!error && data === true) { pendK -= k; pendD -= d; }
  } catch { /* sem rede ou sem login: tenta de novo no próximo ciclo */ }
  sending = false;
}

/** Liga o envio periódico (chamar uma vez ao entrar na partida). */
export function startRanking(playerName: string): void {
  name = playerName;
  if (timer) return;
  timer = window.setInterval(() => void flush(), FLUSH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
}

export function rankKill(): void { pendK++; }
export function rankDeath(): void { pendD++; }

/** Os 20 primeiros (mais abates; empate: menos mortes). */
export async function fetchTop(limit = 20): Promise<RankRow[] | null> {
  if (!supabase) return null;
  await flush(); // inclui o que você acabou de fazer
  const { data, error } = await supabase.from('ranking').select('name,kills,deaths').order('kills', { ascending: false }).order('deaths', { ascending: true }).limit(limit);
  if (error || !data) return null;
  return data.map((r) => ({ name: String(r.name), kills: Number(r.kills), deaths: Number(r.deaths) }));
}

/** Sua posição e totais (null se ainda não aparece no ranking ou sem login). */
export async function fetchMine(): Promise<MyRank | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_ranking');
  const r = Array.isArray(data) ? data[0] : null;
  if (error || !r) return null;
  return { pos: Number(r.pos), kills: Number(r.kills), deaths: Number(r.deaths) };
}
