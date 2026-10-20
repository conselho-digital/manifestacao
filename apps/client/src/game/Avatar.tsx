import { forwardRef, Suspense } from "react";
import { Group } from "three";
import { Html } from "@react-three/drei";
import { flagColor, type FlagId, type VehicleId } from "@manifestacao/shared";
import { Flag3D, Vehicle3D, GlbModel } from "./props3d.js";
import { flagModelUrl } from "./models.js";

interface AvatarProps {
  /** Cor da camisa/time (0xrrggbb). */
  color: number;
  name?: string;
  flag?: FlagId;
  vehicle?: VehicleId;
  /** URL de um modelo glTF; se ausente, usa o avatar geométrico. */
  modelUrl?: string | null;
}

/** Corpo geométrico (fallback quando não há modelo glTF). */
function ProceduralBody({ color }: { color: number }) {
  return (
    <>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.8, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color={0xf2d2b6} />
      </mesh>
    </>
  );
}

/** Bandeira: modelo .glb do admin quando houver; senão o mastro com tecido. */
function FlagProp({ flag, color }: { flag: FlagId; color: number }) {
  const cloth = (
    <Flag3D
      color={flagColor(flag, color)}
      // Vermelha: emblema "star-burst" (6 pontas) — não um emblema real de
      // partido. Verde: faixa amarela sobre o verde (cores nacionais
      // genéricas, sem brasão nem layout de bandeira real nenhuma).
      emblem={flag === "vermelha" ? "star-burst" : flag === "verde" ? "stripe" : undefined}
    />
  );
  const url = flagModelUrl(flag);
  if (!url) return cloth;
  return (
    <Suspense fallback={cloth}>
      <group position={[0.45, 0, 0]}>
        <GlbModel url={url} fallback={cloth} />
      </group>
    </Suspense>
  );
}

/**
 * Avatar: corpo (modelo glTF CC0 ou geométrico), bandeira opcional, veículo
 * opcional e etiqueta de apelido. Usado pelo jogador local e pelos remotos.
 */
export const Avatar = forwardRef<Group, AvatarProps>(function Avatar(
  { color, name, flag = "nenhuma", vehicle = "nenhum", modelUrl = null },
  ref,
) {
  return (
    <group ref={ref}>
      {modelUrl ? (
        <Suspense fallback={<ProceduralBody color={color} />}>
          <GlbModel url={modelUrl} fallback={<ProceduralBody color={color} />} />
        </Suspense>
      ) : (
        <ProceduralBody color={color} />
      )}

      {flag !== "nenhuma" && <FlagProp flag={flag} color={color} />}
      <Vehicle3D vehicle={vehicle} />

      {name && (
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
      )}
    </group>
  );
});
