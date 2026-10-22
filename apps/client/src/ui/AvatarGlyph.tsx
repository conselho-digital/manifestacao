import type { CharacterId } from "@manifestacao/shared";
import { lookOf } from "../game/characterLook.js";

/** Mesma cor de pele usada no corpo procedural (game/Avatar.tsx ProceduralBody). */
const SKIN_COLOR = "#f2d2b6";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * Ícone do avatar: a mesma silhueta capsule+esfera usada no personagem 3D
 * geométrico (ver game/Avatar.tsx), só que em SVG 2D para as telas de UI, com o cabelo/chapéu de cada personagem.
 * Desenho próprio, sem referência externa.
 */
export function AvatarGlyph({ color, size = 48, character }: { color: string; size?: number; character?: CharacterId }) {
  const look = lookOf(character);
  const hair = hex(look.hairColor);
  const kid = look.scale < 0.9;
  // Crianças: corpo e cabeça menores, apoiados na base.
  const bodyY = kid ? 26 : 20;
  const bodyH = kid ? 16 : 22;
  const headY = kid ? 19 : 13;
  const headR = kid ? 8 : 9;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {look.hair === "long" && <rect x={14} y={headY - 2} width={20} height={20} rx={8} fill={hair} />}
      {look.hair === "pigtails" && (
        <>
          <circle cx={13} cy={headY + 5} r={3.4} fill={hair} />
          <circle cx={35} cy={headY + 5} r={3.4} fill={hair} />
        </>
      )}
      <rect x={kid ? 16 : 14} y={bodyY} width={kid ? 16 : 20} height={bodyH} rx={kid ? 8 : 10} fill={color} />
      {look.belt && <rect x={14} y={bodyY + 11} width={20} height={3} fill="#15181d" />}
      <circle cx={24} cy={headY} r={headR} fill={SKIN_COLOR} />
      {(look.hair === "short" || look.hair === "bob" || look.hair === "long" || look.hair === "pigtails") && (
        <path
          d={`M${24 - headR} ${headY} a${headR} ${headR} 0 0 1 ${headR * 2} 0 q-${headR} -${look.hair === "bob" ? 1 : 4} -${headR * 2} 0z`}
          fill={hair}
        />
      )}
      {look.hair === "bob" && <rect x={24 - headR - 1} y={headY - 2} width={3} height={9} rx={1.5} fill={hair} />}
      {look.hair === "mohawk" && <path d="M19 9 L21 2 L24 8 L27 2 L29 9 Z" fill={hair} />}
      {(look.hair === "cap" || look.hair === "police") && (
        <>
          <path d={`M${24 - headR} ${headY - 1} a${headR} ${headR} 0 0 1 ${headR * 2} 0z`} fill={hair} />
          <rect x={24 - headR + 1} y={headY - 1} width={headR * 2 + 3} height={2.4} rx={1} fill={hair} />
          {look.hair === "police" && <circle cx={24} cy={headY - 5} r={1.6} fill="#e8c24a" />}
        </>
      )}
    </svg>
  );
}
