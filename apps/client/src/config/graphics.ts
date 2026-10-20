/** Qualidade gráfica (% da resolução nativa). Vale na hora e fica salva no aparelho. */
export const GRAPHICS_LEVELS = [100, 75, 50, 25] as const;
export type GraphicsLevel = (typeof GRAPHICS_LEVELS)[number];

const STORAGE_KEY = "manifestacao.graphics";

export function loadGraphics(): GraphicsLevel {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return GRAPHICS_LEVELS.find((l) => l === n) ?? 100;
  } catch {
    return 100;
  }
}

export function saveGraphics(level: GraphicsLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(level));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/** Escala de pixels do canvas: densidade do aparelho (máx. 2) × nível. Pode ficar < 1. */
export function graphicsDpr(level: GraphicsLevel): number {
  return Math.min(window.devicePixelRatio || 1, 2) * (level / 100);
}

/** Antisserrilhado só nos níveis altos (trocar exige recriar o canvas). */
export function graphicsAntialias(level: GraphicsLevel): boolean {
  return level >= 75;
}
