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
  homem_alternativo: { scale: 1.04, hair: "mohawk", hairColor: 0xb14dff },
  menino: { scale: 0.78, hair: "cap", hairColor: 0x2f6fdd },
  mulher_comum: { scale: 0.96, hair: "long", hairColor: 0x5a3825 },
  mulher_alternativa: { scale: 0.98, hair: "bob", hairColor: 0x1fc7b6 },
  menina: { scale: 0.78, hair: "pigtails", hairColor: 0xd9a441 },
  policial: { scale: 1.02, hair: "police", hairColor: 0x15233f, belt: true },
};

export function lookOf(character: CharacterId | undefined): CharacterLook {
  return (character && CHARACTER_LOOKS[character]) || CHARACTER_LOOKS.homem_comum;
}
