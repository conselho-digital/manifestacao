import { TEAM_IDS, type CharacterId, type TeamId, type VehicleId } from "@manifestacao/shared";
import { modelOverride } from "../config/gameConfig.js";

/**
 * Registro de modelos 3D. Os arquivos .glb são enviados pelo admin (painel de
 * admin → bucket `game-assets`) e ficam em `game_config.models`; na ausência,
 * o jogo usa as formas geométricas geradas por código (fallback).
 *
 * Fontes CC0 recomendadas (ver CLAUDE.md §6 e CREDITS.md): KayKit, Quaternius.
 */
/** Modelos que já vêm no jogo: um por personagem e por equipe (roupa da equipe), com esqueleto humanoide reconhecido sozinho. */
const SHIPPED_PREFIX: Record<CharacterId, string> = { homem_comum: "homem", mulher_comum: "mulher" };
export function shippedModel(character: CharacterId, team: TeamId): string | null {
  return Object.hasOwn(SHIPPED_PREFIX, character) ? `/models/characters/${SHIPPED_PREFIX[character]}_${team}.glb` : null;
}

/**
 * Modelo do personagem na equipe: o enviado no admin para a equipe → o enviado para todas → o que já vem no jogo
 * (camisa da equipe) → o boneco geométrico.
 */
export function modelUrlFor(character: CharacterId, team: TeamId = TEAM_IDS[0]!): string | null {
  if (!Object.hasOwn(SHIPPED_PREFIX, character)) return null;
  return modelOverride(`character:${character}:${team}`) ?? modelOverride(`character:${character}`) ?? shippedModel(character, team);
}

/** Veículos que já vêm no jogo (frente em +Z, chão em y=0, eixo traseiro em z≈-0,7). */
const SHIPPED_VEHICLES: Partial<Record<VehicleId, string>> = { moto: "/models/vehicles/moto.glb", moto2: "/models/vehicles/moto2.glb" };

/** Modelo do veículo: o enviado no admin → o que já vem no jogo → o geométrico. */
export function vehicleModelUrl(vehicle: VehicleId): string | null {
  return vehicle === "nenhum" ? null : modelOverride(`vehicle:${vehicle}`) ?? SHIPPED_VEHICLES[vehicle] ?? null;
}

/** Modelo 3D do spray: o da opção (spray:<slug>), senão o geral ("spray"), senão nenhum (mancha). */
export function sprayModelUrl(style?: string): string | null {
  return (style ? modelOverride(`spray:${style}`) : null) ?? modelOverride("spray");
}

/** Imagem da bandeira da EQUIPE (enviada pelo admin): é a marca do spray de quem joga nessa equipe. */
export function teamImageUrl(team: TeamId | undefined): string | null {
  return team ? modelOverride(`teamimg:${team}`) : null;
}

/** Imagem do spray: a bandeira da equipe de quem pixa. null = sem imagem enviada → bolinha de tinta na cor da equipe. */
export function sprayImageFor(team: TeamId | undefined): string | null {
  return teamImageUrl(team);
}

/** Imagem para o ícone de bandeira da equipe nas telas de entrada e opções. */
export function teamIconImageUrl(team: TeamId): string | null {
  return teamImageUrl(team);
}
