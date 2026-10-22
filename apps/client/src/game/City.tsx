import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  Box3,
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clearCameraColliders, setCameraColliders } from "./colliders.js";
import { AVENUE_LENGTH, AVENUE_WIDTH, PARK_GAP, PARK_SIZE, PLAZA_HALF_X, PLAZA_MAX_Z } from "./world.js";

/**
 * Entorno da avenida (inspirado no layout da Paulista): quarteirões de prédios altos nos dois lados, atrás da
 * praça do MASP e atrás do parque, com calçadas e uma torre de antena. Tudo gerado por código (nenhum modelo de
 * terceiros), num único mesh com cor por prédio e textura de janelas repetida pelo tamanho real de cada fachada.
 */

const WINDOW_W = 3; // largura de uma "janela" (unidades do mundo)
const FLOOR_H = 3.4; // altura de um andar
const X_LIMIT = AVENUE_LENGTH / 2 + 30; // a cidade passa um pouco das pontas da avenida
const SIDEWALK = 6; // largura da calçada junto à avenida

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
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
    return () => clearCameraColliders("city");
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
