import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CHARACTERS, type CharacterName } from '../game/characters';
import { MAP } from '../game/map';

export interface PlayerInfo {
  id: string;
  name: string;
  character: CharacterName;
}

export interface MoveMsg {
  id: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  /** nome do clipe de animação atual */
  a: string;
  /** carro que está dirigindo (-1 = nenhum) */
  v: number;
  /** arma: 0 punho, 1 fuzil, 2 fuzil mirando */
  w: number;
  /** inclinação da mira (rad) */
  pt: number;
}

/** Tiro: de (x1,y1,z1) até (x2,y2,z2). h = id de quem foi acertado ('' = ninguém). */
export interface ShotMsg {
  id: string;
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  h: string;
  /** r = fuzil, f = soco */
  k: 'r' | 'f';
  /** tiro na cabeça */
  hs: boolean;
}

export interface KillMsg { k: string; v: string; w: string }
export interface ChatMsg { id: string; t: string }

export interface NetHandlers {
  onJoin(p: PlayerInfo): void;
  onLeave(id: string): void;
  onMove(m: MoveMsg): void;
  onShot(m: ShotMsg): void;
  onKill(m: KillMsg): void;
  onChat(m: ChatMsg): void;
}

const CHANNEL = 'arena:main';
export const MAX_NAME = 16;
export const MAX_CHAT = 80;
const MAX_REMOTE = 30; // limite de jogadores remotos renderizados
const LIMIT = Math.max(MAP.halfX, MAP.halfZ) + 10; // coordenadas fora disso são descartadas
const MAX_ANIM = 24;
const MIN_SHOT_GAP_MS = 60; // ignora rajadas impossíveis
const MIN_CHAT_GAP_MS = 400;

const printable = (v: unknown): string =>
  typeof v === 'string' ? [...v].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('') : '';

/** Dados vindos da rede nunca são confiáveis: valida tudo antes de usar. */
export function cleanName(v: unknown): string {
  return printable(v).trim().slice(0, MAX_NAME) || 'Jogador';
}

export function cleanChat(v: unknown): string {
  return printable(v).replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
}

function cleanCharacter(v: unknown): CharacterName | null {
  return typeof v === 'string' && (CHARACTERS as readonly string[]).includes(v) ? (v as CharacterName) : null;
}

const finite = (v: unknown, lim: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;
const idOk = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function cleanMove(raw: unknown): MoveMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const x = finite(m.x, LIMIT);
  const y = finite(m.y ?? 0, 50);
  const z = finite(m.z, LIMIT);
  const ry = finite(m.ry, 100);
  if (!idOk(m.id) || x === null || y === null || z === null || ry === null) return null;
  const a = typeof m.a === 'string' && /^[a-z0-9_]{1,24}$/.test(m.a) && m.a.length <= MAX_ANIM ? m.a : 'idle';
  const v = typeof m.v === 'number' && Number.isInteger(m.v) && m.v >= -1 && m.v < 8 ? m.v : -1;
  const w = m.w === 1 || m.w === 2 ? m.w : 0;
  const pt = finite(m.pt ?? 0, 1.6) ?? 0;
  return { id: m.id, x, y, z, ry, a, v, w, pt };
}

function cleanShot(raw: unknown): ShotMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const n = ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'].map((k) => finite(m[k], 300));
  if (!idOk(m.id) || n.some((v) => v === null)) return null;
  const h = typeof m.h === 'string' && m.h.length <= 64 ? m.h : '';
  return {
    id: m.id,
    x1: n[0]!, y1: n[1]!, z1: n[2]!, x2: n[3]!, y2: n[4]!, z2: n[5]!,
    h, k: m.k === 'f' ? 'f' : 'r', hs: m.hs === true,
  };
}

const SEND_INTERVAL_MS = 80; // ~12 envios/s

export class Net {
  readonly id = crypto.randomUUID();
  private channel: RealtimeChannel | null = null;
  private lastSent = 0;
  private ready = false;
  private known = new Set<string>();
  private lastShotAt = new Map<string, number>();
  private lastChatAt = new Map<string, number>();

  /** Entra na sala. Retorna false se o Supabase não estiver configurado. */
  async join(me: Omit<PlayerInfo, 'id'>, h: NetHandlers): Promise<boolean> {
    if (!supabase) return false;
    const channel = supabase.channel(CHANNEL, { config: { presence: { key: this.id } } });
    this.channel = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<Omit<PlayerInfo, 'id'>>();
      const now = new Set(Object.keys(state));
      for (const [id, metas] of Object.entries(state)) {
        if (id === this.id || this.known.has(id)) continue;
        const meta = metas[0];
        const character = cleanCharacter(meta?.character);
        if (!meta || !character || this.known.size >= MAX_REMOTE) continue;
        this.known.add(id);
        h.onJoin({ id, name: cleanName(meta.name), character });
      }
      for (const id of [...this.known]) {
        if (!now.has(id)) {
          this.known.delete(id);
          this.lastShotAt.delete(id);
          this.lastChatAt.delete(id);
          h.onLeave(id);
        }
      }
    });
    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      const m = cleanMove(payload);
      if (m && m.id !== this.id) h.onMove(m);
    });
    channel.on('broadcast', { event: 'shot' }, ({ payload }) => {
      const m = cleanShot(payload);
      if (!m || m.id === this.id || !this.known.has(m.id)) return;
      const now = performance.now();
      if (now - (this.lastShotAt.get(m.id) ?? 0) < MIN_SHOT_GAP_MS) return;
      this.lastShotAt.set(m.id, now);
      h.onShot(m);
    });
    channel.on('broadcast', { event: 'kill' }, ({ payload }) => {
      const p = payload as Record<string, unknown> | null;
      if (!p || !idOk(p.k) || !idOk(p.v) || !this.known.has(p.v)) return;
      h.onKill({ k: p.k, v: p.v, w: typeof p.w === 'string' ? p.w.slice(0, 12) : '' });
    });
    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      const p = payload as Record<string, unknown> | null;
      if (!p || !idOk(p.id) || p.id === this.id || !this.known.has(p.id)) return;
      const t = cleanChat(p.t);
      const now = performance.now();
      if (!t || now - (this.lastChatAt.get(p.id) ?? 0) < MIN_CHAT_GAP_MS) return;
      this.lastChatAt.set(p.id, now);
      h.onChat({ id: p.id, t });
    });

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
    });
    await channel.track(me);
    this.ready = true;
    return true;
  }

  private send(event: string, payload: object): void {
    if (this.channel && this.ready) void this.channel.send({ type: 'broadcast', event, payload });
  }

  /** Envia posição no máximo ~12x por segundo. */
  sendMove(x: number, y: number, z: number, ry: number, a: string, v: number, w: number, pt: number, now: number): void {
    if (now - this.lastSent < SEND_INTERVAL_MS) return;
    this.lastSent = now;
    this.send('move', {
      id: this.id,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
      ry: Math.round(ry * 100) / 100,
      a, v, w, pt: Math.round(pt * 20) / 20,
    });
  }

  sendShot(m: Omit<ShotMsg, 'id'>): void {
    this.send('shot', { ...m, id: this.id });
  }

  sendKill(victim: string, killer: string, weapon: string): void {
    this.send('kill', { k: killer, v: victim, w: weapon });
  }

  sendChat(text: string): void {
    const t = cleanChat(text);
    if (t) this.send('chat', { id: this.id, t });
  }
}
