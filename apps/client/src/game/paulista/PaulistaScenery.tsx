import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
} from "three";
import { clearCameraColliders, setCameraColliders } from "../colliders.js";
import { clearSolids, setSolids, type SolidPoly } from "../solids.js";
import { FLOOR_H, PALETTE, WINDOW_W, makeFacadeTexture } from "../City.js";
import {
  PAULISTA_BOUNDARY,
  PAULISTA_BUILDINGS,
  PAULISTA_CONTEXT,
  PAULISTA_ROADS,
  nearestOnEdges,
  pointInPoly,
  type Pt,
  type RawBuilding,
} from "./world.js";

/** Altura usada quando o OpenStreetMap não informa (andares ou metros). */
const DEFAULT_HEIGHT = 16;

/** Prédios extrudados do contorno real: paredes com textura de janelas (uma célula = 1 janela × 1 andar) e telhado. */
function buildingsGeometry(list: RawBuilding[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  list.forEach((b, bi) => {
    const pts = b.p;
    if (pts.length < 3) return;
    const h = Math.max(4, b.h ?? DEFAULT_HEIGHT);
    c.setHex(PALETTE[(bi * 7 + Math.round(h)) % PALETTE.length]!);
    let cx = 0;
    let cz = 0;
    for (const p of pts) {
      cx += p[0];
      cz += p[1];
    }
    cx /= pts.length;
    cz /= pts.length;
    // Paredes
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const d = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(d[0] - a[0], d[1] - a[1]);
      if (len < 0.05) continue;
      let nx = (d[1] - a[1]) / len;
      let nz = -(d[0] - a[0]) / len;
      const mx = (a[0] + d[0]) / 2 - cx;
      const mz = (a[1] + d[1]) / 2 - cz;
      const flip = nx * mx + nz * mz < 0;
      if (flip) {
        nx = -nx;
        nz = -nz;
      }
      const base = pos.length / 3;
      pos.push(a[0], 0, a[1], d[0], 0, d[1], d[0], h, d[1], a[0], h, a[1]);
      for (let k = 0; k < 4; k++) {
        nor.push(nx, 0, nz);
        col.push(c.r, c.g, c.b);
      }
      const u = len / WINDOW_W;
      const v = h / FLOOR_H;
      uv.push(0, 0, u, 0, u, v, 0, v);
      if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // Telhado
    const contour = pts.map((p) => new Vector2(p[0], p[1]));
    const tris = ShapeUtils.triangulateShape(contour, []);
    const rbase = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0], h, p[1]);
      nor.push(0, 1, 0);
      uv.push(0.02, 0.02);
      col.push(c.r * 0.8, c.g * 0.8, c.b * 0.8);
    }
    for (const t of tris) idx.push(rbase + t[0]!, rbase + t[2]!, rbase + t[1]!);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(pos.length / 3 > 65000 ? new BufferAttribute(new Uint32Array(idx), 1) : new BufferAttribute(new Uint16Array(idx), 1));
  return g;
}

const ROAD_WIDTH = [13, 10, 8, 6.5, 4.5, 2];

