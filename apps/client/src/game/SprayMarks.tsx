import { Suspense, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { DoubleSide } from "three";
import { ModelBoundary } from "./ModelBoundary.js";
import { GlbModel } from "./props3d.js";
import { flagImageUrl, sprayModelUrl, teamImageUrl } from "./models.js";
import type { SprayMark } from "./spray.js";

/** Quantas marcas (as mais novas) podem usar o modelo 3D. */
const MAX_MODEL_MARKS = 30;
/** Marcas com a imagem da bandeira (a textura é compartilhada por URL, então é barato). */
const MAX_IMAGE_MARKS = 120;
/** Largura da marca-bandeira no chão (a altura segue a proporção da imagem). */
const FLAG_MARK_WIDTH = 1.8;

/** A bandeira (imagem enviada pelo admin) pintada no chão. */
function FlagDecal({ url, x, z }: { url: string; x: number; z: number }) {
  const tex = useTexture(url);
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.height / img.width : 0.6;
  return (
    <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
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
 * Nota: o CLAUDE.md fala em pichar "paredes" — pintar nas paredes dos
 * prédios exigiria detectar a superfície vertical mais próxima e projetar a
 * marca nela (raycasting), o que fica para um próximo passo. Esta primeira
 * versão pinta o chão, que já cobre a mecânica (cartucho, expiração, broadcast).
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
        const circle = (
          <mesh position={[m.x, 0.015, m.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.35, 16]} />
            <meshStandardMaterial color={m.color} />
          </mesh>
        );
        // A marca é a imagem da bandeira da equipe de quem pichou; sem ela, a imagem da bandeira que a pessoa carrega;
        // sem nenhuma imagem, a mancha na cor da equipe.
        const imageUrl = i >= firstImageIndex ? teamImageUrl(m.team) ?? flagImageUrl(m.flag) : null;
        if (imageUrl) {
          return (
            <ModelBoundary key={`${m.id}:${imageUrl}`} fallback={circle}>
              <Suspense fallback={circle}>
                <FlagDecal url={imageUrl} x={m.x} z={m.z} />
              </Suspense>
            </ModelBoundary>
          );
        }
        if (!modelUrl) return <group key={m.id}>{circle}</group>;
        return (
          <Suspense key={m.id} fallback={circle}>
            <group position={[m.x, 0.015, m.z]}>
              <GlbModel url={modelUrl} fallback={circle} />
            </group>
          </Suspense>
        );
      })}
    </>
  );
}
