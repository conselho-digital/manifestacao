import { useEffect, useRef } from "react";

export interface ControlState {
  /** Eixos de movimento: x = direita(+)/esquerda(−), z = trás(+)/frente(−). */
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
  /** Botão direito do mouse segurado. */
  aim: boolean;
  /** Pulso: true por um quadro quando o botão esquerdo é clicado (consumido pelo controlador). */
  attack: boolean;
  /** Ângulos da câmera, acumulados pelo mouse (pointer lock). */
  yaw: number;
  pitch: number;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * Teclado (WASD/setas, Shift, Espaço) e mouse (olhar, mirar, atacar). Devolve um ref lido a cada quadro:
 * não causa re-render. O mouse só gira a câmera com o ponteiro "travado" (clique no canvas para travar; Esc solta).
 */
export function useControls(canvasEl: HTMLElement | null, sensitivity: number, pitchRange: [number, number]) {
  const state = useRef<ControlState>({ x: 0, z: 0, run: false, jump: false, aim: false, attack: false, yaw: 0, pitch: 0.25 });
  const keys = useRef(new Set<string>());

  useEffect(() => {
    const s = state.current;
    const recompute = () => {
      const k = keys.current;
      s.x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      s.z = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
      s.run = k.has("shift");
      s.jump = k.has(" ");
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      keys.current.add(e.key.toLowerCase());
      recompute();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
      recompute();
    };
    const blur = () => {
      keys.current.clear();
      s.aim = false;
      recompute();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasEl) return;
      s.yaw -= e.movementX * sensitivity;
      s.pitch = Math.max(pitchRange[0], Math.min(pitchRange[1], s.pitch + e.movementY * sensitivity));
    };
    const mouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvasEl) {
        void canvasEl?.requestPointerLock?.();
        return;
      }
      if (e.button === 0) s.attack = true;
      if (e.button === 2) s.aim = true;
    };
    const mouseUp = (e: MouseEvent) => {
      if (e.button === 2) s.aim = false;
    };
    const noMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", mouseUp);
    canvasEl?.addEventListener("mousedown", mouseDown);
    canvasEl?.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", mouseUp);
      canvasEl?.removeEventListener("mousedown", mouseDown);
      canvasEl?.removeEventListener("contextmenu", noMenu);
    };
  }, [canvasEl, sensitivity, pitchRange]);

  return state;
}
