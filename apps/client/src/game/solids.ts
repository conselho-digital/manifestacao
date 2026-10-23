/**
 * Obstáculos sólidos do mundo para o personagem e os veículos (prédios, troncos de árvore, pilares do museu):
 * quem anda não atravessa. Diferente de `colliders.ts` (que só afasta a câmera). O cenário registra aqui ao montar.
 * Tudo no plano XZ (o jogador sempre está no chão).
 */

export interface SolidRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SolidCircle {
  x: number;
  z: number;
  r: number;
}

/** Polígono sólido (prédio de forma livre): pares x,z em `pts`, com a caixa envolvente para descarte rápido. */
export interface SolidPoly {
  pts: number[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const polyGroups = new Map<string, SolidPoly[]>();
const rectGroups = new Map<string, SolidRect[]>();
const circleGroups = new Map<string, SolidCircle[]>();

/** Registra (ou substitui) um grupo de obstáculos sob um nome. */
export function setSolids(name: string, rects: SolidRect[], circles: SolidCircle[] = [], polys: SolidPoly[] = []): void {
  rectGroups.set(name, rects);
  circleGroups.set(name, circles);
  polyGroups.set(name, polys);
}

export function clearSolids(name: string): void {
  rectGroups.delete(name);
  circleGroups.delete(name);
  polyGroups.delete(name);
}

/** Empurra um círculo (centro x,z; raio r) para fora de todos os obstáculos; devolve a posição corrigida. */
export function resolveSolids(x: number, z: number, r: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  // Duas passadas: sair de um obstáculo pode encostar noutro vizinho.
  for (let pass = 0; pass < 2; pass++) {
    for (const group of rectGroups.values()) {
      for (const b of group) {
        if (px < b.minX - r || px > b.maxX + r || pz < b.minZ - r || pz > b.maxZ + r) continue;
        const cx = Math.max(b.minX, Math.min(b.maxX, px));
        const cz = Math.max(b.minZ, Math.min(b.maxZ, pz));
        const dx = px - cx;
        const dz = pz - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) {
          px = cx + (dx / d) * r;
          pz = cz + (dz / d) * r;
        } else {
          // Centro dentro do retângulo: sai pela borda mais próxima.
          const toMinX = px - b.minX;
          const toMaxX = b.maxX - px;
          const toMinZ = pz - b.minZ;
          const toMaxZ = b.maxZ - pz;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) px = b.minX - r;
          else if (m === toMaxX) px = b.maxX + r;
          else if (m === toMinZ) pz = b.minZ - r;
          else pz = b.maxZ + r;
        }
      }
    }
    for (const group of polyGroups.values()) {
      for (const b of group) {
        if (px < b.minX - r || px > b.maxX + r || pz < b.minZ - r || pz > b.maxZ + r) continue;
        const pts = b.pts;
        const n = pts.length / 2;
        let inside = false;
        let bd = Infinity;
        let qx = 0;
        let qz = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ax = pts[2 * j]!;
          const az = pts[2 * j + 1]!;
          const bx = pts[2 * i]!;
          const bz = pts[2 * i + 1]!;
          if (az > pz !== bz > pz && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
          const dx = bx - ax;
          const dz = bz - az;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1e-9)));
          const cx = ax + t * dx;
          const cz = az + t * dz;
          const d = Math.hypot(px - cx, pz - cz);
          if (d < bd) {
            bd = d;
            qx = cx;
            qz = cz;
          }
        }
        if (!inside && bd >= r) continue;
        const dirx = inside ? qx - px : px - qx;
        const dirz = inside ? qz - pz : pz - qz;
        const len = Math.hypot(dirx, dirz);
        if (len < 1e-6) {
          px = qx + r;
          continue;
        }
        px = qx + (dirx / len) * r;
        pz = qz + (dirz / len) * r;
      }
    }
    for (const group of circleGroups.values()) {
      for (const c of group) {
        const dx = px - c.x;
        const dz = pz - c.z;
        const min = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          px = c.x + (dx / d) * min;
          pz = c.z + (dz / d) * min;
        } else {
          px = c.x + min;
        }
      }
    }
  }
  return { x: px, z: pz };
}
