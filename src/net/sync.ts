import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { CharacterName } from '../game/characters';

export interface PlayerInfo {
  id: string;
  name: string;
  character: CharacterName;
}

export interface MoveMsg {
  id: string;
  x: number;
  z: number;
  ry: number;
}

export interface NetHandlers {
  onJoin(p: PlayerInfo): void;
  onLeave(id: string): void;
  onMove(m: MoveMsg): void;
}

const CHANNEL = 'arena:main';
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
        if (!meta) continue;
        this.known.add(id);
        h.onJoin({ id, name: meta.name, character: meta.character });
      }
      for (const id of [...this.known]) {
        if (!now.has(id)) {
          this.known.delete(id);
          h.onLeave(id);
        }
      }
    });
    channel.on('broadcast', { event: 'move' }, ({ payload }) => {
      const m = payload as MoveMsg;
      if (m.id !== this.id) h.onMove(m);
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
  sendMove(x: number, z: number, ry: number, now: number): void {
    if (!this.channel || !this.ready || now - this.lastSent < SEND_INTERVAL_MS) return;
    this.lastSent = now;
    const payload: MoveMsg = {
      id: this.id,
      x: Math.round(x * 100) / 100,
      z: Math.round(z * 100) / 100,
      ry: Math.round(ry * 100) / 100,
    };
    void this.channel.send({ type: 'broadcast', event: 'move', payload });
  }
}
