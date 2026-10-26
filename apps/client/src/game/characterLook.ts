import type { CharacterId } from "@manifestacao/shared";

/** Aparência dos personagens geométricos (enquanto não há modelo .glb): escala, cabelo/chapéu e detalhes. */
export type HairStyle = "short" | "mohawk" | "long" | "bob" | "pigtails" | "cap" | "police";

export interface CharacterLook {
  /** Escala do corpo todo (crianças menores). */
  scale: number;
  hair: HairStyle;
  hairColor: number;
  /** Cinto preto na cintura (policial). */
  belt?: boolean;
}

export const CHARACTER_LOOKS: Record<CharacterId, CharacterLook> = {
  homem_comum: { scale: 1, hair: "short", hairColor: 0x3b2a1e },
  mulher_comum: { scale: 0.96, hair: "long", hairColor: 0x5a3825 },
  renam_santos: { scale: 1, hair: "short", hairColor: 0x1e1612 },
  jair_bolsonaro: { scale: 1, hair: "short", hairColor: 0x1c1c1c },
  eneias: { scale: 1, hair: "short", hairColor: 0x2a2a2a },
};

export function lookOf(character: CharacterId | undefined): CharacterLook {
  return (character && CHARACTER_LOOKS[character]) || CHARACTER_LOOKS.homem_comum;
}
