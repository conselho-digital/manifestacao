import { useMemo } from "react";
import { Shape } from "three";
import { useGLTF } from "@react-three/drei";
import type { VehicleId } from "@manifestacao/shared";
import { useProximitySound } from "./ProximitySound.js";
import { useUserGestureUnlocked } from "./useUserGesture.js";

export type FlagEmblem = "star-burst";

/**
 * Emblema desenhado por código (nunca uma imagem importada): um polígono de
 * N pontas com raio alternado (externo/interno) — uma estrela "sparkle" de
 * um único traço, não duas estrelas sobrepostas (que formariam um hexagrama,
 * símbolo real). Deliberadamente diferente de qualquer bandeira partidária
 * conhecida (nº de pontas e estilo distintos).
 */
function StarBurst({ color = 0xf2f4f7, points = 6, size = 0.2 }: { color?: number; points?: number; size?: number }) {
  const shape = useMemo(() => {
    const outer = size;
    const inner = size * 0.42;
    const s = new Shape();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }, [points, size]);

  return (
    <mesh position={[0, 0, 0.002]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={color} side={2} />
    </mesh>
  );
}

/** Bandeira carregada ao lado do avatar: mastro, tecido colorido e emblema opcional. */
export function Flag3D({ color, emblem }: { color: number; emblem?: FlagEmblem }) {
  return (
    <group position={[0.45, 0, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.8, 6]} />
        <meshStandardMaterial color={0x8a8f98} />
      </mesh>
      <group position={[0.5, 2.3, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.6]} />
          <meshStandardMaterial color={color} side={2} />
        </mesh>
        {emblem === "star-burst" && <StarBurst />}
      </group>
    </group>
  );
}

/** Representação simples do veículo sob/ao redor do avatar. */
export function Vehicle3D({ vehicle }: { vehicle: VehicleId }) {
  if (vehicle === "nenhum") return null;
  if (vehicle === "moto") {
    return (
      <group>
        <mesh position={[0, 0.45, 0.2]}>
          <boxGeometry args={[0.5, 0.35, 1.6]} />
          <meshStandardMaterial color={0x2b2f36} />
        </mesh>
        <mesh position={[0, 0.3, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.18, 16]} />
          <meshStandardMaterial color={0x111418} />
        </mesh>
        <mesh position={[0, 0.3, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 0.18, 16]} />
          <meshStandardMaterial color={0x111418} />
        </mesh>
      </group>
    );
  }
  // carro e carro_som: caixa com rodas; o carro de som ganha uma caçamba.
  const bodyColor = vehicle === "carro_som" ? 0x3a424c : 0x4a90d9;
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.6, 0.7, 3]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      {vehicle === "carro_som" && (
        <>
          <mesh position={[0, 1.15, -0.6]}>
            <boxGeometry args={[1.4, 0.8, 1.2]} />
            <meshStandardMaterial color={0x272d37} />
          </mesh>
          <CarSomSound />
        </>
      )}
      {[
        [-0.8, 0.3, 1] as const,
        [0.8, 0.3, 1] as const,
        [-0.8, 0.3, -1] as const,
        [0.8, 0.3, -1] as const,
      ].map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 16]} />
          <meshStandardMaterial color={0x111418} />
        </mesh>
      ))}
    </group>
  );
}

/** Modelo glTF do personagem (usado quando há URL registrada). */
export function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

/**
 * Som ambiente do carro de som (síntese WebAudio, sem arquivo de terceiros).
 * Herda a posição do veículo por estar montado dentro do mesmo <group>.
 * Precisa de um gesto do usuário para o AudioContext iniciar (política dos
 * navegadores) — por isso só liga no primeiro clique/toque na página.
 */
function CarSomSound() {
  const unlocked = useUserGestureUnlocked();
  const audio = useProximitySound(unlocked);
  return audio ? <primitive object={audio} /> : null;
}
