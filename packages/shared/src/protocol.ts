/**
 * Protocolo de mensagens em tempo real (cliente <-> servidor de jogo).
 *
 * Na Fase 0 o movimento é local e nada disto trafega ainda; os tipos já
 * existem para o servidor autoritativo das próximas fases. O cliente envia
 * INPUT (intenção); o servidor responde com ESTADO (verdade).
 */

import type { CharacterId, FlagId } from "./catalog.js";
import type { MapId } from "./maps.js";
import type { TeamId } from "./teams.js";
import type { Facing, MoveInput } from "./world.js";

/** Avatar escolhido pelo jogador: time, apelido, visual, personagem e bandeira. */
export interface AvatarConfig {
  team: TeamId;
  nickname: string;
  /** Cor da camisa (0xrrggbb numérico). */
  shirt: number;
  character: CharacterId;
  flag: FlagId;
  /** Mapa em que o jogador entra (cada mapa tem o seu canal). */
  map: MapId;
}

/** Estado de um jogador visível na avenida, como o servidor o reporta. */
export interface PlayerState {
  id: string;
  nickname: string;
  team: TeamId;
  shirt: number;
  x: number;
  y: number;
  facing: Facing;
}

/** Mensagens que o CLIENTE envia ao servidor (intenção, não verdade). */
export type ClientMessage =
  | { t: "join"; avatar: AvatarConfig }
  | { t: "move"; input: MoveInput }
  | { t: "chat"; scope: "global" | "near"; text: string }
  | { t: "leave" };

/** Mensagens que o SERVIDOR envia ao cliente (estado autoritativo). */
export type ServerMessage =
  | { t: "welcome"; selfId: string }
  | { t: "snapshot"; players: PlayerState[] }
  | { t: "chat"; from: string; scope: "global" | "near"; text: string }
  | { t: "team_score"; scores: Record<TeamId, number> };

export const MAX_NICKNAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;
