/** Cartaz personalizado: texto curto + cor de fundo, carregado pelo personagem. */

export const SIGN_MAX_TEXT = 40;
/** Preço fixo (centavos). A cobrança usa o mesmo valor, definido também na Edge Function. */
export const SIGN_PRICE_CENTS = 990;
/** Cores permitidas (a mesma lista vale no banco e nas Edge Functions). */
export const SIGN_COLORS = ["#f8f9fa", "#ffd43b", "#51cf66", "#4dabf7", "#ff6b6b", "#b197fc"] as const;
export type SignColor = (typeof SIGN_COLORS)[number];

/** review → awaiting_payment (admin aprova) → active (Pix pago) | rejected | refunded. */
export type SignStatus = "review" | "awaiting_payment" | "active" | "rejected" | "refunded" | "expired";

/** Quanto tempo um cartaz (ou telão) fica no ar depois de ativado. */
export const AD_DURATION_HOURS = 12;

export interface CustomSign {
  id: string;
  text: string;
  color: string;
  status: SignStatus;
  created_at: string;
  /** Caminho da imagem (bucket user-media), se o cartaz é uma imagem. */
  image_path?: string | null;
  /** Fim das 12 h no ar (só depois de ativado). */
  expires_at?: string | null;
}

export const SIGN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSignColor(v: unknown): v is SignColor {
  return typeof v === "string" && (SIGN_COLORS as readonly string[]).includes(v);
}

/** Texto escuro em fundos claros (todas as cores da paleta são claras/médias). */
export const SIGN_INK = "#1a1d21";
