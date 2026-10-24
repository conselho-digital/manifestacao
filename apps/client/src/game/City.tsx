import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  Box3,
  CanvasTexture,
  Color,
  DoubleSide,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { clearSolids, setSolids } from "./solids.js";
import {
  AVENUE_LENGTH,
  AVENUE_WIDTH,
  CITY_HALF_X,
  CITY_HALF_Z,
  PARK_GAP,
  PARK_SIZE,
  PLAZA_HALF_X,
  PLAZA_MAX_Z,
  SIDEWALK_WIDTH,
} from "./world.js";

/**
 * Entorno da avenida (inspirado no layout da Paulista): quarteirões de prédios altos nos dois lados, atrás da
 * praça do MASP e atrás do parque, com calçadas e uma torre de antena. Tudo gerado por código (nenhum modelo de
 * terceiros), num único mesh com cor por prédio e textura de janelas repetida pelo tamanho real de cada fachada.
 */

export const WINDOW_W = 3; // largura de uma "janela" (unidades do mundo)
export const FLOOR_H = 3.4; // altura de um andar
const X_LIMIT = AVENUE_LENGTH / 2 + 30; // a cidade passa um pouco das pontas da avenida
const SIDEWALK = SIDEWALK_WIDTH; // largura da calçada junto à avenida

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
  /** Fileira (0 = a da frente, junto à calçada). */
  row: number;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTE = [0x8aa0b0, 0x9aa7ad, 0xb8ad9a, 0x7d6f64, 0xc9c6bd, 0x5f7686, 0xa9b4bb, 0x6f8190];

/** Posiciona os prédios em fileiras paralelas à avenida, pulando a praça do MASP e o parque. */
function buildCity(): Building[] {
  const rand = mulberry32(2024);
  const out: Building[] = [];
  const parkHalf = PARK_SIZE / 2 + 3;
  const parkFar = AVENUE_WIDTH / 2 + PARK_GAP + PARK_SIZE + 4; // |z| do fundo do parque (+ folga)

  for (const side of [1, -1] as const) {
    for (let row = 0; row < 4; row++) {
      const front = AVENUE_WIDTH / 2 + SIDEWALK + row * 24; // |z| da frente da fileira
      let x = -X_LIMIT;
      while (x < X_LIMIT) {
        const w = 9 + rand() * 8;
        const d = 12 + rand() * 8;
        const cx = x + w / 2;
        if (cx + w / 2 > CITY_HALF_X - 1) break; // não passa do limite da cidade
        const zNear = front;
        const zFar = front + d;
        x += w + 1.5 + rand() * 3;

        // Praça do MASP (lado +Z): livre à frente do prédio.
        if (side === 1 && Math.abs(cx) < PLAZA_HALF_X + w / 2 + 2 && zNear < PLAZA_MAX_Z + 4) continue;
        // Parque (lado -Z): livre dentro da largura dele, até o fundo.
        if (side === -1 && Math.abs(cx) < parkHalf + w / 2 && zNear < parkFar) continue;

        // Mais alto perto do centro (a "Paulista") e nas fileiras de trás.
        const center = Math.max(0, 1 - Math.abs(cx - 25) / 110);
        const base = 14 + row * 12 + center * 26;
        const h = base + rand() * (22 + row * 10);
        out.push({
          x: cx,
          z: side * (zNear + d / 2),
          w,
          d,
          h,
          color: PALETTE[Math.floor(rand() * PALETTE.length)]!,
          row,
        });
        // fileiras de trás precisam passar do limite da cidade em z? (a névoa cobre)
        void zFar;
      }
    }
  }
  return out;
}

/** Altura do térreo (lojas de vidro). Os andares de cima (apartamentos, com janelas) começam aqui. */
export const GROUND_FLOOR_H = 4.4;

/** Andares de cima do prédio: caixa com UV proporcional ao tamanho real (janelas não esticam) e cor por vértice. */
function boxFor(b: Building): BufferGeometry {
  const hh = b.h - GROUND_FLOOR_H;
  const g = new BoxGeometry(b.w, hh, b.d);
  const uv = g.getAttribute("uv");
  // Ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada).
  const faces: [number, number][] = [
    [b.d, hh], // +x
    [b.d, hh], // -x
    [0, 0], // +y (telhado)
    [0, 0], // -y
    [b.w, hh], // +z
    [b.w, hh], // -z
  ];
  for (let f = 0; f < 6; f++) {
    const [sw, sh] = faces[f]!;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (sw === 0) uv.setXY(i, 0.02, 0.02); // telhado/teto: cor lisa do canto da textura
      else uv.setXY(i, (uv.getX(i) * sw) / WINDOW_W, (uv.getY(i) * sh) / FLOOR_H);
    }
  }
  g.translate(b.x, GROUND_FLOOR_H + hh / 2, b.z);
  const c = new Color(b.color);
  const colors = new Float32Array(g.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  return g;
}

