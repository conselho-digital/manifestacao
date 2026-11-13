import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CHARACTERS, type CharacterName } from '../game/characters';
import { MAP } from '../game/map';
import { cleanRtc, type RtcKind } from './voice';
import { cleanLook, HEX, type TeamLook } from '../game/teams';
import { BIKE_MODELS, CAR_MODELS } from '../game/vehicle';
import type { SprayMsg } from '../game/graffiti';

export interface PlayerInfo {
  id: string;
  name: string;
  character: CharacterName;
  /** equipe (nome e duas cores), ou null */
  team: TeamLook | null;
  /** veículo pessoal chamado da garagem (modelo, cores da equipe, id da equipe e onde está parado), ou null */
  veh: VehInfo | null;
}

export interface VehInfo { m: string; c1: string; c2: string; t: string; x: number; z: number; h: number }

/** Valida o veículo pessoal que veio da rede. */
export function cleanVeh(v: unknown): VehInfo | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const models = [...CAR_MODELS, ...BIKE_MODELS] as readonly string[];
  const x = finite(o.x, LIMIT);
  const z = finite(o.z, LIMIT);
  const h = finite(o.h, 100);
  if (typeof o.m !== 'string' || !models.includes(o.m) || x === null || z === null || h === null) return null;
  const c1 = typeof o.c1 === 'string' && HEX.test(o.c1) ? o.c1.toLowerCase() : '#c8ccd2';
  const c2 = typeof o.c2 === 'string' && HEX.test(o.c2) ? o.c2.toLowerCase() : '#2b2e33';
  const t = typeof o.t === 'string' ? o.t.slice(0, 40) : '';
  return { m: o.m, c1, c2, t, x, z, h };
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
  /** arma: 0 nada/punho, 1 fuzil, 2 fuzil mirando, 3 bandeira, 4 pistola, 5 pistola mirando, 6 placa, 7 taco de críquete, 8 taco de beisebol, 9–13 garrafa/cano/cutelo/foice/machado, 14–19 M4A1/M16/Honey Badger (par = baixo, ímpar = mirando), 20 lata de spray, 21 pintando, 22 faca */
  w: number;
  /** inclinação da mira (rad) */
  pt: number;
  /** dono do veículo pessoal que está dirigindo (quando v = 8) */
  vo: string;
  /** vida (0–100) */
  hp: number;
  /** protegido (60 s depois de renascer) */
  pr: boolean;
}

/** Tiro: de (x1,y1,z1) até (x2,y2,z2). h = id de quem foi acertado ('' = ninguém). */
export interface ShotMsg {
  id: string;
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  h: string;
  /** r = AK-47, m = M4A1, q = M16, h = Honey Badger, f = soco, p = pistola, b = arma branca, k = chute */
  k: 'r' | 'm' | 'q' | 'h' | 'f' | 'p' | 'b' | 'k';
  /** tiro na cabeça */
  hs: boolean;
}

export interface KillMsg { k: string; v: string; w: string }
export interface ChatMsg { id: string; t: string }

export interface NetHandlers {
  onJoin(p: PlayerInfo): void;
  /** alguém trocou de personagem ou de equipe */
  onUpdate(p: PlayerInfo): void;
  onLeave(id: string): void;
  onMove(m: MoveMsg): void;
  onShot(m: ShotMsg): void;
  onKill(m: KillMsg): void;
  onChat(m: ChatMsg): void;
  /** alguém pintou uma parede com a lata de spray */
  onSpray(m: SprayMsg): void;
  /** alguém buzinou, ligou sirene/luzes ou bateu (x, z do veículo; kind: ver `sendHorn`) */
  onHorn(m: { id: string; x: number; z: number; kind: number }): void;
  /** sinalização da voz (WebRTC): oferta, resposta e candidatos ICE de quem fala comigo */
  onRtc(m: { from: string; k: RtcKind; d: unknown }): void;
}

/** Sala: arena:main; ?room=nome troca (para testes, sem misturar com os jogadores de verdade). */
const CHANNEL = `arena:${(new URLSearchParams(location.search).get('room') ?? 'main').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'main'}`;
export const MAX_NAME = 16;
export const MAX_CHAT = 80;
/** máximo de jogadores no mapa ao mesmo tempo (contando você) */
/** `?max=N` (só no npm run dev) baixa o limite para testar a sessão seguinte sem precisar de 30 abas */
export const MAX_PLAYERS = (import.meta.env.DEV && Number(new URLSearchParams(location.search).get('max'))) || 30;
export const FULL = 'MAPA_CHEIO';
/** quantas sessões de 30 jogadores existem no máximo (12 × 30 = 360 jogadores) */
export const MAX_ROOMS = 12;
const MAX_REMOTE = MAX_PLAYERS - 1; // limite de jogadores remotos renderizados
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
  const v = typeof m.v === 'number' && Number.isInteger(m.v) && m.v >= -1 && m.v <= 8 ? m.v : -1;
  const w = typeof m.w === 'number' && Number.isInteger(m.w) && m.w >= 1 && m.w <= 22 ? m.w : 0;
  const pt = finite(m.pt ?? 0, 1.6) ?? 0;
  const hp = typeof m.hp === 'number' && Number.isFinite(m.hp) ? Math.max(0, Math.min(100, Math.round(m.hp))) : 100;
  const vo = v === 8 && idOk(m.vo) ? m.vo : '';
  return { id: m.id, x, y, z, ry, a, v: v === 8 && !vo ? -1 : v, vo, w, pt, hp, pr: m.pr === true };
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
    h, k: m.k === 'f' || m.k === 'p' || m.k === 'b' || m.k === 'k' || m.k === 'm' || m.k === 'q' || m.k === 'h' ? m.k : 'r', hs: m.hs === true,
  };
}

