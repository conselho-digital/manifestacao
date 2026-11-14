/** Configurações do jogador (salvas no navegador): sensibilidade do mouse/toque e limite de FPS. */
const KEY = 'arena-settings';

export interface Settings {
  /** multiplicador da sensibilidade ao girar a câmera (1 = padrão) */
  sens: number;
  /** limitar os quadros por segundo (ligado por padrão) */
  fpsCapOn: boolean;
  /** limite de FPS quando ligado */
  fpsCap: number;
}

export const FPS_CAPS = [30, 45, 60, 90, 120] as const;

const DEFAULTS: Settings = { sens: 1, fpsCapOn: true, fpsCap: 30 };

function load(): Settings {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const sens = typeof o.sens === 'number' && Number.isFinite(o.sens) ? Math.min(3, Math.max(0.2, o.sens)) : DEFAULTS.sens;
    const fpsCap = (FPS_CAPS as readonly number[]).includes(o.fpsCap as number) ? (o.fpsCap as number) : DEFAULTS.fpsCap;
    return { sens, fpsCapOn: typeof o.fpsCapOn === 'boolean' ? o.fpsCapOn : DEFAULTS.fpsCapOn, fpsCap };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* sem armazenamento: vale só nesta sessão */ }
}

/** Câmera: 0 = terceira pessoa (padrão), 1 = terceira pessoa perto (metade da distância), 2 = primeira pessoa. Tecla C no PC. */
export const view = { mode: 0 };
export const CAMERA_MODES = 3;
