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

// Cores ajustadas para bom contraste no tema escuro (fundo asfalto).
export const TEAMS: Record<TeamId, Team> = {
  verde: { id: "verde", label: "Verdes", color: 0x2ecc71 },
  roxo: { id: "roxo", label: "Roxos", color: 0x9b5de5 },
  neutro: { id: "neutro", label: "Neutros", color: 0x8b97a3 },
};

export const TEAM_IDS: TeamId[] = ["verde", "roxo", "neutro"];

export function isTeamId(value: unknown): value is TeamId {
  return typeof value === "string" && value in TEAMS;
}

/** Converte uma cor numérica (0xrrggbb) em string hex CSS (#rrggbb). */
export function hexColor(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}
