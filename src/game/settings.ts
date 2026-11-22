/** Configurações do jogador (salvas no navegador): sensibilidade do mouse/toque e limite de FPS. */
const KEY = 'arena-settings';

export interface Settings {
  /** multiplicador da sensibilidade ao girar a câmera (padrão 0,6 = 60% da antiga) */
  sens: number;
  /** limitar os quadros por segundo (ligado por padrão) */
  fpsCapOn: boolean;
  /** limite de FPS quando ligado */
  fpsCap: number;
  /** círculo no chão em volta de cada personagem: até onde a voz chega */
  voiceRing: boolean;
  /** qualidade gráfica: resolução de desenho e sombras (padrão: média) */
  quality: Quality;
}

export type Quality = 'high' | 'medium' | 'low';
export const QUALITIES: readonly Quality[] = ['high', 'medium', 'low'];

export const FPS_CAPS = [30, 45, 60, 90, 120] as const;

const DEFAULTS: Settings = { sens: 0.6, fpsCapOn: false, fpsCap: 30, voiceRing: true, quality: 'medium' };

function load(): Settings {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    // quem salvou antes da versão 4 volta ao padrão (60%); a escolha feita depois é respeitada
    const sens = (o as { sensV?: number }).sensV === 4 && typeof o.sens === 'number' && Number.isFinite(o.sens) ? Math.min(3, Math.max(0.2, o.sens)) : DEFAULTS.sens;
    const fpsCap = (FPS_CAPS as readonly number[]).includes(o.fpsCap as number) ? (o.fpsCap as number) : DEFAULTS.fpsCap;
    // quem salvou antes da versão 2 volta ao padrão (sem limite)
    return { sens, fpsCapOn: (o as { fpsV?: number }).fpsV === 2 && typeof o.fpsCapOn === 'boolean' ? o.fpsCapOn : DEFAULTS.fpsCapOn, fpsCap, voiceRing: typeof o.voiceRing === 'boolean' ? o.voiceRing : DEFAULTS.voiceRing, quality: QUALITIES.includes(o.quality as Quality) ? (o.quality as Quality) : DEFAULTS.quality };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...settings, fpsV: 2, sensV: 4 })); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

/** Câmera: 0 = terceira pessoa (padrão), 1 = terceira pessoa perto (metade da distância). Tecla G no PC. */
export const view = { mode: 0 };
export const CAMERA_MODES = 2;

/** Quem precisa saber quando a qualidade muda (resolução e sombras) se registra aqui. */
const qualityListeners = new Set<() => void>();
export function onQualityChange(fn: () => void): void { qualityListeners.add(fn); }
export function setQuality(q: Quality): void {
  if (settings.quality === q) return;
  settings.quality = q;
  saveSettings();
  qualityListeners.forEach((f) => f());
}
