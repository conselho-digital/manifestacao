// Armas de fogo longas, todas seguradas da mesma forma (coronha no ombro, mão de apoio no guarda-mão).
// Cada modelo é medido no espaço do GLB (x = comprimento, para o cano; y = altura): ponta do cano, altura do eixo do cano,
// empunhadura (mão direita) e guarda-mão (mão esquerda). Daí saem as posições no espaço da arma (cano em +Z).
import * as THREE from 'three';

export type RifleKind = 'ak' | 'm4' | 'm16' | 'hb';
export const RIFLE_KINDS: RifleKind[] = ['ak', 'm4', 'm16', 'hb'];

interface Spec {
  file: string;
  /** caixa do modelo no GLB (m) */
  minX: number; maxX: number; minY: number; maxY: number;
  /** comprimento da arma no jogo (m) */
  len: number;
  /** ponta do cano (x) e altura do eixo do cano (y) */
  tipX: number; axisY: number;
  /** empunhadura e guarda-mão: [x, y] no modelo */
  gripR: [number, number];
  gripL: [number, number];
}

// AK-47: valores já calibrados na mão (ver CFG em anim.ts); o resto foi medido nos modelos com dev/gun-grid.html
const SPECS: Record<Exclude<RifleKind, 'ak'>, Spec> = {
  m4: { file: 'm4a1.glb', minX: -0.2889, maxX: 0.7019, minY: -0.1201, maxY: 0.207, len: 0.88, tipX: 0.7019, axisY: 0.13, gripR: [0.0746, -0.021], gripL: [0.405, 0.073] },
  m16: { file: 'm16-new.glb', minX: -0.2466, maxX: 0.7434, minY: -0.089, maxY: 0.1599, len: 0.88, tipX: 0.7434, axisY: 0.116, gripR: [0.059, -0.014], gripL: [0.382, 0.058] },
  hb: { file: 'honey-badger.glb', minX: -0.1858, maxX: 0.5837, minY: -0.1224, maxY: 0.226, len: 0.8, tipX: 0.5837, axisY: 0.174, gripR: [0.0625, 0.0194], gripL: [0.371, 0.121] },
};

/** altura do eixo do cano no espaço da arma (igual à do AK, para a mira e a coronha ficarem no mesmo lugar) */
const AXIS_Y = 0.019;
/** o modelo é puxado 0,3 m para a frente (o AK também): a coronha fica atrás da origem */
const Z0 = 0.3;

export interface RifleGeo {
  file: string;
  /** escala do modelo e deslocamento vertical dentro do suporte */
  scale: number;
  shiftY: number;
  /** boca do cano (de onde sai o tiro e o clarão) */
  flash: THREE.Vector3;
  gripR: THREE.Vector3;
  gripL: THREE.Vector3;
  /** centro do modelo (para centralizar ao carregar) */
  cx: number; cy: number;
}

const cache = new Map<RifleKind, RifleGeo>();

export function rifleGeo(kind: RifleKind): RifleGeo {
  let g = cache.get(kind);
  if (g) return g;
  if (kind === 'ak') {
    g = { file: 'AK47.glb', scale: 0, shiftY: 0, flash: new THREE.Vector3(-0.017, AXIS_Y, 0.75), gripR: new THREE.Vector3(0, -0.055, 0.17), gripL: new THREE.Vector3(0, -0.02, 0.5), cx: 0, cy: 0 };
  } else {
    const s = SPECS[kind];
    const cx = (s.minX + s.maxX) / 2;
    const cy = (s.minY + s.maxY) / 2;
    const scale = s.len / (s.maxX - s.minX);
    const shiftY = AXIS_Y - (s.axisY - cy) * scale;
    const at = (x: number, y: number): THREE.Vector3 => new THREE.Vector3(0, (y - cy) * scale + shiftY, (x - cx) * scale + Z0);
    g = { file: s.file, scale, shiftY, flash: at(s.tipX + 0.012, s.axisY), gripR: at(...s.gripR), gripL: at(...s.gripL), cx, cy };
  }
  cache.set(kind, g);
  return g;
}

/** Código de rede da arma: o AK usa os códigos 1 (baixo) e 2 (mirando); os outros fuzis, 14+ (par = baixo, ímpar = mirando). */
export function rifleNetCode(kind: RifleKind, aiming: boolean): number {
  if (kind === 'ak') return aiming ? 2 : 1;
  return 14 + (RIFLE_KINDS.indexOf(kind) - 1) * 2 + (aiming ? 1 : 0);
}

export function rifleFromNetCode(code: number): { kind: RifleKind; aiming: boolean } | null {
  if (code < 14 || code > 19) return null;
  return { kind: RIFLE_KINDS[1 + Math.floor((code - 14) / 2)]!, aiming: code % 2 === 1 };
}
