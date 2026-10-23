import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Shape, type Group, type SkinnedMesh } from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { VehicleId } from "@manifestacao/shared";
import { useProximitySound } from "./ProximitySound.js";
import { useUserGestureUnlocked } from "./useUserGesture.js";
import { vehicleModelUrl } from "./models.js";
import { ModelBoundary } from "./ModelBoundary.js";
import { createAutoAnimator, type AutoAnimator } from "./autoAnimate.js";
import { getBakedRig, instantiateRig } from "./autoRig.js";
import { rigForUrl } from "../config/rigs.js";

export type FlagEmblem = "star-burst" | "ring" | "stripe";

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

/** Anel vazado simples — formas geométricas genéricas, sem significado partidário. */
function RingEmblem({ color = 0xf2f4f7, radius = 0.17, thickness = 0.045 }: { color?: number; radius?: number; thickness?: number }) {
  return (
    <mesh position={[0, 0, 0.002]}>
      <ringGeometry args={[radius - thickness, radius, 32]} />
      <meshStandardMaterial color={color} side={2} />
    </mesh>
  );
}

/**
 * Faixa horizontal centralizada — segunda cor sobre o tecido (ex.: verde +
 * amarelo). Bloco de cor simples, sem nenhum layout de bandeira real (não é
 * diagonal nem traz símbolo/brasão — só a faixa).
 */
function StripeBand({ color = 0xffd12e, height = 0.2 }: { color?: number; height?: number }) {
  return (
    <mesh position={[0, 0, 0.002]}>
      <planeGeometry args={[1, height]} />
      <meshStandardMaterial color={color} side={2} />
    </mesh>
  );
}

/** Bandeira carregada ao lado do avatar: mastro, tecido colorido e emblema opcional. */
function FlagClothImage({ url }: { url: string }) {
  const tex = useTexture(url);
  return (
    <mesh>
      <planeGeometry args={[1, 0.6]} />
      <meshStandardMaterial map={tex} side={2} />
    </mesh>
  );
}

export function Flag3D({ color, emblem, imageUrl }: { color: number; emblem?: FlagEmblem; imageUrl?: string | null }) {
  const plain = (
    <mesh>
      <planeGeometry args={[1, 0.6]} />
      <meshStandardMaterial color={color} side={2} />
    </mesh>
  );
  return (
    <group position={[0.45, 0, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.8, 6]} />
        <meshStandardMaterial color={0x8a8f98} />
      </mesh>
      <group position={[0.5, 2.3, 0]}>
        {imageUrl ? (
          <ModelBoundary key={imageUrl} fallback={plain}>
            <Suspense fallback={plain}>
              <FlagClothImage url={imageUrl} />
            </Suspense>
          </ModelBoundary>
        ) : (
          <>
            {plain}
            {emblem === "star-burst" && <StarBurst />}
            {emblem === "ring" && <RingEmblem />}
            {emblem === "stripe" && <StripeBand />}
          </>
        )}
      </group>
    </group>
  );
}

/** Veículo: modelo .glb do admin quando houver; senão a forma geométrica. */
export function Vehicle3D({ vehicle }: { vehicle: VehicleId }) {
  if (vehicle === "nenhum") return null;
  const url = vehicleModelUrl(vehicle);
  if (!url) return <ProceduralVehicle vehicle={vehicle} />;
  return (
    <Suspense fallback={<ProceduralVehicle vehicle={vehicle} />}>
      <GlbModel url={url} fallback={<ProceduralVehicle vehicle={vehicle} />} />
    </Suspense>
  );
}

