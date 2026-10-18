/**
 * Times/lados da manifestação.
 *
 * Nomes fictícios e neutros de propósito: o CLAUDE.md (§7) recomenda evitar
 * partidos e pessoas reais por risco eleitoral e de direito de imagem.
 * Troque livremente conforme a decisão de produto (§8).
 */

export type TeamId = "verde" | "roxo" | "neutro";

export interface Team {
  id: TeamId;
  /** Nome exibido na interface (pt-BR). */
  label: string;
  /** Cor base do time em hex (#rrggbb), usada em camisa e UI. */
  color: number;
}

export const TEAMS: Record<TeamId, Team> = {
  verde: { id: "verde", label: "Verdes", color: 0x27ae60 },
  roxo: { id: "roxo", label: "Roxos", color: 0x8e44ad },
  neutro: { id: "neutro", label: "Neutros", color: 0x95a5a6 },
};

export const TEAM_IDS: TeamId[] = ["verde", "roxo", "neutro"];

export function isTeamId(value: unknown): value is TeamId {
  return typeof value === "string" && value in TEAMS;
}
