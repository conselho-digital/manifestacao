import type { Pt, RigKey } from "../config/rigs.js";
import type { OrientedModel } from "./autoRig.js";

type Marks = Record<RigKey, Pt>;

/**
 * Acha sozinho onde ficam cabeça, pescoço, ombro, mão, cintura, quadril, joelho e pé, olhando a silhueta do modelo de
 * frente (largura em cada altura, onde as pernas se separam, onde o corpo mais se estreita no pescoço). Serve de ponto de
 * partida: o admin só arrasta o que ficar fora do lugar. Devolve null se a silhueta não for de um corpo em pé reconhecível.
 */
export function autoMarks(model: OrientedModel): Marks | null {
  const H = model.size.y;
  if (!(H > 0.2)) return null;
  const NY = 120;
  const NX = 96;
  const halfW = Math.max(model.size.x / 2, 0.01) * 1.02;
  // Ocupação: para cada fatia de altura, quais faixas de x têm vértices.
  const occ: Uint8Array[] = Array.from({ length: NY }, () => new Uint8Array(NX));
  for (const p of model.pieces) {
    const pos = p.geometry.getAttribute("position");
    const idx = p.geometry.getIndex();
    // Vértices e pontos intermediários das arestas (malhas com triângulos grandes não deixam buracos).
    const mark = (x: number, y: number) => {
      const iy = Math.min(NY - 1, Math.max(0, Math.floor((y / H) * NY)));
      const ix = Math.min(NX - 1, Math.max(0, Math.floor(((x + halfW) / (2 * halfW)) * NX)));
      occ[iy]![ix] = 1;
    };
    const n = idx ? idx.count : pos.count;
    const at = (k: number) => (idx ? idx.getX(k) : k);
    for (let k = 0; k + 2 < n; k += 3) {
      const a = at(k), b = at(k + 1), c = at(k + 2);
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const steps = 3;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          mark(pos.getX(u) + (pos.getX(v) - pos.getX(u)) * t, pos.getY(u) + (pos.getY(v) - pos.getY(u)) * t);
        }
      }
    }
  }
  const row = (y: number) => occ[Math.min(NY - 1, Math.max(0, Math.round((y / H) * NY)))]!;
  const xOf = (ix: number) => ((ix + 0.5) / NX) * 2 * halfW - halfW;
  const extent = (r: Uint8Array): [number, number] | null => {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < NX; i++) if (r[i]) (lo < 0 ? (lo = i) : 0), (hi = i);
    return lo < 0 ? null : [xOf(lo) - halfW / NX, xOf(hi) + halfW / NX];
  };
  const widthAt = (y: number) => {
    const e = extent(row(y));
    return e ? e[1] - e[0] : 0;
  };

  // Pescoço: o ponto mais estreito logo abaixo da cabeça.
  let yNeck = 0.86 * H;
  let best = Infinity;
  for (let y = 0.8 * H; y <= 0.93 * H; y += H / NY) {
    const w = widthAt(y);
    if (w > 0 && w < best) {
      best = w;
      yNeck = y;
    }
  }
  // Virilha: de cima para baixo, a primeira fatia em que o meio fica vazio entre duas pernas.
  let yCrotch = 0.47 * H;
  const mid = Math.floor(NX / 2);
  for (let y = 0.62 * H; y > 0.3 * H; y -= H / NY) {
    const r = row(y);
    const centerEmpty = !r[mid - 1] && !r[mid] && !r[mid + 1];
    const left = r.slice(0, mid - 1).some(Boolean);
    const right = r.slice(mid + 2).some(Boolean);
    if (centerEmpty && left && right) {
      yCrotch = y;
      break;
    }
  }
  // Pose em T (braços abertos) ou braços ao lado do corpo?
  let armY = 0.82 * H;
  let armW = 0;
  for (let y = 0.62 * H; y <= 0.9 * H; y += H / NY) {
    const w = widthAt(y);
    if (w > armW) {
      armW = w;
      armY = y;
    }
  }
  const hipsW = widthAt(yCrotch - 0.08 * H) || 0.2 * H;
  const tPose = armW > 1.7 * hipsW && armW > 0.6 * H;

  const torsoHalf = Math.max(0.08 * H, (widthAt(tPose ? armY - 0.12 * H : yNeck - 0.1 * H) / 2) * 0.92);
  const shoulderY = tPose ? armY : yNeck - 0.04 * H;
  const shoulder: Pt = [torsoHalf, shoulderY];
  let hand: Pt;
  if (tPose) {
    const e = extent(row(armY));
    hand = [e ? Math.max(torsoHalf + 0.1 * H, e[1] * 0.96) : 0.45 * H, armY];
  } else {
    let maxX = 0;
    for (let y = 0.42 * H; y <= 0.58 * H; y += H / NY) {
      const e = extent(row(y));
      if (e) maxX = Math.max(maxX, e[1]);
    }
    hand = [Math.max(torsoHalf + 0.02 * H, maxX * 0.9), 0.46 * H];
  }
  const elbow: Pt = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2];
  // Perna: centro da perna direita (x > 0) abaixo da virilha.
  let legX = 0.07 * H;
  {
    const r = row(Math.max(0.1 * H, yCrotch - 0.15 * H));
    let lo = -1;
    let hi = -1;
    for (let i = mid; i < NX; i++) if (r[i]) (lo < 0 ? (lo = i) : 0), (hi = i);
    if (lo >= 0) legX = (xOf(lo) + xOf(hi)) / 2;
  }
  const ankleY = 0.05 * H;
  const hip: Pt = [legX, yCrotch + 0.03 * H];
  const knee: Pt = [legX, (hip[1] + ankleY) / 2];
  const marks: Marks = {
    head: [0, 0.975 * H],
    neck: [0, yNeck],
    shoulder,
    elbow,
    hand,
    pelvis: [0, yCrotch + 0.05 * H],
    hip,
    knee,
    ankle: [legX, ankleY],
    toe: [legX, 0.02 * H],
  };
  // Sanidade: tudo finito e na ordem certa de cima para baixo.
  for (const p of Object.values(marks)) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (!(marks.head[1] > marks.neck[1] && marks.neck[1] > marks.pelvis[1] && marks.pelvis[1] > marks.ankle[1])) return null;
  return marks;
}
