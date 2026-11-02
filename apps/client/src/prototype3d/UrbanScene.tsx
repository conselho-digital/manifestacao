import { Suspense } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { AssetModel } from "./AssetModel.js";
import { FILES } from "./config.js";

/**
 * Cenário urbano com colisão estática.
 *
 * Colisão "trimesh" (a malha exata) é precisa, porém pesada: use-a em um modelo de colisão SIMPLIFICADO
 * (`FILES.cityCollision`: prédios como caixas, sem detalhes), invisível. Se não houver, a própria malha visual vira colisão.
 */
export function UrbanScene({ showGrid = true }: { showGrid?: boolean }) {
  return (
    <>
      {/* Grade de referência (só visual): ajuda a ver o chão e o movimento enquanto o cenário não carrega. */}
      {showGrid && <gridHelper args={[400, 200, "#ffffff", "#7f93a6"]} position={[0, 0.01, 0]} />}

      {/* Chão de segurança: o jogador nunca cai para fora do mundo se o modelo falhar ao carregar. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[500, 0.5, 500]} position={[0, -0.5, 0]} />
      </RigidBody>

      <Suspense fallback={null}>
        {FILES.cityCollision ? (
          <>
            <AssetModel file={FILES.city} />
            <RigidBody type="fixed" colliders="trimesh">
              <AssetModel file={FILES.cityCollision} visible={false} castShadow={false} receiveShadow={false} />
            </RigidBody>
          </>
        ) : (
          <RigidBody type="fixed" colliders="trimesh">
            <AssetModel file={FILES.city} />
          </RigidBody>
        )}
      </Suspense>
    </>
  );
}