/** Representação simples do veículo sob/ao redor do avatar. */
export function ProceduralVehicle({ vehicle }: { vehicle: VehicleId }) {
  const wheel = (key: string | number, pos: readonly [number, number, number], r = 0.3, w = 0.2, axis: "x" | "z" = "x") => (
    <mesh key={key} position={pos} rotation={axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, w, 16]} />
      <meshStandardMaterial color={0x111418} />
    </mesh>
  );

  // Moto "custom": quadro baixo, tanque, guidão alto e farol (rodas ao longo de Z; frente = +Z).
  if (vehicle === "moto") {
    return (
      <group>
        <mesh position={[0, 0.45, 0.2]}>
          <boxGeometry args={[0.5, 0.35, 1.6]} />
          <meshStandardMaterial color={0x2b2f36} />
        </mesh>
        <mesh position={[0, 0.78, 0.35]}>
          <boxGeometry args={[0.42, 0.22, 0.6]} />
          <meshStandardMaterial color={0xb3541e} />
        </mesh>
        <mesh position={[0, 1.0, 0.8]}>
          <boxGeometry args={[0.9, 0.06, 0.06]} />
          <meshStandardMaterial color={0x8a8f98} />
        </mesh>
        <mesh position={[0, 0.7, 1.0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color={0xfff3c0} emissive={0xfff3c0} emissiveIntensity={0.6} />
        </mesh>
        {wheel("f", [0, 0.3, 0.9], 0.32, 0.18, "z")}
        {wheel("r", [0, 0.3, -0.7], 0.32, 0.18, "z")}
      </group>
    );
  }
  // Moto esportiva: mais baixa e comprida, carenagem colorida, pneus mais largos.
  if (vehicle === "moto2") {
    return (
      <group>
        <mesh position={[0, 0.5, 0.15]}>
          <boxGeometry args={[0.45, 0.3, 1.9]} />
          <meshStandardMaterial color={0xd7263d} />
        </mesh>
        <mesh position={[0, 0.8, 0.75]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.5, 0.45, 0.35]} />
          <meshStandardMaterial color={0xf2f4f7} />
        </mesh>
        <mesh position={[0, 0.75, -0.35]}>
          <boxGeometry args={[0.38, 0.12, 0.7]} />
          <meshStandardMaterial color={0x1c1f24} />
        </mesh>
        {wheel("f", [0, 0.31, 0.95], 0.33, 0.22, "z")}
        {wheel("r", [0, 0.31, -0.7], 0.35, 0.3, "z")}
      </group>
    );
  }
  // Caminhão: cabine na frente (+Z), baú comprido atrás e 6 rodas.
  if (vehicle === "caminhao") {
    return (
      <group>
        <mesh position={[0, 0.7, 1.7]}>
          <boxGeometry args={[1.9, 1.4, 1.3]} />
          <meshStandardMaterial color={0xc0392b} />
        </mesh>
        <mesh position={[0, 1.0, 2.3]}>
          <boxGeometry args={[1.7, 0.6, 0.06]} />
          <meshStandardMaterial color={0x9ecbe8} />
        </mesh>
        <mesh position={[0, 1.2, -0.9]}>
          <boxGeometry args={[2.1, 1.9, 3.6]} />
          <meshStandardMaterial color={0xd9dde2} />
        </mesh>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[1.5, 0.3, 5]} />
          <meshStandardMaterial color={0x2b2f36} />
        </mesh>
        {[2.0, -0.2, -1.6].flatMap((z, i) => [
          wheel(`l${i}`, [-1.0, 0.4, z], 0.4, 0.28),
          wheel(`r${i}`, [1.0, 0.4, z], 0.4, 0.28),
        ])}
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
      ].map((p, i) => wheel(i, p))}
    </group>
  );
}

/**
 * Modelo glTF (personagem ou objeto). Com `animated`, ganha animação automática (clipes do arquivo ou balanço por
 * código, ver autoAnimate.ts); `walking` falso (de veículo) deixa o personagem parado.
 */
export function GlbModel({ url, fallback = null, animated = false, walking = true }: { url: string; fallback?: ReactNode; animated?: boolean; walking?: boolean }) {
  return (
    <ModelBoundary key={url} fallback={fallback}>
      <GlbModelInner url={url} animated={animated} walking={walking} />
    </ModelBoundary>
  );
}

function GlbModelInner({ url, animated, walking }: { url: string; animated: boolean; walking: boolean }) {
  const { scene, animations } = useGLTF(url);
  // Clone por uso: o cache do useGLTF devolve a MESMA cena; sem clonar, o
  // mesmo modelo em dois jogadores brigaria pelo mesmo pai (só um aparece).
  // Com marcações do editor do admin, o esqueleto é montado por código (autoRig.ts); senão, usa o do arquivo.
  const rig = animated ? rigForUrl(url) : null;
  const instance = useMemo(() => {
    if (rig) {
      try {
        return instantiateRig(getBakedRig(url, scene, rig));
      } catch (e) {
        console.warn("esqueleto automático indisponível", e);
      }
    }
    return cloneSkinned(scene);
  }, [scene, rig, url]);
  // O R3F não descarta <primitive>: o esqueleto clonado guarda uma textura de ossos própria. Geometria e materiais são
  // compartilhados com o cache do useGLTF e NÃO podem ser descartados aqui.
  useEffect(
    () => () => {
      instance.traverse((o) => (o as SkinnedMesh).skeleton?.dispose());
    },
    [instance],
  );
  const frameRef = useRef<Group>(null);
  const animRef = useRef<AutoAnimator | null>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!animated || !frame) return;
    // Uma falha ao montar a animação nunca derruba o personagem: ele só fica sem animar.
    try {
      animRef.current = createAutoAnimator(instance, frame, rig ? [] : animations);
    } catch (e) {
      console.warn("animação automática indisponível", e);
      animRef.current = null;
    }
    return () => {
      animRef.current?.dispose();
      animRef.current = null;
    };
  }, [animated, instance, animations, rig]);
  useFrame((_, dt) => {
    try {
      animRef.current?.update(Math.min(dt, 0.1), walking);
    } catch {
      animRef.current = null;
    }
  });
  return (
    <group ref={frameRef}>
      <primitive object={instance} />
    </group>
  );
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