function cleanSpray(raw: unknown): SprayMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const x = finite(m.x, LIMIT);
  const z = finite(m.z, LIMIT);
  const y = finite(m.y, 12);
  const w = finite(m.w, 4);
  if (!idOk(m.id) || x === null || z === null || y === null || w === null || w < 0.5) return null;
  const nx = finite(m.nx, 1);
  const nz = finite(m.nz, 1);
  if (nx === null || nz === null || Math.abs(Math.hypot(nx, nz) - 1) > 0.05) return null; // direção da parede (horizontal, vetor unitário)
  return { id: m.id, x, y, z, nx, nz, w, t: typeof m.t === 'string' ? m.t.slice(0, 64) : '' };
}

const MIN_SPRAY_GAP_MS = 900;
const MIN_HORN_GAP_MS = 250;
const SEND_INTERVAL_MS = 80; // ~12 envios/s

export class Net {
  readonly id = crypto.randomUUID();
  private channel: RealtimeChannel | null = null;
  private lastSent = 0;
  private ready = false;
  private known = new Set<string>();
  private sigs = new Map<string, string>();
  private lastShotAt = new Map<string, number>();
  private lastChatAt = new Map<string, number>();
  private lastSprayAt = new Map<string, number>();
  private lastHornAt = new Map<string, number>();

  /** Entra na sala. Retorna false se o Supabase não estiver configurado. */
  /** Número da sessão (1 = a principal; 2, 3... quando as anteriores estão cheias). */
  roomIndex = 1;

  /**
   * Entra na primeira sessão com vaga: `arena:main` e, se já houver 30 jogadores, `arena:main-2`, `-3`... (até MAX_ROOMS).
   * Cada sessão é um canal separado (presence, movimento, tiros e voz só valem dentro dela). Sempre tenta a 1ª primeiro,
   * então as sessões de cima esvaziam e voltam a receber gente quando alguém sai.
   */
  async join(me: Omit<PlayerInfo, 'id'>, h: NetHandlers): Promise<boolean> {
    if (!supabase) return false;
    for (let i = 1; i <= MAX_ROOMS; i++) {
      try {
        const ok = await this.joinRoom(i === 1 ? CHANNEL : `${CHANNEL}-${i}`, me, h);
        if (ok) { this.roomIndex = i; return true; }
      } catch (e) {
        if (e instanceof Error && e.message === FULL && i < MAX_ROOMS) continue; // cheia: tenta a próxima sessão
        throw e;
      }
    }
    return false;
  }

