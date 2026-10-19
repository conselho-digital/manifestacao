import { Suspense, useMemo } from "react";
import { GlbModel } from "./props3d.js";
import { sprayModelUrl } from "./models.js";
import type { SprayMark } from "./spray.js";

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
  // Modelo .glb de spray enviado pelo admin (se houver) no lugar da mancha.
  const modelUrl = sprayModelUrl();

  return (
    <>
      {marks.map((m) => {
        const circle = (
          <mesh position={[m.x, 0.015, m.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.35, 16]} />
            <meshStandardMaterial color={m.color} />
          </mesh>
        );
        if (!modelUrl) return <group key={m.id}>{circle}</group>;
        return (
          <Suspense key={m.id} fallback={circle}>
            <group position={[m.x, 0.015, m.z]}>
              <GlbModel url={modelUrl} />
            </group>
          </Suspense>
        );
      })}
    </>
  );
}
