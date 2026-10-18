/**
 * Constantes do spray/pichação (Fase 4, CLAUDE.md §3 "Spray / pixação").
 *
 * Efêmero por design: as marcas vivem só na memória de cada cliente
 * (sincronizadas por broadcast do Supabase Realtime), nunca em banco — e
 * desaparecem sozinhas depois de algumas horas, como o CLAUDE.md pede.
 *
 * Cartucho: hoje é só um contador local (client-trust, como o resto do MVP
 * não autoritativo — CLAUDE.md §4). A venda de cartuchos extras (catálogo
 * "grátis + comprados") fica para quando entrar a cobrança desse item.
 */

/** Tempo até uma marca de spray sumir sozinha. */
export const SPRAY_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 horas

/** Intervalo de limpeza das marcas expiradas. */
export const SPRAY_CLEANUP_INTERVAL_MS = 30_000;

/** Limite de marcas simultâneas na avenida (evita crescimento sem fim). */
export const SPRAY_MAX_MARKS = 400;

/** Cartucho: carga inicial, recarga por item e intervalo de recarga. */
export const SPRAY_CARTRIDGE_SIZE = 15;
export const SPRAY_REFILL_INTERVAL_MS = 8_000;

/** Distância à frente do jogador onde a marca aparece ao usar o spray. */
export const SPRAY_REACH = 1.6;

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
  createdAt: number;
}
