import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { PHYSICS } from "./config.js";
import { ThirdPersonController } from "./ThirdPersonController.js";
import { UrbanScene } from "./UrbanScene.js";

export { AssetModel, preloadAsset, assetUrl } from "./AssetModel.js";
export { ThirdPersonController } from "./ThirdPersonController.js";
export { UrbanScene } from "./UrbanScene.js";
export * from "./config.js";

/**
 * Protótipo completo: cenário urbano com colisão + personagem em 3ª pessoa.
 * Uso: `<Prototype3D />` em qualquer página (precisa de um elemento com altura, ex.: tela cheia).
 * Controles: WASD/setas, Shift corre, Espaço pula, mouse olha (clique para travar o ponteiro, Esc solta),
 * botão direito mira, clique esquerdo ataca.
 */
export function Prototype3D({ onAttack }: { onAttack?: () => void }) {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 360 }}>
      <Canvas shadows camera={{ fov: 60, near: 0.1, far: 600, position: [0, 4, 8] }}>
        <color attach="background" args={["#9fb4c8"]} />
        <hemisphereLight args={["#ffffff", "#556677", 0.9]} />
        <directionalLight position={[30, 50, 20]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]} />
        <Physics gravity={PHYSICS.gravity}>
          <UrbanScene />
          <ThirdPersonController onAttack={onAttack} />
        </Physics>
      </Canvas>
    </div>
  );
}
