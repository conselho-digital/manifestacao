/** Telões: painéis na avenida. Quem dá o maior lance (pago) exibe; o lance superado vira crédito. */

import type { SignColor } from "./signs.js";

export interface BillboardSpot {
  id: string;
  label: string;
  /** Posição no mundo 3D (plano XZ) e giro em Y (0 = de frente para +Z). */
  x: number;
  z: number;
  rotationY: number;
}

export const BILLBOARDS: readonly BillboardSpot[] = [
  { id: "tela-1", label: "Telão Oeste", x: -60, z: 23, rotationY: Math.PI },
  { id: "tela-2", label: "Telão Leste", x: 60, z: 23, rotationY: Math.PI },
  { id: "tela-3", label: "Telão do Parque", x: -30, z: -22, rotationY: 0 },
];

export const BID_MIN_CENTS = 2000;
export const BID_MAX_CENTS = 1000000;
export const BID_MAX_TEXT = 60;

export type BidStatus = "review" | "awaiting_payment" | "active" | "outbid" | "rejected" | "refunded" | "expired";

/** O que o público vê de um telão no ar. */
export interface BillboardAd {
  id: string;
  billboard_id: string;
  text: string;
  color: SignColor | string;
  amount_cents: number;
  /** Imagem do anúncio (bucket user-media); com ou sem texto. */
  image_path?: string | null;
  /** Fim das 12 h no ar. */
  expires_at?: string | null;
}

export interface MyBid extends BillboardAd {
  status: BidStatus;
  created_at: string;
}

/** Menor lance aceito sobre o atual (mesma regra da função `bid_minimum` do banco). */
export function nextMinBid(currentCents: number | null): number {
  if (currentCents == null) return BID_MIN_CENTS;
  return Math.max(BID_MIN_CENTS, currentCents + Math.max(500, Math.ceil(currentCents * 0.1)));
}
