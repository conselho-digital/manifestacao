/**
 * Configuração do protótipo 3D (cenário urbano + personagem em 3ª pessoa com física).
 * Tudo que costuma mudar de projeto para projeto fica aqui: pastas, nomes de arquivo e de animação.
 */

/**
 * Pasta (dentro de `public/`) onde ficam os `.glb`/`.fbx`. Em um projeto Next.js use "/assets".
 * Neste projeto (Vite) NÃO use "/assets": é a pasta dos arquivos gerados no build e o service worker
 * os guarda para sempre; "/models" é servida com atualização em segundo plano.
 */
export const ASSET_BASE = "/models";

let assetBase: string = ASSET_BASE;
/** Troca a pasta de assets em tempo de execução (ex.: a versão offline usa "/offline"). */
export function setAssetBase(base: string): void {
  assetBase = base;
}
export function getAssetBase(): string {
  return assetBase;
}

/** Arquivos (relativos a ASSET_BASE): `mapa.glb` (cenário) e `player.glb` (personagem). O de colisão é opcional: uma versão simplificada do cenário. */
export const FILES = {
  city: "mapa.glb",
  /** Malha simples só para colisão (casas = caixas), ex.: "mapa_colisao.glb". Se for null, usa a própria malha de `mapa.glb`. */
  cityCollision: null as string | null,
  character: "player.glb",
} as const;

/**
 * Nome do clipe de animação dentro do arquivo do personagem, para cada estado. Ajuste aos nomes do seu arquivo
 * (ex.: os do Mixamo: "Idle", "Walking", "Running"). Estado sem clipe cai em `idle`.
 */
export const CLIPS = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  aim: "Aim",
  attack: "Attack",
} as const;

export type Locomotion = keyof typeof CLIPS;

/** Altura (m) em que o personagem é ajustado ao carregar — corrige modelos exportados em outra escala. */
export const CHARACTER_HEIGHT = 1.75;

export const PHYSICS = {
  gravity: [0, -22, 0] as [number, number, number],
  /** Cápsula do personagem (metros): meia altura do trecho reto e raio. */
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.35,
  walkSpeed: 3.2,
  runSpeed: 6.4,
  /** Velocidade quando mirando (andando devagar). */
  aimSpeed: 1.8,
  jumpSpeed: 7,
} as const;

export const CAMERA = {
  distance: 4.2,
  aimDistance: 2.2,
  height: 1.55,
  /** Deslocamento lateral ("sobre o ombro"). */
  shoulder: 0.45,
  minPitch: -0.5,
  maxPitch: 1.2,
  /** Radianos por pixel do mouse. */
  sensitivity: 0.0024,
} as const;
