import { createMobileHud, type MobileHud } from './mobile';
import { setViewportUnit } from './orientation';

/** Cria o HUD (celular e PC). */
export function createHud(opts: { onVoiceTalk: (on: boolean) => void; onPause: () => void; onGarage: () => void }): MobileHud {
  setViewportUnit();
  window.addEventListener('resize', setViewportUnit);
  return createMobileHud(opts);
}
