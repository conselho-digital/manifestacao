import { useEffect, useRef, type ReactNode } from "react";
import { CapsuleCollider, Physics, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Arena } from "./Arena.js";
import { ARENA_GRAVITY, PLAYER_FOOT_OFFSET, PLAYER_HALF_HEIGHT, PLAYER_RADIUS, type PhysicsHandle } from "./physicsHandle.js";

/** Corpo do jogador local: cápsula dinâmica (gravidade, colisão com o cenário) exposta ao Player por `handleRef`. */
function PlayerBody({ handleRef, spawn }: { handleRef: { current: PhysicsHandle | null }; spawn: { x: number; z: number } }) {
  const rb = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();

  useEffect(() => {
    handleRef.current = {
      pos: () => rb.current?.translation() ?? { x: spawn.x, y: PLAYER_FOOT_OFFSET, z: spawn.z },
      vel: () => rb.current?.linvel() ?? { x: 0, y: 0, z: 0 },
      setVel: (x, y, z) => rb.current?.setLinvel({ x, y, z }, true),
      setPos: (x, y, z) => rb.current?.setTranslation({ x, y, z }, true),
      grounded: () => {
        const body = rb.current;
        if (!body) return false;
        const p = body.translation();
        const ray = new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
        return world.castRay(ray, PLAYER_FOOT_OFFSET + 0.15, true, undefined, undefined, undefined, body) !== null;
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, rapier, world, spawn.x, spawn.z]);

  return (
    <RigidBody
      ref={rb}
      position={[spawn.x, PLAYER_FOOT_OFFSET + 0.05, spawn.z]}
      colliders={false}
      lockRotations
      enabledRotations={[false, false, false]}
      linearDamping={0}
      canSleep={false}
    >
      <CapsuleCollider args={[PLAYER_HALF_HEIGHT, PLAYER_RADIUS]} friction={0} />
    </RigidBody>
  );
}

/**
 * Mundo da arena com física (Rapier): cenário com colisão real + corpo do jogador. Carregado sob demanda (React.lazy)
 * para a avenida não baixar o WASM do Rapier. `children` é o jogador (Player), que lê/escreve o corpo por `handleRef`.
 */
export default function ArenaWorld({
  handleRef,
  spawn,
  children,
}: {
  handleRef: { current: PhysicsHandle | null };
  spawn: { x: number; z: number };
  children: ReactNode;
}) {
  return (
    <Physics gravity={ARENA_GRAVITY}>
      <Arena />
      <PlayerBody handleRef={handleRef} spawn={spawn} />
      {children}
    </Physics>
  );
}
