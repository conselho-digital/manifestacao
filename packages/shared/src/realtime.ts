/**
 * Tipos para o multiplayer MVP sobre Supabase Realtime (presence + broadcast).
 *
 * Não é autoritativo (ver CLAUDE.md §4): posição é "best effort". O servidor
 * autoritativo dedicado, quando existir, usa os tipos de `protocol.ts`.
 */

import type { CharacterId, FlagId, VehicleId } from "./catalog.js";
import type { TeamId } from "./teams.js";
import type { Facing } from "./world.js";

/** Nome do canal Realtime da avenida. */
export const AVENUE_CHANNEL = "avenue";

/** Estado publicado via presence (quem está na avenida). */
export interface PresenceState {
  id: string;
  nickname: string;
  team: TeamId;
  shirt: number;
  character: CharacterId;
  flag: FlagId;
  /** Cartaz ativo que o jogador carrega (só o ID; o texto vem do banco). */
  signId?: string;
}

/** Evento de broadcast: movimento + estado dinâmico de um jogador. */
export interface MoveBroadcast {
  id: string;
  x: number;
  z: number;
  facing: Facing;
  vehicle: VehicleId;
  flag: FlagId;
  /** Direção do veículo (radianos em torno de Y) — só dirigindo. */
  heading?: number;
  /** Quanto a moto está empinada, de 0 a 1 — só moto. */
  wheelie?: number;
}

/** Evento de broadcast: mensagem de chat (efêmera). */
export interface ChatBroadcast {
  id: string;
  nickname: string;
  team: TeamId;
  text: string;
}

/**
 * Evento de broadcast: marca de spray numa parede (efêmera — nunca persiste
 * em banco, só vive na memória dos clientes conectados; some sozinha após
 * SPRAY_LIFETIME_MS, ver game/spray.ts).
 */
export interface SprayBroadcast {
  /** Id da marca em si (não do remetente — cada spray tem o seu). */
  id: string;
  /** Chave de presence de quem enviou — usada para limitar a taxa na recepção. */
  senderId: string;
  /** Posição no mundo (plano XZ) onde a marca aparece. */
  x: number;
  z: number;
  /** Altura e normal da superfície pintada (parede, tronco…). Ausentes = chão. */
  y?: number;
  nx?: number;
  ny?: number;
  nz?: number;
  color: number;
  /** Opção de spray usada (slug); ausente/ inválida = clássico. */
  style?: string;
  /** Direção (rad, em torno de Y) de quem pichou até a marca: no chão, o topo da imagem aponta para lá e a base fica no pé dele. */
  rot?: number;
}

/** Nomes dos eventos de broadcast. */
export const BROADCAST = {
  move: "move",
  chat: "chat",
  spray: "spray",
  /** Sinalização WebRTC do palanque (claim/release/join/offer/answer/ice). */
  voice: "voice",
  /** Golpe com a bandeira (só a animação: quem recebe toca os 0,7 s no jogador que bateu). */
  hit: "hit",
  /** Golpe que acertou alguém (alvo reage; no 5º seguido, cai). */
  impact: "impact",
} as const;

export interface ImpactBroadcast {
  senderId: string;
  /** Chave de presence de quem levou o golpe. */
  targetId: string;
  kind?: "flag" | "punch";
}

export interface HitBroadcast {
  /** Chave de presence de quem bateu. */
  senderId: string;
  /** "flag" = golpe com a bandeira; "punch" = soco (sem bandeira). Ausente = "flag". */
  kind?: "flag" | "punch";
}
