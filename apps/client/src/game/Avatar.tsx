import { forwardRef } from "react";
import { Group } from "three";
import { Html } from "@react-three/drei";

interface AvatarProps {
  color: number;
  name: string;
}

/**
 * Avatar procedural (placeholder): corpo em cápsula + cabeça, colorido pela
 * camisa do time, com etiqueta de apelido. Será trocado por um modelo glTF
 * CC0 (KayKit/Quaternius) na Fase 2 — a estrutura (um grupo posicionável)
 * já é compatível com `useGLTF`.
 */
export const Avatar = forwardRef<Group, AvatarProps>(function Avatar(
  { color, name },
  ref,
) {
  return (
    <group ref={ref}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.8, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color={0xf2d2b6} />
      </mesh>
      <Html
        position={[0, 2.2, 0]}
        center
        distanceFactor={14}
        occlude
        style={{
          pointerEvents: "none",
          whiteSpace: "nowrap",
          fontSize: "12px",
          fontWeight: 700,
          color: "#f5f6f7",
          textShadow: "0 1px 2px #000",
        }}
      >
        {name}
      </Html>
    </group>
  );
});
