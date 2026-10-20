/**
 * Opções de spray: a "Clássica" (padrão, grátis) mais as criadas pelo admin.
 * Lista em memória, preenchida por loadAndApplyGameConfig (config/gameConfig.ts).
 */

export const DEFAULT_SPRAY_ID = "classico";
export const SPRAY_SLUG_RE = /^[a-z0-9-]{1,32}$/;

export interface SprayOption {
  /** slug (sem o prefixo "spray:" do catálogo). */
  id: string;
  label: string;
  priceCents: number;
  /** Cor da marca; null = cor da equipe do jogador. */
  color: number | null;
}

const DEFAULT_OPTION: SprayOption = { id: DEFAULT_SPRAY_ID, label: "Clássico", priceCents: 0, color: null };

let options: SprayOption[] = [DEFAULT_OPTION];

export function setSprayOptions(list: SprayOption[]): void {
  options = [DEFAULT_OPTION, ...list.filter((o) => o.id !== DEFAULT_SPRAY_ID)];
}

export function sprayOptions(): readonly SprayOption[] {
  return options;
}

export function sprayOptionById(id: string | undefined | null): SprayOption {
  return options.find((o) => o.id === id) ?? DEFAULT_OPTION;
}

/** Só o clássico e os de preço zero são livres; os demais exigem posse (`spray:<id>`). */
export function sprayUnlocked(o: SprayOption, owned: ReadonlySet<string>): boolean {
  return o.priceCents === 0 || owned.has(`spray:${o.id}`);
}
