import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { TEAMS, type TeamId, type VehicleId } from "@manifestacao/shared";
import { Vehicle3D } from "./props3d.js";
import { bodyOf, localDoorOpen, parkedCircles, type ParkedPose } from "./parking.js";
import { clearSolids, setSolids } from "./solids.js";

export interface ParkedItem {
  /** "self" para o veículo do jogador local; id do dono para os remotos. */
  owner: string;
  vehicle: VehicleId;
  pose: ParkedPose;
  team: TeamId;
}

/** Porta falsa do motorista: um painel na cor do time, pivotando na dobradiça (o modelo é uma malha só, sem porta). */
function DoorPanel({ vehicle, team, local }: { vehicle: VehicleId; team: TeamId; local: boolean }) {
  const pivot = useRef<Group>(null);
  const door = bodyOf(vehicle)?.door;
  useFrame(() => {
    const g = pivot.current;
    if (!g) return;
    const open = local ? localDoorOpen() : 0;
    g.visible = open > 0.02;
    // A porta gira para fora (+X, lado esquerdo) e para trás: a ponta livre fica em -Z local.
    g.rotation.y = -open * 1.15;
  });
  if (!door) return null;
  const h = door.y1 - door.y0;
  return (
    <group ref={pivot} position={[door.hingeX, door.y0, door.hingeZ]} visible={false}>
      <mesh position={[0, h / 2, -door.length / 2]} castShadow>
        <boxGeometry args={[0.07, h, door.length]} />
        <meshStandardMaterial color={TEAMS[team].color} />
      </mesh>
      {/* Vidro da porta. */}
      <mesh position={[0.045, h * 0.72, -door.length / 2]}>
        <boxGeometry args={[0.02, h * 0.4, door.length * 0.8]} />
        <meshStandardMaterial color={0x1b2a38} metalness={0.4} roughness={0.2} />
      </mesh>
    </group>
  );
}

/**
 * Veículos estacionados (o meu e os dos outros): modelo parado no lugar, porta falsa e colisão para quem anda a pé.
 */
export function ParkedVehicles({ items }: { items: ParkedItem[] }) {
  // Colisão a pé: um grupo "parked:<dono>" por veículo.
  useEffect(() => {
    const names: string[] = [];
    for (const it of items) {
      const name = `parked:${it.owner}`;
      names.push(name);
      setSolids(name, [], parkedCircles(it.pose, it.vehicle), [], 0);
    }
    return () => {
      for (const n of names) clearSolids(n);
    };
  }, [items]);

  return (
    <>
      {items.map((it) => (
        <group key={it.owner} position={[it.pose.x, 0, it.pose.z]} rotation={[0, it.pose.heading, 0]}>
          <Vehicle3D vehicle={it.vehicle} team={it.team} />
          <DoorPanel vehicle={it.vehicle} team={it.team} local={it.owner === "self"} />
        </group>
      ))}
    </>
  );
}
