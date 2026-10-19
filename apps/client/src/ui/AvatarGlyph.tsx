/** Mesma cor de pele usada no corpo procedural (game/Avatar.tsx ProceduralBody). */
const SKIN_COLOR = "#f2d2b6";

/**
 * Ícone do avatar: a mesma silhueta capsule+esfera usada no personagem 3D
 * geométrico (ver game/Avatar.tsx), só que em SVG 2D para as telas de UI.
 * Desenho próprio, sem referência externa.
 */
export function AvatarGlyph({ color, size = 48 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x={14} y={20} width={20} height={22} rx={10} fill={color} />
      <circle cx={24} cy={13} r={9} fill={SKIN_COLOR} />
    </svg>
  );
}