// ── Térreo: lojas de vidro, sem porta ───────────────────────────────────────────────────────────
const ENTRANCE_W = 3.4; // vão de entrada (sem porta) no meio de cada lado
const GLASS_T = 0.2; // espessura da parede de vidro (colisão)
const SHOP_COLORS = [0xd7263d, 0x1b998b, 0xf46036, 0x2e86ab, 0xf6c445, 0x7b2d8e, 0x3a7d44, 0xe36397];
const FLOOR_COLORS = [0xe8e2d6, 0xd9d4c8, 0xcfd8dc, 0xe6dccb, 0xdbe4d4];

interface ShopParts {
  /** Estrutura e interior (cor por vértice). */
  solid: BufferGeometry;
  /** Vidros (translúcidos). */
  glass: BufferGeometry;
  /** Retângulos que bloqueiam quem anda: paredes de vidro (com o vão), colunas, balcão e prateleiras. */
  rects: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}

function coloredBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  g.deleteAttribute("uv");
  const c = new Color(color);
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  return g;
}

/** Loja do térreo de um prédio: paredes de vidro com um vão (sem porta) em cada lado, colunas, letreiro, balcão e prateleiras. */
function shopFor(b: Building, rand: () => number): ShopParts {
  const solid: BufferGeometry[] = [];
  const glass: BufferGeometry[] = [];
  const rects: ShopParts["rects"] = [];
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2;
  const z1 = b.z + b.d / 2;
  const accent = SHOP_COLORS[Math.floor(rand() * SHOP_COLORS.length)]!;
  const dark = new Color(b.color).multiplyScalar(0.55).getHex();
  const GH = 3.5; // topo do vidro; acima dele, o letreiro até o teto
  const rect = (minX: number, maxX: number, minZ: number, maxZ: number) => rects.push({ minX, maxX, minZ, maxZ });

  // Piso da loja
  solid.push(coloredBox(b.w - 0.1, 0.06, b.d - 0.1, b.x, 0, b.z, FLOOR_COLORS[Math.floor(rand() * FLOOR_COLORS.length)]!));
  // Colunas nos quatro cantos
  for (const [cx, cz] of [
    [x0 + 0.25, z0 + 0.25],
    [x1 - 0.25, z0 + 0.25],
    [x0 + 0.25, z1 - 0.25],
    [x1 - 0.25, z1 - 0.25],
  ] as const) {
    solid.push(coloredBox(0.5, GROUND_FLOOR_H, 0.5, cx, 0, cz, dark));
    rect(cx - 0.25, cx + 0.25, cz - 0.25, cz + 0.25);
  }
  // Quatro lados: vidro com um vão no meio, rodapé, caixilhos e letreiro colorido por cima.
  const sides: { alongX: boolean; fixed: number; from: number; to: number; sign: 1 | -1 }[] = [
    { alongX: true, fixed: z0, from: x0, to: x1, sign: -1 },
    { alongX: true, fixed: z1, from: x0, to: x1, sign: 1 },
    { alongX: false, fixed: x0, from: z0, to: z1, sign: -1 },
    { alongX: false, fixed: x1, from: z0, to: z1, sign: 1 },
  ];
  for (const sd of sides) {
    const mid = (sd.from + sd.to) / 2;
    const segs: [number, number][] = [
      [sd.from + 0.5, mid - ENTRANCE_W / 2],
      [mid + ENTRANCE_W / 2, sd.to - 0.5],
    ];
    for (const [a, c] of segs) {
      const len = c - a;
      if (len <= 0.1) continue;
      const m = (a + c) / 2;
      // Vidro (plano duplo-face)
      const pane = new PlaneGeometry(len, GH - 0.45);
      if (sd.alongX) pane.translate(m, 0.45 + (GH - 0.45) / 2, sd.fixed);
      else {
        pane.rotateY(Math.PI / 2);
        pane.translate(sd.fixed, 0.45 + (GH - 0.45) / 2, m);
      }
      glass.push(pane);
      // Rodapé escuro + caixilhos a cada ~3,5 m
      if (sd.alongX) solid.push(coloredBox(len, 0.45, 0.16, m, 0, sd.fixed, dark));
      else solid.push(coloredBox(0.16, 0.45, len, sd.fixed, 0, m, dark));
      const n = Math.max(1, Math.round(len / 3.5));
      for (let k = 0; k <= n; k++) {
        const t = a + (len * k) / n;
        if (sd.alongX) solid.push(coloredBox(0.1, GH - 0.45, 0.1, t, 0.45, sd.fixed, dark));
        else solid.push(coloredBox(0.1, GH - 0.45, 0.1, sd.fixed, 0.45, t, dark));
      }
      // Colisão da parede de vidro
      if (sd.alongX) rect(a, c, sd.fixed - GLASS_T / 2, sd.fixed + GLASS_T / 2);
      else rect(sd.fixed - GLASS_T / 2, sd.fixed + GLASS_T / 2, a, c);
    }
    // Letreiro: faixa colorida ao longo do lado inteiro, entre o vidro e o teto
    const fl = sd.to - sd.from;
    if (sd.alongX) solid.push(coloredBox(fl, GROUND_FLOOR_H - GH, 0.3, mid, GH, sd.fixed, accent));
    else solid.push(coloredBox(0.3, GROUND_FLOOR_H - GH, fl, sd.fixed, GH, mid, accent));
  }
  // Interior: balcão ao fundo e duas prateleiras compridas com produtos (deixam corredores livres)
  const bx = b.x;
  const bz = z1 - 2.2;
  solid.push(coloredBox(Math.min(5, b.w * 0.4), 1.0, 0.9, bx, 0, bz, accent));
  rect(bx - Math.min(5, b.w * 0.4) / 2, bx + Math.min(5, b.w * 0.4) / 2, bz - 0.45, bz + 0.45);
  for (const sx of [-1, 1]) {
    const sx0 = b.x + sx * (b.w / 2 - 1.6);
    const len = Math.max(3, b.d * 0.45);
    solid.push(coloredBox(0.5, 2.0, len, sx0, 0, b.z - 0.5, 0x8d6e4f));
    rect(sx0 - 0.25, sx0 + 0.25, b.z - 0.5 - len / 2, b.z - 0.5 + len / 2);
    for (let k = 0; k < 5; k++) {
      solid.push(coloredBox(0.36, 0.3, 0.5, sx0, 0.5 + (k % 3) * 0.5, b.z - 0.5 - len / 2 + 0.6 + (len - 1.2) * (k / 4), SHOP_COLORS[Math.floor(rand() * SHOP_COLORS.length)]!));
    }
  }
  // Luminárias no teto
  for (const lx of [-1, 1]) solid.push(coloredBox(1.4, 0.06, 0.5, b.x + lx * (b.w * 0.22), GROUND_FLOOR_H - 0.07, b.z, 0xfff6d6));
  return { solid: mergeGeometries(solid)!, glass: mergeGeometries(glass)!, rects };
}

