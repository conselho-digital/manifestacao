import { forwardRef, Suspense, useRef } from "react";
import { Group } from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { VEHICLES, flagColor, type FlagId, type VehicleId } from "@manifestacao/shared";
import { WHEELIE_MAX_ANGLE } from "./driving.js";
import { Flag3D, Vehicle3D, GlbModel } from "./props3d.js";
import { flagImageUrl, flagModelUrl } from "./models.js";
import { SignProp } from "./SignProp.js";
import type { SignData } from "./useSigns.js";

interface AvatarProps {
  /** Cor da camisa/time (0xrrggbb). */
  color: number;
  name?: string;
  flag?: FlagId;
  vehicle?: VehicleId;
  /** Cartaz personalizado ativo (texto vem do banco, nunca direto da rede). */
  sign?: SignData | null;
  /** URL de um modelo glTF; se ausente, usa o avatar geométrico. */
  modelUrl?: string | null;
  /** Quanto a moto está empinada (0..1), lido a cada frame (sem re-render). */
  wheelieRef?: { current: number };
}

/** Eixo traseiro da moto: a roda da frente sobe girando em torno daqui. */
const MOTO_REAR_AXLE_Z = -0.7;

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
      imageUrl={flagImageUrl(flag)}
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
  { color, name, flag = "nenhuma", vehicle = "nenhum", sign = null, modelUrl = null, wheelieRef },
  ref,
) {
  const tiltRef = useRef<Group>(null);
  const isMoto = VEHICLES[vehicle]?.kind === "moto";
  // Empinar: inclina corpo + moto em torno do eixo traseiro (frente +Z sobe com rotação negativa em X).
  useFrame(() => {
    const g = tiltRef.current;
    if (!g) return;
    const target = isMoto ? -(wheelieRef?.current ?? 0) * WHEELIE_MAX_ANGLE : 0;
    g.rotation.x += (target - g.rotation.x) * 0.35;
  });
  return (
    <group ref={ref}>
      <group ref={tiltRef} position={[0, 0, MOTO_REAR_AXLE_Z]}>
      <group position={[0, 0, -MOTO_REAR_AXLE_Z]}>
      {modelUrl ? (
        <Suspense fallback={<ProceduralBody color={color} />}>
          <GlbModel url={modelUrl} fallback={<ProceduralBody color={color} />} />
        </Suspense>
      ) : (
        <ProceduralBody color={color} />
      )}

      {flag !== "nenhuma" && <FlagProp flag={flag} color={color} />}
      {sign && <SignProp sign={sign} />}
      <Vehicle3D vehicle={vehicle} />
      </group>
      </group>

      {name && (
        <Html
          position={[0, sign ? 3.2 : 2.2, 0]}
          center
          distanceFactor={14}
          occlude
          // O padrão do drei é um z-index enorme, que passava por cima de loja/opções.
          zIndexRange={[3, 0]}
          className="avatar-name"
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