/** Ruas como faixas planas: uma geometria por tipo (asfalto, passagem de pedestres/serviço, calçadão). */
function roadsGeometry(minClass: number, maxClass: number, y: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of PAULISTA_ROADS) {
    if (r.c < minClass || r.c > maxClass) continue;
    const half = ROAD_WIDTH[r.c]! / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i]!;
      const b = r.p[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const base = pos.length / 3;
      pos.push(a[0] + nx, y, a[1] + nz, a[0] - nx, y, a[1] - nz, b[0] - nx, y, b[1] - nz, b[0] + nx, y, b[1] + nz);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      // Junta redonda no vértice (evita buracos nas curvas): quadrado girado
      const jb = pos.length / 3;
      const s = half;
      pos.push(b[0] - s, y, b[1] - s, b[0] + s, y, b[1] - s, b[0] + s, y, b[1] + s, b[0] - s, y, b[1] + s);
      idx.push(jb, jb + 2, jb + 1, jb, jb + 3, jb + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.computeVertexNormals();
  // computeVertexNormals pode apontar para baixo conforme o giro do quad: força para cima.
  const n = g.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** Faixa central tracejada nas vias principais (classes 0 e 1): quadrinhos brancos ao longo da linha da via. */
function dashesGeometry(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const y = 0.035;
  for (const r of PAULISTA_ROADS) {
    if (r.c > 1) continue;
    let carry = 0;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i]!;
      const b = r.p[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz * 0.14;
      const nz = ux * 0.14;
      for (let t = carry; t + 3 <= len; t += 9) {
        const x0 = a[0] + ux * t;
        const z0 = a[1] + uz * t;
        const x1 = x0 + ux * 3;
        const z1 = z0 + uz * 3;
        const base = pos.length / 3;
        pos.push(x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz);
        idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        carry = t + 9 - len;
      }
      if (carry < 0) carry = 0;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute("normal", new BufferAttribute(nrm, 3));
  return g;
}

/** Árvores nas calçadas das vias principais (a Paulista é arborizada). Fora de prédios e dentro do limite do mapa. */
function sidewalkTrees(): Pt[] {
  const out: Pt[] = [];
  const bboxes = PAULISTA_BUILDINGS.map((b) => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of b.p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    return [minX, maxX, minZ, maxZ] as const;
  });
  const free = (x: number, z: number): boolean => {
    if (!pointInPoly(x, z, PAULISTA_BOUNDARY)) return false;
    if (nearestOnEdges(x, z, PAULISTA_BOUNDARY).d < 4) return false;
    for (let i = 0; i < PAULISTA_BUILDINGS.length; i++) {
      const bb = bboxes[i]!;
      if (x < bb[0] - 2 || x > bb[1] + 2 || z < bb[2] - 2 || z > bb[3] + 2) continue;
      if (pointInPoly(x, z, PAULISTA_BUILDINGS[i]!.p) || nearestOnEdges(x, z, PAULISTA_BUILDINGS[i]!.p).d < 2) return false;
    }
    // Não no meio de outra via principal.
    for (const r of PAULISTA_ROADS) {
      if (r.c > 3) continue;
      if (nearestOnEdges(x, z, r.p).d < ROAD_WIDTH[r.c]! / 2 + 1) return false;
    }
    return true;
  };
  for (const r of PAULISTA_ROADS) {
    if (r.c > 2) continue;
    const half = ROAD_WIDTH[r.c]! / 2;
    let carry = 0;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i]!;
      const b = r.p[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len;
      const uz = dz / len;
      for (let t = carry; t < len; t += 16) {
        for (const side of [1, -1]) {
          const x = a[0] + ux * t - uz * side * (half + 3.2);
          const z = a[1] + uz * t + ux * side * (half + 3.2);
          if (free(x, z)) out.push([x, z]);
        }
        carry = t + 16 - len;
      }
      if (carry < 0) carry = 0;
    }
  }
  return out.slice(0, 260);
}

/** Cercas com faixa amarela em todo o limite do mapa: mostram até onde dá para andar. */
function BoundaryFence() {
  const posts = useRef<InstancedMesh>(null);
  const tapes = useRef<InstancedMesh>(null);
  const { postSpots, edges } = useMemo(() => {
    const ps: { x: number; z: number }[] = [];
    const es: { cx: number; cz: number; len: number; yaw: number }[] = [];
    const n = PAULISTA_BOUNDARY.length;
    for (let i = 0; i < n; i++) {
      const a = PAULISTA_BOUNDARY[i]!;
      const b = PAULISTA_BOUNDARY[(i + 1) % n]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(len / 5));
      for (let k = 0; k <= steps; k++) ps.push({ x: a[0] + ((b[0] - a[0]) * k) / steps, z: a[1] + ((b[1] - a[1]) * k) / steps });
      es.push({ cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, len, yaw: -Math.atan2(b[1] - a[1], b[0] - a[0]) });
    }
    return { postSpots: ps, edges: es };
  }, []);
  useLayoutEffect(() => {
    if (!posts.current || !tapes.current) return;
    const m = new Matrix4();
    const q = new Quaternion();
    postSpots.forEach((p, i) => {
      m.compose(new Vector3(p.x, 0.9, p.z), q, new Vector3(1, 1, 1));
      posts.current!.setMatrixAt(i, m);
    });
    let ti = 0;
    for (const e of edges) {
      q.setFromAxisAngle(new Vector3(0, 1, 0), e.yaw);
      for (const y of [0.7, 1.35]) {
        m.compose(new Vector3(e.cx, y, e.cz), q, new Vector3(e.len, 1, 1));
        tapes.current.setMatrixAt(ti++, m);
      }
    }
    posts.current.instanceMatrix.needsUpdate = true;
    tapes.current.instanceMatrix.needsUpdate = true;
  }, [postSpots, edges]);
  return (
    <group>
      <instancedMesh ref={posts} frustumCulled={false} args={[undefined, undefined, postSpots.length]}>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
        <meshStandardMaterial color={0x555b62} />
      </instancedMesh>
      <instancedMesh ref={tapes} frustumCulled={false} args={[undefined, undefined, edges.length * 2]}>
        <boxGeometry args={[1, 0.16, 0.05]} />
        <meshStandardMaterial color={0xffd12e} emissive={0x6b5200} />
      </instancedMesh>
    </group>
  );
}