/** Textura de fachada: parede cinza com uma janela escura e uma moldura clara (uma célula = 1 janela × 1 andar). */
export function makeFacadeTexture(): CanvasTexture {
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#cfd3d6";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#3b4a57";
  ctx.fillRect(8, 12, S - 16, S - 28);
  ctx.fillStyle = "#6f8799";
  ctx.fillRect(8, 12, S - 16, 8);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Metade dos prédios (as fileiras junto à rua) têm lojas; os de trás ficam fechados. */
export const hasShop = (b: Building) => b.row < 2;

/** Térreo fechado: paredes cheias e uma porta dupla fechada voltada para a rua. */
function closedFor(b: Building, rand: () => number): ShopParts {
  const solid: BufferGeometry[] = [];
  const wall = new Color(b.color).multiplyScalar(0.8).getHex();
  solid.push(coloredBox(b.w, GROUND_FLOOR_H, b.d, b.x, 0, b.z, wall));
  const toStreet = b.z > 0 ? -1 : 1;
  const zf = b.z + toStreet * (b.d / 2 + 0.06);
  const frame = 0x2a2d33;
  const door = [0x6b4a2f, 0x3d5a80, 0x5a3d3d, 0x2f4f4f][Math.floor(rand() * 4)]!;
  const dx = b.x + (rand() - 0.5) * Math.max(0, b.w - 5);
  solid.push(coloredBox(3.0, 2.8, 0.1, dx, 0, zf, frame));
  for (const sx of [-1, 1]) {
    solid.push(coloredBox(1.35, 2.6, 0.14, dx + sx * 0.7, 0, zf + toStreet * 0.03, door));
    solid.push(coloredBox(0.08, 0.3, 0.1, dx + sx * 0.12, 1.0, zf + toStreet * 0.13, 0xd8c27a));
  }
  solid.push(coloredBox(3.2, 0.12, 0.2, dx, 2.85, zf, frame));
  return {
    solid: mergeGeometries(solid)!,
    glass: new PlaneGeometry(0.001, 0.001),
    rects: [{ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 }],
  };
}

/** Faixa amarela e postes em volta de TODA a cidade (e só ali): é o limite por onde o jogador não passa. */
function PerimeterTape() {
  const posts = useRef<InstancedMesh>(null);
  const tapes = useRef<InstancedMesh>(null);
  const edges = useMemo(() => {
    const e: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const hx = CITY_HALF_X;
    const hz = CITY_HALF_Z;
    e.push({ x0: -hx, z0: -hz, x1: hx, z1: -hz }, { x0: -hx, z0: hz, x1: hx, z1: hz });
    e.push({ x0: -hx, z0: -hz, x1: -hx, z1: hz }, { x0: hx, z0: -hz, x1: hx, z1: hz });
    return e;
  }, []);
  const postCount = useMemo(() => edges.reduce((n, e) => n + Math.ceil(Math.hypot(e.x1 - e.x0, e.z1 - e.z0) / 4) + 1, 0), [edges]);

  useLayoutEffect(() => {
    if (!posts.current || !tapes.current) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    let pi = 0;
    let ti = 0;
    for (const e of edges) {
      const dx = e.x1 - e.x0;
      const dz = e.z1 - e.z0;
      const len = Math.hypot(dx, dz);
      const n = Math.ceil(len / 4);
      for (let k = 0; k <= n; k++) {
        m.compose(new Vector3(e.x0 + (dx * k) / n, 0.9, e.z0 + (dz * k) / n), q, new Vector3(1, 1, 1));
        posts.current.setMatrixAt(pi++, m);
      }
      // Faixa: caixa comprida girada para seguir o lado (comprimento em X antes de girar).
      q.setFromAxisAngle(up, -Math.atan2(dz, dx));
      for (const y of [0.7, 1.35]) {
        m.compose(new Vector3((e.x0 + e.x1) / 2, y, (e.z0 + e.z1) / 2), q, new Vector3(len, 1, 1));
        tapes.current.setMatrixAt(ti++, m);
      }
      q.identity();
    }
    posts.current.count = pi;
    tapes.current.count = ti;
    posts.current.instanceMatrix.needsUpdate = true;
    tapes.current.instanceMatrix.needsUpdate = true;
  }, [edges]);

  return (
    <group>
      <instancedMesh ref={posts} frustumCulled={false} args={[undefined, undefined, Math.max(1, postCount)]}>
        <cylinderGeometry args={[0.07, 0.07, 1.8, 6]} />
        <meshStandardMaterial color={0x555b62} />
      </instancedMesh>
      <instancedMesh ref={tapes} frustumCulled={false} args={[undefined, undefined, edges.length * 2]}>
        <boxGeometry args={[1, 0.16, 0.05]} />
        <meshStandardMaterial color={0xffd12e} emissive={0x6b5200} />
      </instancedMesh>
    </group>
  );
}

/** Partes da viatura (comprimento ao longo de Z; frente = +Z), agrupadas por material para instanciar. */
function policeCarParts(): Record<"white" | "blue" | "black" | "red" | "lightBlue", BufferGeometry> {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const wheel = (x: number, z: number) => {
    const g = new CylinderGeometry(0.38, 0.38, 0.28, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0.38, z);
    return g;
  };
  const merge = (list: BufferGeometry[]) => mergeGeometries(list)!;
  return {
    white: merge([box(1.9, 0.75, 4.4, 0, 0.75, 0), box(1.6, 0.55, 2.0, 0, 1.4, -0.2)]),
    blue: merge([box(1.92, 0.28, 4.42, 0, 0.62, 0), box(1.62, 0.2, 2.02, 0, 1.28, -0.2)]),
    black: merge([wheel(-0.95, 1.4), wheel(0.95, 1.4), wheel(-0.95, -1.4), wheel(0.95, -1.4), box(1.95, 0.2, 0.2, 0, 0.5, 2.25), box(1.95, 0.2, 0.2, 0, 0.5, -2.25)]),
    red: merge([box(0.38, 0.16, 1.0, -0.25, 1.78, -0.2)]),
    lightBlue: merge([box(0.38, 0.16, 1.0, 0.25, 1.78, -0.2)]),
  };
}

const CAR_COLORS = { white: 0xf2f4f7, blue: 0x1d4ea0, black: 0x15181c, red: 0xff2b2b, lightBlue: 0x2b6bff } as const;

/**
 * Bloqueio de viaturas nas duas pontas da avenida: mostra que não dá para passar (o jogador para antes delas,
 * ver clampToAvenue). Cada tipo de peça é um mesh instanciado.
 */
function PoliceBlockade() {
  const parts = useMemo(policeCarParts, []);
  const keys = Object.keys(parts) as (keyof typeof parts)[];
  const refs = useRef<Record<string, InstancedMesh | null>>({});

  // Viaturas lado a lado, atravessadas na avenida e nas calçadas, com leve variação de ângulo.
  const cars = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    const half = AVENUE_WIDTH / 2 + SIDEWALK;
    for (const end of [1, -1] as const) {
      const x = end * (CITY_HALF_X - 2.4);
      for (let z = -half + 2.4; z <= half - 2.4 + 0.01; z += 5.2) {
        const jitter = ((Math.round(z * 10) % 7) - 3) * 0.015;
        // Paradas de lado para quem vem pela avenida: o comprimento da viatura fica ao longo de Z.
        out.push({ x, z, rot: (end === 1 ? 0 : Math.PI) + jitter });
      }
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    for (const k of keys) {
      const mesh = refs.current[k];
      if (!mesh) continue;
      cars.forEach((c, i) => {
        q.setFromAxisAngle(new Vector3(0, 1, 0), c.rot);
        m.compose(new Vector3(c.x, 0, c.z), q, new Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [cars, keys]);

  return (
    <group>
      {keys.map((k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            refs.current[k] = el;
          }}
          args={[parts[k], undefined, cars.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial
            color={CAR_COLORS[k]}
            emissive={k === "red" || k === "lightBlue" ? CAR_COLORS[k] : 0x000000}
            emissiveIntensity={k === "red" || k === "lightBlue" ? 0.9 : 0}
          />
        </instancedMesh>
      ))}
    </group>
  );
}

/** Cavalete de sinalização (comprimento ao longo de Z): duas tábuas amarelas com listra preta e pés. */
function trestleParts(): Record<"yellow" | "black", BufferGeometry> {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const yellow: BufferGeometry[] = [];
  const black: BufferGeometry[] = [];
  for (const y of [1.0, 0.55]) {
    yellow.push(box(0.08, 0.3, 2.2, 0, y, 0));
    black.push(box(0.09, 0.07, 2.2, 0, y, 0));
  }
  for (const z of [-0.95, 0.95]) {
    black.push(box(0.07, 1.15, 0.07, 0, 0.575, z));
    black.push(box(0.5, 0.06, 0.07, 0, 0.03, z));
  }
  return { yellow: mergeGeometries(yellow)!, black: mergeGeometries(black)! };
}

/** Cavaletes amarelos alinhados na frente das viaturas, do lado da avenida. */
function Trestles() {
  const parts = useMemo(trestleParts, []);
  const refs = useRef<Record<string, InstancedMesh | null>>({});
  const spots = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const half = AVENUE_WIDTH / 2 + SIDEWALK;
    for (const end of [1, -1] as const) {
      for (let z = -half + 1.3; z <= half - 1.3 + 0.01; z += 2.6) out.push({ x: end * (CITY_HALF_X - 4.3), z });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    for (const k of ["yellow", "black"] as const) {
      const mesh = refs.current[k];
      if (!mesh) continue;
      spots.forEach((s, i) => {
        m.compose(new Vector3(s.x, 0, s.z), q, new Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [spots]);

  return (
    <group>
      {(["yellow", "black"] as const).map((k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            refs.current[k] = el;
          }}
          args={[parts[k], undefined, spots.length]}
          frustumCulled={false}
        >
          <meshStandardMaterial color={k === "yellow" ? 0xffd12e : 0x1b1d20} emissive={k === "yellow" ? 0x6b5200 : 0x000000} />
        </instancedMesh>
      ))}
    </group>
  );
}

export function City() {
  const { buildings, geometry, shops } = useMemo(() => {
    const list = buildCity();
    const rand = mulberry32(4242);
    const parts = list.map((b) => (hasShop(b) ? shopFor(b, rand) : closedFor(b, rand)));
    return {
      buildings: list,
      geometry: mergeGeometries(list.map(boxFor))!,
      shops: {
        solid: mergeGeometries(parts.map((p) => p.solid))!,
        glass: mergeGeometries(parts.map((p) => p.glass))!,
        rects: parts.flatMap((p) => p.rects),
      },
    };
  }, []);
  const texture = useMemo(() => makeFacadeTexture(), []);

  useEffect(() => {
    // Câmera: só os andares de cima bloqueiam (dá para entrar nas lojas do térreo).
    const boxes = buildings.map(
      (b) =>
        new Box3(
          new Vector3(b.x - b.w / 2, hasShop(b) ? GROUND_FLOOR_H : 0, b.z - b.d / 2),
          new Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2),
        ),
    );
    setCameraColliders("city", [], boxes);
    // Personagem e veículos: só vidros, colunas, balcões e prateleiras (a cidade é toda andável).
    setSolids("city", shops.rects);
    // Viaturas e cavaletes nas pontas da avenida: bloqueiam a faixa toda (rua + calçadas).
    const band = AVENUE_WIDTH / 2 + SIDEWALK_WIDTH;
    setSolids("blockade", [-1, 1].map((end) => ({
      minX: Math.min(end * (CITY_HALF_X - 5.2), end * (CITY_HALF_X - 1.6)),
      maxX: Math.max(end * (CITY_HALF_X - 5.2), end * (CITY_HALF_X - 1.6)),
      minZ: -band,
      maxZ: band,
    })));
    return () => {
      clearCameraColliders("city");
      clearSolids("city");
      clearSolids("blockade");
    };
  }, [buildings, shops]);
  useEffect(
    () => () => {
      shops.solid.dispose();
      shops.glass.dispose();
    },
    [shops],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Torre de antena no prédio mais alto de uma das fileiras da frente (marco como na Paulista).
  const antenna = useMemo(() => {
    const tall = buildings.filter((b) => b.z < 0 && Math.abs(b.z) < 62 && b.x > 40 && b.x < 110).sort((a, b) => b.h - a.h)[0];
    return tall ?? null;
  }, [buildings]);

  return (
    <group>
      {/* Chão da cidade (sob tudo) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[X_LIMIT * 2 + 40, 420]} />
        <meshStandardMaterial color={0x474c52} />
      </mesh>
      {/* Calçadas dos dois lados da avenida, fora da praça e do parque */}
      {[1, -1].map((side) =>
        [-1, 1].map((xs) => {
          const x0 = PLAZA_HALF_X + 1;
          const len = X_LIMIT - x0;
          return (
            <mesh
              key={`${side}${xs}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[xs * (x0 + len / 2), 0.004, side * (AVENUE_WIDTH / 2 + SIDEWALK / 2)]}
            >
              <planeGeometry args={[len, SIDEWALK]} />
              <meshStandardMaterial color={0x8b9096} />
            </mesh>
          );
        }),
      )}
      <PerimeterTape />
      <PoliceBlockade />
      <Trestles />
      {/* Prédios (um mesh só) */}
      <mesh geometry={geometry}>
        <meshStandardMaterial map={texture} vertexColors />
      </mesh>
      <mesh geometry={shops.solid}>
        <meshStandardMaterial vertexColors />
      </mesh>
      <mesh geometry={shops.glass}>
        <meshStandardMaterial color={0x9fd8ee} transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
      </mesh>
      {antenna && (
        <group position={[antenna.x, antenna.h, antenna.z]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 3 + i * 6, 0]}>
              <cylinderGeometry args={[0.55 - i * 0.1, 0.65 - i * 0.1, 6, 8]} />
              <meshStandardMaterial color={i % 2 === 0 ? 0xd9322b : 0xf4f4f4} />
            </mesh>
          ))}
          <mesh position={[0, 27, 0]}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshStandardMaterial color={0xff3b30} emissive={0xff3b30} emissiveIntensity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
