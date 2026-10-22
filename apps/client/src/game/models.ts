import type { CharacterId, FlagId, TeamId, VehicleId } from "@manifestacao/shared";
import { modelOverride } from "../config/gameConfig.js";

/**
 * Registro de modelos 3D. Os arquivos .glb são enviados pelo admin (painel de
 * admin → bucket `game-assets`) e ficam em `game_config.models`; na ausência,
 * o jogo usa as formas geométricas geradas por código (fallback).
 *
 * Fontes CC0 recomendadas (ver CLAUDE.md §6 e CREDITS.md): KayKit, Quaternius.
 */
export const CHARACTER_MODELS: Record<CharacterId, string | null> = {
  comum: null,
  jovem: null,
  trabalhador: null,
  tiozao: null,
};

/** Prioridade: modelo do personagem NA equipe → modelo do personagem → padrão estático. */
export function modelUrlFor(character: CharacterId, team?: TeamId): string | null {
  // Defesa em profundidade: só lê se for chave própria do registro (evita
  // resolver para algo herdado do prototype caso o valor não tenha passado
  // por isCharacterId antes de chegar aqui).
  if (!Object.hasOwn(CHARACTER_MODELS, character)) return null;
  return (
    (team ? modelOverride(`character:${character}:${team}`) : null) ??
    modelOverride(`character:${character}`) ??
    CHARACTER_MODELS[character] ??
    null
  );
}

export function vehicleModelUrl(vehicle: VehicleId): string | null {
  return vehicle === "nenhum" ? null : modelOverride(`vehicle:${vehicle}`);
}

export function flagModelUrl(flag: FlagId): string | null {
  return flag === "nenhuma" ? null : modelOverride(`flag:${flag}`);
}

/** Modelo 3D do spray: o da opção (spray:<slug>), senão o geral ("spray"), senão nenhum (mancha). */
export function sprayModelUrl(style?: string): string | null {
  return (style ? modelOverride(`spray:${style}`) : null) ?? modelOverride("spray");
}

/** Imagem da bandeira (enviada pelo admin): vira o tecido da bandeira carregada e a marca do spray. */
export function flagImageUrl(flag: FlagId | undefined): string | null {
  return !flag || flag === "nenhuma" || flag === "time" ? null : modelOverride(`flagimg:${flag}`);
}

/** Imagem da bandeira da EQUIPE (enviada pelo admin): é a marca do spray de quem joga nessa equipe. */
export function teamImageUrl(team: TeamId | undefined): string | null {
  return team ? modelOverride(`teamimg:${team}`) : null;
}
