import { Suspense, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { DoubleSide, Matrix4, Quaternion, Vector3 } from "three";
import { ModelBoundary } from "./ModelBoundary.js";
import { GlbModel } from "./props3d.js";
import { sprayImageFor, sprayModelUrl } from "./models.js";
import type { SprayMark } from "./spray.js";

/** Quantas marcas (as mais novas) podem usar o modelo 3D. */
const MAX_MODEL_MARKS = 30;
/** Marcas com a imagem da bandeira (a textura é compartilhada por URL, então é barato). */
const MAX_IMAGE_MARKS = 120;
/** Largura da marca-bandeira no chão (a altura segue a proporção da imagem). */
const FLAG_MARK_WIDTH = 1.8;

/** Posição e orientação de uma marca: colada na superfície (normal) com a imagem "em pé" nas paredes. */
function placement(m: SprayMark): { position: [number, number, number]; quaternion: Quaternion } {
  const ground = m.ny > 0.9;
  const lift = ground ? 0 : 0.04;
  const position: [number, number, number] = ground ? [m.x, 0.02, m.z] : [m.x + m.nx * lift, m.y + m.ny * lift, m.z + m.nz * lift];
  const n = new Vector3(m.nx, m.ny, m.nz).normalize();
  // Eixos: z = normal; x = horizontal ao longo da superfície; y = "para cima" da imagem (para cima do mundo nas paredes).
  const x = new Vector3().crossVectors(new Vector3(0, 1, 0), n);
  if (x.lengthSq() < 0.01) x.set(1, 0, 0);
  x.normalize();
  const y = new Vector3().crossVectors(n, x).normalize();
  const quaternion = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, n));
  return { position, quaternion };
}

/** A bandeira (imagem enviada pelo admin) pintada na superfície. */
function FlagDecal({ url, mark }: { url: string; mark: SprayMark }) {
  const tex = useTexture(url);
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.height / img.width : 0.6;
  const { position, quaternion } = placement(mark);
  return (
    <mesh position={position} quaternion={quaternion}>
      <planeGeometry args={[FLAG_MARK_WIDTH, FLAG_MARK_WIDTH * aspect]} />
      <meshBasicMaterial map={tex} transparent alphaTest={0.05} depthWrite={false} polygonOffset polygonOffsetFactor={-2} side={DoubleSide} />
    </mesh>
  );
}

interface SprayMarksProps {
  marksRef: { current: Map<string, SprayMark> };
  /** Muda a cada marca criada/removida — é o gatilho de re-render daqui. */
  version: number;
}

/**
 * Renderiza as marcas de spray como manchas no chão da avenida. Efêmeras:
 * vêm só da memória (sprayMarksRef em useAvenueRealtime), nunca de banco.
 *
 * A marca fica na superfície que a mira atingiu (chão, parede de prédio, tronco, copa de árvore, pilar), com a
 * orientação da normal; ver Player.tsx (mira) e colliders.ts / solids.ts (raios).
 */
export function SprayMarks({ marksRef, version }: SprayMarksProps) {
  // `version` força o recálculo da lista quando o mapa muda.
  const marks = useMemo(() => [...marksRef.current.values()], [marksRef, version]);
  // Modelos 3D só nas marcas mais recentes (cada uma é um clone do .glb);
  // as mais antigas viram a mancha simples — evita 400 clones pesados.
  const firstModelIndex = Math.max(0, marks.length - MAX_MODEL_MARKS);
  const firstImageIndex = Math.max(0, marks.length - MAX_IMAGE_MARKS);

  return (
    <>
      {marks.map((m, i) => {
        // Modelo .glb da opção de spray (ou o geral), se o admin enviou.
        const modelUrl = i >= firstModelIndex ? sprayModelUrl(m.style) : null;
        const pl = placement(m);
        const circle = (
          <mesh position={pl.position} quaternion={pl.quaternion}>
            <circleGeometry args={[0.35, 16]} />
            <meshStandardMaterial color={m.color} polygonOffset polygonOffsetFactor={-2} side={DoubleSide} />
          </mesh>
        );
        // A marca é a imagem da bandeira da equipe de quem pichou; sem ela, a imagem da bandeira que a pessoa carrega;
        // sem nenhuma imagem, a mancha na cor da equipe.
        const imageUrl = i >= firstImageIndex ? sprayImageFor(m.team) : null;
        if (imageUrl) {
          return (
            <ModelBoundary key={`${m.id}:${imageUrl}`} fallback={circle}>
              <Suspense fallback={circle}>
                <FlagDecal url={imageUrl} mark={m} />
              </Suspense>
            </ModelBoundary>
          );
        }
        if (!modelUrl) return <group key={m.id}>{circle}</group>;
        return (
          <Suspense key={m.id} fallback={circle}>
            <group position={pl.position} quaternion={pl.quaternion}>
              <GlbModel url={modelUrl} fallback={circle} />
            </group>
          </Suspense>
        );
      })}
    </>
  );
}