/** Árvores instanciadas (tronco + copa) com colisão no tronco. */
function SidewalkTrees() {
  const trees = useMemo(sidewalkTrees, []);
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!trunks.current || !crowns.current) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const color = new Color();
    trees.forEach((t, i) => {
      const sc = 0.85 + ((i * 37) % 10) / 25;
      m.compose(new Vector3(t[0], 2.2, t[1]), q, new Vector3(0.9 * sc, 2.2, 0.9 * sc));
      trunks.current!.setMatrixAt(i, m);
      m.compose(new Vector3(t[0], 5.2 * sc, t[1]), q, new Vector3(1.7 * sc, 1.5 * sc, 1.7 * sc));
      crowns.current!.setMatrixAt(i, m);
      crowns.current!.setColorAt(i, color.setHSL(0.3 + (((i * 13) % 10) / 10) * 0.05, 0.5, 0.22 + (((i * 7) % 10) / 10) * 0.1));
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
  }, [trees]);
  useEffect(() => {
    setSolids("paulista-trees", [], trees.map((t) => ({ x: t[0], z: t[1], r: 0.45 })));
    return () => clearSolids("paulista-trees");
  }, [trees]);
  return (
    <group>
      <instancedMesh ref={trunks} frustumCulled={false} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.25, 0.35, 2, 6]} />
        <meshStandardMaterial color={0x5b3a22} />
      </instancedMesh>
      <instancedMesh ref={crowns} frustumCulled={false} args={[undefined, undefined, trees.length]}>
        <icosahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color={0xffffff} flatShading />
      </instancedMesh>
    </group>
  );
}

/** Mapa "Av. Paulista": trecho real do OpenStreetMap (prédios nas alturas reais, ruas e limite com faixa amarela). */
export function PaulistaScenery() {
  const texture = useMemo(() => makeFacadeTexture(), []);
  const geo = useMemo(
    () => ({
      solid: buildingsGeometry(PAULISTA_BUILDINGS),
      context: buildingsGeometry(PAULISTA_CONTEXT),
      asphalt: roadsGeometry(0, 3, 0.02),
      plaza: roadsGeometry(4, 4, 0.03),
      walk: roadsGeometry(5, 5, 0.04),
      dashes: dashesGeometry(),
    }),
    [],
  );

  // Colisão com os prédios do trecho (forma real) e a câmera de terceira pessoa não os atravessa.
  useEffect(() => {
    const polys: SolidPoly[] = PAULISTA_BUILDINGS.map((b) => {
      const pts = b.p.flatMap((p: Pt) => [p[0], p[1]]);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of b.p) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minZ = Math.min(minZ, p[1]);
        maxZ = Math.max(maxZ, p[1]);
      }
      return { pts, minX, maxX, minZ, maxZ };
    });
    setSolids("paulista", [], [], polys);
    const boxes = PAULISTA_BUILDINGS.map((b) => {
      const h = Math.max(4, b.h ?? DEFAULT_HEIGHT);
      const xs = b.p.map((p) => p[0]);
      const zs = b.p.map((p) => p[1]);
      return new Box3(new Vector3(Math.min(...xs), 0, Math.min(...zs)), new Vector3(Math.max(...xs), h, Math.max(...zs)));
    });
    setCameraColliders("paulista", [], boxes);
    return () => {
      clearSolids("paulista");
      clearCameraColliders("paulista");
    };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose();
    },
    [geo],
  );

  return (
    <group>
      {/* Calçada (chão de tudo o que não é rua) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial color={0x9aa0a6} />
      </mesh>
      <mesh geometry={geo.asphalt} receiveShadow>
        <meshStandardMaterial color={0x2b3139} />
      </mesh>
      <mesh geometry={geo.plaza} receiveShadow>
        <meshStandardMaterial color={0x6d7379} />
      </mesh>
      <mesh geometry={geo.walk} receiveShadow>
        <meshStandardMaterial color={0xa7a99f} />
      </mesh>
      <mesh geometry={geo.dashes}>
        <meshStandardMaterial color={0xe9e6d6} />
      </mesh>
      <mesh geometry={geo.solid} castShadow receiveShadow>
        <meshStandardMaterial map={texture} vertexColors />
      </mesh>
      <mesh geometry={geo.context}>
        <meshStandardMaterial map={texture} vertexColors />
      </mesh>
      <BoundaryFence />
      <SidewalkTrees />
      {/* Luz extra: as fachas viradas para longe do sol ficariam quase pretas. */}
      <ambientLight intensity={0.35} />
    </group>
  );
}
