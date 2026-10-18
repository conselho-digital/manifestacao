import type { CharacterId } from "@manifestacao/shared";

/**
 * Registro de modelos 3D por personagem. Quando um GLB CC0 estiver disponível
 * em `public/models/<arquivo>.glb`, aponte a URL aqui — o Avatar carrega o
 * modelo; na ausência, usa o avatar geométrico (fallback).
 *
 * Fontes CC0 recomendadas (ver CLAUDE.md §6 e CREDITS.md): KayKit, Quaternius.
 * Coloque os arquivos em apps/client/public/models/ e registre abaixo.
 */
export const CHARACTER_MODELS: Record<CharacterId, string | null> = {
  comum: null,
  jovem: null,
  trabalhador: null,
  tiozao: null,
};

export function modelUrlFor(character: CharacterId): string | null {
  return CHARACTER_MODELS[character] ?? null;
}
