// Equipes: duas cores cada, guardadas no Supabase (tabela `teams`, leitura pública; só o admin altera).
// Sem internet/Supabase valem as 4 equipes padrão abaixo.
import * as THREE from 'three';
import { supabase } from '../net/supabase';

export interface Team { id: string; name: string; c1: string; c2: string; /** imagem do grafite da equipe (https, enviada pelo admin) */ graffiti?: string }
/** O que vai pela rede (presence): nome e as duas cores. */
export interface TeamLook { name: string; c1: string; c2: string }

export const HEX = /^#[0-9a-f]{6}$/i;
export const MAX_TEAM_NAME = 24;

export const DEFAULT_TEAMS: Team[] = [
  { id: 'padrao-1', name: 'Verde e Amarela', c1: '#009c3b', c2: '#ffdf00' },
  { id: 'padrao-2', name: 'Vermelha e Branca', c1: '#d62828', c2: '#ffffff' },
  { id: 'padrao-3', name: 'Amarela e Preta', c1: '#ffd400', c2: '#111111' },
  { id: 'padrao-4', name: 'Branca', c1: '#ffffff', c2: '#ffffff' },
];

let teams: Team[] = DEFAULT_TEAMS;

export const getTeams = (): Team[] => teams;
export const teamById = (id: string | null | undefined): Team | null => (id ? teams.find((t) => t.id === id) ?? null : null);
/** Equipe válida: a pedida, ou a primeira (não existe "sem equipe"). */
export const validTeamId = (id: string | null | undefined): string => (teamById(id) ? id! : teams[0]?.id ?? '');
export const lookOf =(t: Team | null): TeamLook | null => (t ? { name: t.name, c1: t.c1, c2: t.c2 } : null);

/** Valida o que veio da rede: nome curto e duas cores #rrggbb. */
export function cleanLook(v: unknown): TeamLook | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.c1 !== 'string' || typeof o.c2 !== 'string' || !HEX.test(o.c1) || !HEX.test(o.c2)) return null;
  const name = typeof o.name === 'string' ? [...o.name].filter((ch) => ch.charCodeAt(0) > 31).join('').trim().slice(0, MAX_TEAM_NAME) : '';
  return { name, c1: o.c1.toLowerCase(), c2: o.c2.toLowerCase() };
}

const STORAGE_KEY = 'arena-team';
export const savedTeamId = (): string => { try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; } };
export const saveTeamId = (id: string): void => { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* sem armazenamento */ } };

/** Baixa as equipes do Supabase (mantém as padrão se falhar). */
export async function loadTeams(): Promise<Team[]> {
  if (!supabase) return teams;
  try {
    // graffiti_url é uma coluna nova: se o banco ainda não a tem, lê sem ela (as equipes continuam funcionando)
    let res = await supabase.from('teams').select('id,name,color1,color2,graffiti_url').order('sort', { ascending: true }).order('created_at', { ascending: true });
    if (res.error) res = (await supabase.from('teams').select('id,name,color1,color2').order('sort', { ascending: true }).order('created_at', { ascending: true })) as unknown as typeof res;
    const { data, error } = res;
    if (!error && data) {
      teams = data
        .filter((r) => HEX.test(String(r.color1)) && HEX.test(String(r.color2)))
        .map((r) => ({
          id: String(r.id), name: String(r.name), c1: String(r.color1).toLowerCase(), c2: String(r.color2).toLowerCase(),
          graffiti: typeof (r as { graffiti_url?: unknown }).graffiti_url === 'string' ? safeHttps((r as { graffiti_url: string }).graffiti_url) : undefined,
        }));
    }
  } catch { /* offline: fica com o que já tem */ }
  return teams;
}

/** O usuário logado é administrador? (a conta fica na tabela `admins`, que o navegador não lê; a função do banco responde sim/não) */
export async function isAdmin(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.rpc('is_admin');
    return data === true;
  } catch { return false; }
}

const safeHttps = (u: string): string | undefined => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : undefined; } catch { return undefined; } };

