import type { FlagId, TeamId } from "@manifestacao/shared";
import { AVENUE_LENGTH, AVENUE_WIDTH, PARK_GAP, PARK_SIZE, clampToAvenue } from "./world.js";

/**
 * Constantes do spray/pichação (Fase 4, CLAUDE.md §3 "Spray / pixação").
 *
 * Efêmero por design: as marcas vivem só na memória de cada cliente
 * (sincronizadas por broadcast do Supabase Realtime), nunca em banco — e
 * desaparecem sozinhas depois de 30 minutos.
 *
 * Cartucho: hoje é só um contador local (client-trust, como o resto do MVP
 * não autoritativo — CLAUDE.md §4). A venda de cartuchos extras (catálogo
 * "grátis + comprados") fica para quando entrar a cobrança desse item.
 */

/** Tempo até uma marca de spray sumir sozinha. */
export const SPRAY_LIFETIME_MS = 30 * 60 * 1000; // 30 minutos

/** Intervalo de limpeza das marcas expiradas. */
export const SPRAY_CLEANUP_INTERVAL_MS = 30_000;

/** Limite de marcas simultâneas na avenida (evita crescimento sem fim). */
export const SPRAY_MAX_MARKS = 400;

/** Sprays por dia (por aparelho/conta, zera à meia-noite). Ver game/useDailySprays.ts. */
export const SPRAY_DAILY_LIMIT = 15;

/**
 * Alcance máximo do spray a partir do jogador: a marca vai onde a mira (centro
 * da tela) cruza o chão, mas nunca além desta distância.
 */
export const SPRAY_MAX_RANGE = 14;

/**
 * Intervalo mínimo entre envios aceitos (por remetente), tanto no cliente
 * (defesa própria, independente do cartucho — alguém pode chamar sendSpray
 * direto pelo DevTools, ignorando o botão) quanto na recepção (todo mundo
 * que recebe o broadcast aplica o mesmo limite, então um remetente malicioso
 * não consegue inundar o canal mesmo ignorando o limite do próprio cliente).
 */
export const SPRAY_MIN_INTERVAL_MS = 400;

/** Tamanho máximo aceito para o `id` de uma marca vinda da rede. */
export const SPRAY_ID_MAX_LENGTH = 64;

export interface SprayMark {
  id: string;
  x: number;
  /** Altura do ponto pintado (0 = chão). */
  y: number;
  z: number;
  /** Normal da superfície pintada (unitária); (0,1,0) = chão. */
  nx: number;
  ny: number;
  nz: number;
  color: number;
  /** Direção (rad, em torno de Y) de quem pichou até a marca: no chão, a base da imagem fica do lado do pé dele. */
  rot: number;
  /** Opção de spray (slug) — define o modelo 3D da marca. */
  style: string;
  /** Equipe de quem pichou: a marca é a imagem da bandeira da equipe (se o admin enviou). */
  team?: TeamId;
  /** Bandeira que quem pichou carrega: se a equipe não tem imagem, vale a imagem desta bandeira. */
  flag?: FlagId;
  createdAt: number;
}

/** Ângulo vindo da rede: só números finitos (normalizado para -π..π); senão o padrão (topo da imagem para -Z). */
export function sanitizeSprayRot(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return Math.PI;
  return Math.atan2(Math.sin(v), Math.cos(v));
}

/** Onde a mira (centro da tela) pinta: o ponto e a normal da superfície (chão, parede, tronco, copa…). */
export interface SprayAim {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Valida o ponto de uma marca (vindo da rede ou da mira local): números finitos, dentro do mundo, normal unitária.
 * Marca no chão (normal para cima) segue a regra de andar da avenida; em paredes só vale o recorte do mundo.
 */
export function sanitizeSprayPlacement(x: unknown, y: unknown, z: unknown, nx: unknown, ny: unknown, nz: unknown): SprayAim | null {
  if (!finite(x) || !finite(z)) return null;
  let yy = finite(y) ? y : 0;
  let ux = finite(nx) ? nx : 0;
  let uy = finite(ny) ? ny : 1;
  let uz = finite(nz) ? nz : 0;
  const len = Math.hypot(ux, uy, uz);
  if (len < 0.5 || len > 1.5) {
    ux = 0;
    uy = 1;
    uz = 0;
  } else {
    ux /= len;
    uy /= len;
    uz /= len;
  }
  if (uy > 0.9) {
    const p = clampToAvenue(x, z);
    return { x: p.x, y: 0, z: p.z, nx: 0, ny: 1, nz: 0 };
  }
  yy = Math.max(0, Math.min(160, yy));
  const xLimit = AVENUE_LENGTH / 2 + 60;
  const zMin = -(AVENUE_WIDTH / 2 + PARK_GAP + PARK_SIZE) - 8;
  return { x: Math.max(-xLimit, Math.min(xLimit, x)), y: yy, z: Math.max(zMin, Math.min(140, z)), nx: ux, ny: uy, nz: uz };
}
