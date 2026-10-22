import type { FlagId, TeamId } from "@manifestacao/shared";

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
  z: number;
  color: number;
  /** Opção de spray (slug) — define o modelo 3D da marca. */
  style: string;
  /** Equipe de quem pichou: a marca é a imagem da bandeira da equipe (se o admin enviou). */
  team?: TeamId;
  /** Bandeira que quem pichou carrega: se a equipe não tem imagem, vale a imagem desta bandeira. */
  flag?: FlagId;
  createdAt: number;
}
