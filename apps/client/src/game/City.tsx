import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  Box3,
  CanvasTexture,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
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
  AVENUE_END_MARGIN,
  AVENUE_LENGTH,
  AVENUE_WIDTH,
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

const WINDOW_W = 3; // largura de uma "janela" (unidades do mundo)
const FLOOR_H = 3.4; // altura de um andar
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

const PALETTE = [0x8aa0b0, 0x9aa7ad, 0xb8ad9a, 0x7d6f64, 0xc9c6bd, 0x5f7686, 0xa9b4bb, 0x6f8190];

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

/** Caixa do prédio com UV proporcional ao tamanho real (janelas não esticam) e cor por vértice. */
function boxFor(b: Building): BufferGeometry {
  const g = new BoxGeometry(b.w, b.h, b.d);
  const uv = g.getAttribute("uv");
  // Ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada).
  const faces: [number, number][] = [
    [b.d, b.h], // +x
    [b.d, b.h], // -x
    [0, 0], // +y (telhado)
    [0, 0], // -y
    [b.w, b.h], // +z
    [b.w, b.h], // -z
  ];
  for (let f = 0; f < 6; f++) {
    const [sw, sh] = faces[f]!;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (sw === 0) uv.setXY(i, 0.02, 0.02); // telhado: cor lisa do canto da textura
      else uv.setXY(i, (uv.getX(i) * sw) / WINDOW_W, (uv.getY(i) * sh) / FLOOR_H);
    }
  }
  g.translate(b.x, b.h / 2, b.z);
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

/** Textura de fachada: parede cinza com uma janela escura e uma moldura clara (uma célula = 1 janela × 1 andar). */
function makeFacadeTexture(): CanvasTexture {
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

interface FenceSeg {
  x0: number;
  x1: number;
  side: 1 | -1;
}

/** Vãos entre os prédios da frente (fora da praça e do parque): é onde não há avenida, então ganham cerca. */
function fenceSegments(buildings: Building[]): FenceSeg[] {
  const out: FenceSeg[] = [];
  const reach = AVENUE_LENGTH / 2 - AVENUE_END_MARGIN; // até onde o jogador chega
  const open = PLAZA_HALF_X; // praça (+Z) e parque (-Z) têm 2×32 de largura e ficam abertos
  for (const side of [1, -1] as const) {
    const row = buildings
      .filter((b) => b.row === 0 && Math.sign(b.z) === side)
      .sort((a, b) => a.x - b.x);
    const edges: [number, number][] = []; // trechos ocupados por prédio
    for (const b of row) edges.push([b.x - b.w / 2, b.x + b.w / 2]);
    let cursor = -reach;
    const gaps: [number, number][] = [];
    for (const [l, r] of edges) {
      if (l > cursor) gaps.push([cursor, Math.min(l, reach)]);
      cursor = Math.max(cursor, r);
    }
    if (cursor < reach) gaps.push([cursor, reach]);
    for (const [g0, g1] of gaps) {
      // tira a parte que cai na praça/parque (aberta)
      const parts: [number, number][] = [];
      if (g0 < -open) parts.push([g0, Math.min(g1, -open)]);
      if (g1 > open) parts.push([Math.max(g0, open), g1]);
      for (const [a, b] of parts) if (b - a > 0.3) out.push({ x0: a, x1: b, side });
    }
  }
  return out;
}

/** Cercas com faixa amarela nos vãos entre prédios: mostram onde a calçada acaba (dois meshes instanciados). */
function Fences({ buildings }: { buildings: Building[] }) {
  const segs = useMemo(() => fenceSegments(buildings), [buildings]);
  const posts = useRef<InstancedMesh>(null);
  const tapes = useRef<InstancedMesh>(null);
  const zLine = AVENUE_WIDTH / 2 + SIDEWALK - 0.2;

  const postCount = useMemo(() => segs.reduce((n, s) => n + Math.ceil((s.x1 - s.x0) / 3) + 1, 0), [segs]);

  useLayoutEffect(() => {
    if (!posts.current || !tapes.current) return;
    const m = new Matrix4();
    const q = new Quaternion();
    let pi = 0;
    let ti = 0;
    for (const sg of segs) {
      const z = sg.side * zLine;
      const len = sg.x1 - sg.x0;
      const n = Math.ceil(len / 3);
      for (let k = 0; k <= n; k++) {
        m.compose(new Vector3(sg.x0 + (len * k) / n, 0.9, z), q, new Vector3(1, 1, 1));
        posts.current.setMatrixAt(pi++, m);
      }
      for (const y of [0.7, 1.35]) {
        m.compose(new Vector3((sg.x0 + sg.x1) / 2, y, z), q, new Vector3(len, 1, 1));
        tapes.current.setMatrixAt(ti++, m);
      }
    }
    posts.current.count = pi;
    tapes.current.count = ti;
    posts.current.instanceMatrix.needsUpdate = true;
    tapes.current.instanceMatrix.needsUpdate = true;
  }, [segs]);

  return (
    <group>
      <instancedMesh ref={posts} frustumCulled={false} args={[undefined, undefined, Math.max(1, postCount)]}>
        <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
        <meshStandardMaterial color={0x555b62} />
      </instancedMesh>
      <instancedMesh ref={tapes} frustumCulled={false} args={[undefined, undefined, Math.max(2, segs.length * 2)]}>
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
      const x = end * (AVENUE_LENGTH / 2 - 2.4);
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
      for (let z = -half + 1.3; z <= half - 1.3 + 0.01; z += 2.6) out.push({ x: end * (AVENUE_LENGTH / 2 - 4.3), z });
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
  const { buildings, geometry } = useMemo(() => {
    const list = buildCity();
    return { buildings: list, geometry: mergeGeometries(list.map(boxFor))! };
  }, []);
  const texture = useMemo(() => makeFacadeTexture(), []);

  // A câmera de terceira pessoa não atravessa os prédios.
  useEffect(() => {
    const boxes = buildings.map(
      (b) =>
        new Box3(
          new Vector3(b.x - b.w / 2, 0, b.z - b.d / 2),
          new Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2),
        ),
    );
    setCameraColliders("city", [], boxes);
    // O personagem e os veículos também não atravessam os prédios.
    setSolids(
      "city",
      buildings.map((b) => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 })),
    );
    return () => {
      clearCameraColliders("city");
      clearSolids("city");
    };
  }, [buildings]);
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
      <Fences buildings={buildings} />
      <PoliceBlockade />
      <Trestles />
      {/* Prédios (um mesh só) */}
      <mesh geometry={geometry}>
        <meshStandardMaterial map={texture} vertexColors />
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
