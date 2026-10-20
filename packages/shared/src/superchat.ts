/** Superchat: mensagem paga em destaque. Faixa e limites validados também no servidor. */

export const SUPERCHAT_MIN_CENTS = 500;
export const SUPERCHAT_MAX_CENTS = 20000;
export const SUPERCHAT_MAX_NAME = 40;
export const SUPERCHAT_MAX_MESSAGE = 200;
/** Pedidos em análise/aguardando pagamento por conta (barra spam de fila). */
export const SUPERCHAT_MAX_OPEN_PER_USER = 3;

/**
 * review → (admin aprova) awaiting_payment → (Pix confirmado) paid → exibido.
 * rejected: recusado na análise. refunded: Pix estornado.
 */
export type SuperchatStatus = "review" | "awaiting_payment" | "paid" | "rejected" | "refunded";

export interface Superchat {
  id: string;
  name: string;
  message: string;
  amount_cents: number;
  status: SuperchatStatus;
  created_at: string;
}

/** Tempo em destaque (ms): 6 s base + 1 s a cada R$ 2, no máximo 40 s. */
export function superchatDisplayMs(amountCents: number): number {
  return Math.min(40_000, 6_000 + Math.floor(amountCents / 200) * 1_000);
}

/** Faixa visual (0 a 3) pelo valor. */
export function superchatTier(amountCents: number): 0 | 1 | 2 | 3 {
  if (amountCents >= 10000) return 3;
  if (amountCents >= 5000) return 2;
  if (amountCents >= 2000) return 1;
  return 0;
}
