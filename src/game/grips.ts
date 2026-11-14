// Ajuste fino da posição de cada arma na mão do personagem. Os valores vêm de `public/weapon-grips.json`, que o editor
// (`/armas`, aba "Armas nas mãos" da página de animações) exporta. Sem o arquivo (ou sem a arma nele) vale o ajuste zero.
import type { ExtraMelee } from './anim';

/** Chave da arma: bandeira, placa, críquete, armas do pacote, fuzis, pistola e lata de spray. */
export type GripKey = 'bat' | 'sign' | 'cricket' | ExtraMelee | 'ak' | 'm4' | 'm16' | 'hb' | 'pistol' | 'spray';
export const GRIP_KEYS: readonly GripKey[] = ['bat', 'sign', 'cricket', 'bottle', 'pipe', 'cleaver', 'sickle', 'axe', 'knife', 'ak', 'm4', 'm16', 'hb', 'pistol', 'spray'];

/**
 * p: deslocamento em metros no espaço da arma (x lado, y cima, z ao longo do cabo/cano); r: giro em graus (x, y, z); s: escala.
 * hr / hl: giro da mão direita / esquerda do personagem, em graus: [giro da palma (em volta do antebraço), pulso cima/baixo, pulso para os lados].
 */
export interface Grip { p: [number, number, number]; r: [number, number, number]; s: number; hr: [number, number, number]; hl: [number, number, number] }
export const zeroGrip = (): Grip => ({ p: [0, 0, 0], r: [0, 0, 0], s: 1, hr: [0, 0, 0], hl: [0, 0, 0] });
export const isZeroGrip = (g: Grip): boolean => g.p.every((v) => v === 0) && g.r.every((v) => v === 0) && g.s === 1 && g.hr.every((v) => v === 0) && g.hl.every((v) => v === 0);
export const cloneGrip = (g: Grip): Grip => ({ p: [...g.p], r: [...g.r], s: g.s, hr: [...g.hr], hl: [...g.hl] });

const store = new Map<GripKey, Grip>();
let version = 0;

const num = (v: unknown, lim: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const triple = (v: unknown, lim: number): [number, number, number] => (Array.isArray(v) ? [num(v[0], lim), num(v[1], lim), num(v[2], lim)] : [0, 0, 0]);

/** Valida um objeto qualquer (arquivo de rede ou colado): só chaves conhecidas, números limitados. */
export function cleanGrips(raw: unknown): Map<GripKey, Grip> {
  const out = new Map<GripKey, Grip>();
  if (typeof raw !== 'object' || raw === null) return out;
  const src = ((raw as Record<string, unknown>).grips ?? raw) as Record<string, unknown>;
  for (const k of GRIP_KEYS) {
    const g = src[k];
    if (typeof g !== 'object' || g === null) continue;
    const o = g as Record<string, unknown>;
    const s = typeof o.s === 'number' && Number.isFinite(o.s) ? Math.max(0.3, Math.min(3, o.s)) : 1;
    out.set(k, { p: triple(o.p, 1), r: triple(o.r, 180), s, hr: triple(o.hr, 180), hl: triple(o.hl, 180) });
  }
  return out;
}

export const gripOf = (k: GripKey): Grip => store.get(k) ?? zeroGrip();
export const gripsVersion = (): number => version;

export function setGrip(k: GripKey, g: Grip): void {
  if (isZeroGrip(g)) store.delete(k);
  else store.set(k, cloneGrip(g));
  version++;
}

export function setAllGrips(m: Map<GripKey, Grip>): void {
  store.clear();
  m.forEach((g, k) => { if (!isZeroGrip(g)) store.set(k, g); });
  version++;
}

/** JSON para o arquivo `public/weapon-grips.json` (só armas ajustadas). */
export function exportGrips(): string {
  const o: Record<string, Grip> = {};
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  for (const k of GRIP_KEYS) {
    const g = store.get(k);
    const r1 = (a: Grip['r']): Grip['r'] => a.map((v) => Math.round(v * 10) / 10) as Grip['r'];
    if (g) o[k] = { p: g.p.map(r3) as Grip['p'], r: r1(g.r), s: r3(g.s), hr: r1(g.hr), hl: r1(g.hl) };
  }
  return JSON.stringify({ grips: o }, null, 2);
}

/** Baixa o arquivo de ajustes do site (uma vez, no início); falha em silêncio (vale o ajuste zero). */
export async function loadGrips(): Promise<void> {
  try {
    const r = await fetch('/weapon-grips.json', { cache: 'no-cache' });
    if (r.ok) setAllGrips(cleanGrips(await r.json()));
  } catch { /* sem arquivo: tudo zero */ }
}
