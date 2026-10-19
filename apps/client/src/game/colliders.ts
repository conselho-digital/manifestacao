import { Box3, Ray, Sphere, Vector3 } from "three";

/**
 * Obstáculos da câmera de terceira pessoa: ela não atravessa o chão, copas de
 * árvores nem prédios — quando algo fica entre o personagem e a câmera, ela se
 * aproxima do personagem. Só a câmera usa isto (o personagem não colide).
 * O cenário registra seus obstáculos aqui ao montar.
 */

/** Altura mínima da câmera acima do chão. */
export const CAMERA_MIN_HEIGHT = 0.35;
/** Distância mínima ao pivô, mesmo colada num obstáculo. */
const MIN_DISTANCE = 0.8;
/** Folga mantida entre a câmera e o obstáculo. */
const MARGIN = 0.25;

const spheres = new Map<string, Sphere[]>();
const boxes = new Map<string, Box3[]>();

/** Registra (ou substitui) um grupo de esferas/caixas sob um nome. */
export function setCameraColliders(name: string, s: Sphere[], b: Box3[] = []): void {
  spheres.set(name, s);
  boxes.set(name, b);
}

export function clearCameraColliders(name: string): void {
  spheres.delete(name);
  boxes.delete(name);
}

const ray = new Ray();
const hit = new Vector3();

/**
 * Maior distância (≤ desired) que a câmera pode ficar do pivô na direção `dir`
 * (unitária) sem atravessar o chão nem um obstáculo.
 */
export function allowedCameraDistance(pivot: Vector3, dir: Vector3, desired: number): number {
  let max = desired;

  // Chão (y = CAMERA_MIN_HEIGHT): olhando pra cima de baixo, a câmera encosta nele.
  if (dir.y < -1e-4) max = Math.min(max, (pivot.y - CAMERA_MIN_HEIGHT) / -dir.y);

  ray.origin.copy(pivot);
  ray.direction.copy(dir);

  for (const group of spheres.values()) {
    for (const s of group) {
      if (s.containsPoint(pivot)) continue; // pivô dentro da copa: ignora
      if (ray.intersectSphere(s, hit)) max = Math.min(max, hit.distanceTo(pivot) - MARGIN);
    }
  }
  for (const group of boxes.values()) {
    for (const b of group) {
      if (b.containsPoint(pivot)) continue;
      if (ray.intersectBox(b, hit)) max = Math.min(max, hit.distanceTo(pivot) - MARGIN);
    }
  }

  return Math.max(MIN_DISTANCE, Math.min(desired, max));
}
