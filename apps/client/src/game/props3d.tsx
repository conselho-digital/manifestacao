import { useGLTF } from "@react-three/drei";
import type { VehicleId } from "@manifestacao/shared";

/** Bandeira carregada ao lado do avatar: mastro + tecido colorido. */
export function Flag3D({ color }: { color: number }) {
  return (
    <group position={[0.45, 0, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.8, 6]} />
        <meshStandardMaterial color={0x8a8f98} />
      </mesh>
      <mesh position={[0.5, 2.3, 0]}>
        <planeGeometry args={[1, 0.6]} />
        <meshStandardMaterial color={color} side={2} />
      </mesh>
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
        <mesh position={[0, 1.15, -0.6]}>
          <boxGeometry args={[1.4, 0.8, 1.2]} />
          <meshStandardMaterial color={0x272d37} />
        </mesh>
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