/** Admin: envia a imagem do grafite da equipe (já convertida para webp) e grava o endereço. Retorna a mensagem de erro, se houver. */
export async function saveTeamGraffiti(id: string, file: Blob): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  if (id.startsWith('padrao-')) return 'Salve a equipe no banco antes de enviar a imagem (esta é uma equipe padrão sem conexão).';
  const path = `${id}.${file.type === 'image/png' ? 'png' : 'webp'}`;
  const up = await supabase.storage.from('graffiti').upload(path, file, { upsert: true, contentType: file.type === 'image/png' ? 'image/png' : 'image/webp', cacheControl: '3600' });
  if (up.error) return /bucket not found|not found/i.test(up.error.message) ? 'O armazenamento de imagens ainda não foi criado no servidor (migração pendente).' : /row-level security|permission|unauthorized/i.test(up.error.message) ? 'Sem permissão: só o administrador envia imagens.' : up.error.message;
  const url = `${supabase.storage.from('graffiti').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { data, error } = await supabase.from('teams').update({ graffiti_url: url }).eq('id', id).select('id');
  if (error) return /graffiti_url|column/i.test(error.message) ? 'A coluna da imagem ainda não existe no servidor (migração pendente).' : friendly(error.message);
  if (!data || data.length === 0) return 'Sem permissão para alterar (só o administrador).';
  await loadTeams();
  return null;
}

/** Admin: tira a imagem do grafite da equipe (volta ao desenho padrão). */
export async function clearTeamGraffiti(id: string): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  await supabase.storage.from('graffiti').remove([`${id}.webp`, `${id}.png`]);
  const { error } = await supabase.from('teams').update({ graffiti_url: null }).eq('id', id);
  if (error) return friendly(error.message);
  await loadTeams();
  return null;
}

const friendly = (m: string): string => (/permission denied|row-level security|violates/i.test(m) ? 'Sem permissão: só o administrador altera as equipes.' : m);

/** Cria (sem id) ou altera uma equipe. Retorna a mensagem de erro, se houver. */
export async function saveTeam(t: { id?: string; name: string; c1: string; c2: string }): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  const name = t.name.trim().slice(0, MAX_TEAM_NAME);
  if (!name) return 'Dê um nome à equipe.';
  if (!HEX.test(t.c1) || !HEX.test(t.c2)) return 'Cor inválida.';
  const row = { name, color1: t.c1.toLowerCase(), color2: t.c2.toLowerCase() };
  if (t.id && !t.id.startsWith('padrao-')) {
    const { data, error } = await supabase.from('teams').update(row).eq('id', t.id).select('id');
    if (error) return friendly(error.message);
    if (!data || data.length === 0) return 'Sem permissão para alterar (só o administrador).';
  } else {
    const { data, error } = await supabase.from('teams').insert({ ...row, sort: teams.length + 1 }).select('id');
    if (error) return friendly(error.message);
    if (!data || data.length === 0) return 'Sem permissão para criar (só o administrador).';
  }
  await loadTeams();
  return null;
}

export async function deleteTeam(id: string): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  const { data, error } = await supabase.from('teams').delete().eq('id', id).select('id');
  if (error) return friendly(error.message);
  if (!data || data.length === 0) return 'Sem permissão para apagar (só o administrador).';
  await loadTeams();
  return null;
}

/** Anel de duas cores no chão, sob os pés (metade de cada cor), para ver de longe de que equipe é cada jogador. */
export function makeTeamRing(look: TeamLook | null): THREE.Group {
  const g = new THREE.Group();
  g.name = 'teamRing';
  if (!look) { g.visible = false; return g; }
  const mat = (color: string | number, off: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off, transparent: true, opacity });
  for (const [i, color] of [look.c1, look.c2].entries()) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 28, 1, i * Math.PI, Math.PI), mat(color, -4, 0.95));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.07;
    g.add(m);
  }
  // contorno escuro fino para o anel branco aparecer no chão claro
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 28), mat(0x111111, -3, 0.6));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.065;
  g.add(edge);
  return g;
}
