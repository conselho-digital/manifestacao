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
}

/** Evento de broadcast: movimento + estado dinâmico de um jogador. */
export interface MoveBroadcast {
  id: string;
  x: number;
  z: number;
  facing: Facing;
  vehicle: VehicleId;
  flag: FlagId;
}

/** Evento de broadcast: mensagem de chat (efêmera). */
export interface ChatBroadcast {
  id: string;
  nickname: string;
  team: TeamId;
  text: string;
}

/** Nomes dos eventos de broadcast. */
export const BROADCAST = {
  move: "move",
  chat: "chat",
} as const;
