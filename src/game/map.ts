import * as THREE from 'three';

export const ARENA_SIZE = 40;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 1;

export function createMap(): THREE.Group {
  const map = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
    new THREE.MeshLambertMaterial({ color: 0x6fae5e }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  map.add(floor);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const half = ARENA_SIZE / 2;
  const walls: [number, number, number, number][] = [
    [0, -half, ARENA_SIZE + WALL_THICKNESS, WALL_THICKNESS],
    [0, half, ARENA_SIZE + WALL_THICKNESS, WALL_THICKNESS],
    [-half, 0, WALL_THICKNESS, ARENA_SIZE],
    [half, 0, WALL_THICKNESS, ARENA_SIZE],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    map.add(wall);
  }

  // Blocos de abrigo no meio da arena
  const coverMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const covers: [number, number, number][] = [
    [-8, -6, 3], [8, 6, 3], [8, -8, 2], [-8, 8, 2], [0, 0, 2.5],
  ];
  for (const [x, z, s] of covers) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), coverMat);
    box.position.set(x, s / 2, z);
    box.castShadow = true;
    box.receiveShadow = true;
    map.add(box);
  }

  return map;
}