  private async joinRoom(room: string, me: Omit<PlayerInfo, 'id'>, h: NetHandlers): Promise<boolean> {
    if (!supabase) return false;
    const channel = supabase.channel(room, { config: { presence: { key: this.id } } });
    this.channel = channel;
    // a lista de presença só vale depois que eu entrei (se a sessão estiver cheia, ninguém dela vira jogador remoto)
    let accepted = false;
    let firstSync = (): void => undefined;
    const synced = new Promise<void>((resolve) => { firstSync = resolve; });

    const onSync = (): void => {
      firstSync();
      if (!accepted) return;
      const state = channel.presenceState<Omit<PlayerInfo, 'id'>>();
      const now = new Set(Object.keys(state));
      for (const [id, metas] of Object.entries(state)) {
        if (id === this.id) continue;
        const meta = metas[metas.length - 1]; // o último track é o mais novo
        const character = cleanCharacter(meta?.character);
        if (!meta || !character) continue;
        const info: PlayerInfo = { id, name: cleanName(meta.name), character, team: cleanLook(meta.team), veh: cleanVeh(meta.veh) };
        const v = info.veh;
        const sig = `${info.character}|${info.name}|${info.team?.c1 ?? ''}${info.team?.c2 ?? ''}${info.team?.name ?? ''}|${v ? `${v.m}${v.c1}${v.c2}${v.t}${v.x.toFixed(1)}${v.z.toFixed(1)}${v.h.toFixed(2)}` : ''}`;
        if (this.known.has(id)) {
          if (this.sigs.get(id) !== sig) { this.sigs.set(id, sig); h.onUpdate(info); }
          continue;
        }
        if (this.known.size >= MAX_REMOTE) continue;
        this.known.add(id);
        this.sigs.set(id, sig);
        h.onJoin(info);
      }
      for (const id of [...this.known]) {
        if (!now.has(id)) {
          this.known.delete(id);
          this.sigs.delete(id);
          this.lastShotAt.delete(id);
          this.lastChatAt.delete(id);
          this.lastSprayAt.delete(id);
          this.lastHornAt.delete(id);
          h.onLeave(id);
        }
      }
    };
    channel.on('presence', { event: 'sync' }, onSync); // registrado ANTES de assinar (depois de assinar o Supabase recusa)
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

    channel.on('broadcast', { event: 'spray' }, ({ payload }) => {
      const m = cleanSpray(payload);
      if (!m || m.id === this.id || !this.known.has(m.id)) return;
      const now = performance.now();
      if (now - (this.lastSprayAt.get(m.id) ?? 0) < MIN_SPRAY_GAP_MS) return;
      this.lastSprayAt.set(m.id, now);
      h.onSpray(m);
    });

    channel.on('broadcast', { event: 'horn' }, ({ payload }) => {
      const m = payload as Record<string, unknown> | null;
      if (!m || !idOk(m.id) || m.id === this.id || !this.known.has(m.id)) return;
      const x = finite(m.x, LIMIT);
      const z = finite(m.z, LIMIT);
      if (x === null || z === null) return;
      const now = performance.now();
      if (now - (this.lastHornAt.get(m.id) ?? 0) < MIN_HORN_GAP_MS) return;
      this.lastHornAt.set(m.id, now);
      h.onHorn({ id: m.id, x, z, kind: typeof m.b === 'number' && Number.isInteger(m.b) && m.b >= 0 && m.b <= 5 ? m.b : 0 });
    });

    channel.on('broadcast', { event: 'rtc' }, ({ payload }) => {
      const m = cleanRtc(payload);
      if (!m || m.to !== this.id || m.from === this.id || !this.known.has(m.from)) return;
      h.onRtc({ from: m.from, k: m.k, d: m.d });
    });

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
    });
    // sessão cheia? espera a 1ª lista de presença (até 2 s) e confere quantos já estão dentro
    await Promise.race([synced, new Promise<void>((resolve) => { window.setTimeout(resolve, 2000); })]);
    const others = Object.keys(channel.presenceState()).filter((k) => k !== this.id).length;
    if (others >= MAX_PLAYERS) {
      this.channel = null;
      await channel.unsubscribe();
      throw new Error(FULL);
    }
    await channel.track(me);
    accepted = true;
    this.ready = true;
    onSync(); // processa quem já estava na sessão
    return true;
  }

  /** Troca de personagem/equipe: avisa os outros pela presence. */
  updateMe(me: Omit<PlayerInfo, 'id'>): void {
    if (this.channel && this.ready) void this.channel.track(me);
  }

  private send(event: string, payload: object): void {
    if (this.channel && this.ready) void this.channel.send({ type: 'broadcast', event, payload });
  }

  /** Envia posição no máximo ~12x por segundo. */
  sendMove(x: number, y: number, z: number, ry: number, a: string, v: number, vo: string, w: number, pt: number, hp: number, pr: boolean, now: number): void {
    if (now - this.lastSent < SEND_INTERVAL_MS) return;
    this.lastSent = now;
    this.send('move', {
      id: this.id,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z: Math.round(z * 100) / 100,
      ry: Math.round(ry * 100) / 100,
      a, v, vo, w, pt: Math.round(pt * 20) / 20, hp: Math.round(hp), pr,
    });
  }

  sendShot(m: Omit<ShotMsg, 'id'>): void {
    this.send('shot', { ...m, id: this.id });
  }

  sendKill(victim: string, killer: string, weapon: string): void {
    this.send('kill', { k: killer, v: victim, w: weapon });
  }

  /** Sinalização da voz para um jogador. */
  sendRtc(to: string, k: RtcKind, d: unknown): void {
    this.send('rtc', { from: this.id, to, k, d });
  }

  /** kind: 0 buzina de carro, 1 moto, 2 aviso de que a sirene da viatura continua ligada (a cada 1 s), 3 aviso de luzes ligadas, 4 buzina de caminhão (viatura com sirene), 5 batida de lataria */
  sendHorn(x: number, z: number, kind: 0 | 1 | 2 | 3 | 4 | 5): void {
    this.send('horn', { id: this.id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, b: kind });
  }

  sendSpray(m: Omit<SprayMsg, 'id'>): void {
    this.send('spray', { ...m, id: this.id });
  }

  sendChat(text: string): void {
    const t = cleanChat(text);
    if (t) this.send('chat', { id: this.id, t });
  }
}
