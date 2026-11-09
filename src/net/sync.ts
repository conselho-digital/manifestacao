import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CHARACTERS, type CharacterName } from '../game/characters';
import { ARENA_SIZE } from '../game/map';

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
}

export interface NetHandlers {
  onJoin(p: PlayerInfo): void;
  onLeave(id: string): void;
  onMove(m: MoveMsg): void;
}

const CHANNEL = 'arena:main';
export const MAX_NAME = 16;
const MAX_REMOTE = 30; // limite de jogadores remotos renderizados
const LIMIT = ARENA_SIZE; // coordenadas fora disso são descartadas
const MAX_ANIM = 24;

/** Dados vindos da rede nunca são confiáveis: valida tudo antes de usar. */
export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  // remove caracteres de controle e limita o tamanho
  const printable = [...s].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('');
  return printable.trim().slice(0, MAX_NAME) || 'Jogador';
}

function cleanCharacter(v: unknown): CharacterName | null {
  return typeof v === 'string' && (CHARACTERS as readonly string[]).includes(v) ? (v as CharacterName) : null;
}

const finite = (v: unknown, lim: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : null;

function cleanMove(raw: unknown): MoveMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const x = finite(m.x, LIMIT);
  const y = finite(m.y ?? 0, 50);
  const z = finite(m.z, LIMIT);
  const ry = finite(m.ry, 100);
  if (typeof m.id !== 'string' || m.id.length > 64 || x === null || y === null || z === null || ry === null) return null;
  const a = typeof m.a === 'string' && /^[a-z0-9_]{1,24}$/.test(m.a) && m.a.length <= MAX_ANIM ? m.a : 'idle';
  const v = typeof m.v === 'number' && Number.isInteger(m.v) && m.v >= -1 && m.v < 8 ? m.v : -1;
  return { id: m.id, x, y, z, ry, a, v };
}
const SEND_INTERVAL_MS = 80; // ~12 envios/s

export class Net {
  readonly id = crypto.randomUUID();
  private channel: RealtimeChannel | null = null;
  private lastSent = 0;
  private ready = false;
  private known = new Set<string>();

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
          h.onLeave(id);
        }
      }
    });
    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      const m = cleanMove(payload);
      if (m && m.id !== this.id) h.onMove(m);
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

  /** Envia posição no máximo ~12x por segundo. */
  sendMove(x: number, y: number, z: number, ry: number, a: string, v: number, now: number): void {
    if (!this.channel || !this.ready || now - this.lastSent < SEND_INTERVAL_MS) return;
    this.lastSent = now;
    const payload: MoveMsg = {
      id: this.id,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      a,
      v,
      z: Math.round(z * 100) / 100,
      ry: Math.round(ry * 100) / 100,
    };
    void this.channel.send({ type: 'broadcast', event: 'move', payload });
  }
}
