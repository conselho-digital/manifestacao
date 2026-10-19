import { useEffect, useRef } from "react";

/** Vetor de movimento no plano XZ, componentes em [-1, 1]. */
export interface InputVector {
  x: number;
  z: number;
}

const ZERO: InputVector = { x: 0, z: 0 };

/** true quando o foco está num campo de texto (ex.: chat) — o teclado não deve mexer no jogo. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Entrada de movimento unificada: teclado (WASD/setas) + joystick de toque.
 * Retorna um ref lido a cada frame e um setter que o joystick alimenta.
 * z negativo = para frente (longe da câmera).
 *
 * `enabled`: quando false (ex. um modal como a loja está aberto), o input
 * fica zerado mesmo que teclas continuem pressionadas — evita que o avatar
 * se mova "por baixo" de um diálogo aberto.
 */
export function useInput(enabled = true) {
  const inputRef = useRef<InputVector>({ x: 0, z: 0 });
  const keyRef = useRef<InputVector>({ x: 0, z: 0 });
  const joyRef = useRef<InputVector>({ x: 0, z: 0 });
  const pressed = useRef<Set<string>>(new Set());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Combina teclado e joystick; teclado tem prioridade se ativo.
  const read = (): InputVector => {
    if (!enabledRef.current) return ZERO;
    const k = keyRef.current;
    if (k.x !== 0 || k.z !== 0) return k;
    return joyRef.current;
  };

  // Atualiza o ref lido a cada frame pelo Player. Chamado nos próprios
  // handlers (sem depender de re-render do React).
  const apply = () => {
    inputRef.current = read();
  };

  // Reaplica imediatamente quando `enabled` muda (zera o movimento ao abrir
  // um modal, mesmo sem nenhum novo evento de teclado/toque).
  useEffect(() => {
    apply();
  }, [enabled]);

  useEffect(() => {
    const recompute = () => {
      const k = pressed.current;
      let x = 0;
      let z = 0;
      // Esquerda/direita invertidas de propósito (testado: o mapeamento
      // anterior andava pro lado errado) — vale pra A/D e setas.
      if (k.has("a") || k.has("arrowleft")) x += 1;
      if (k.has("d") || k.has("arrowright")) x -= 1;
      if (k.has("w") || k.has("arrowup")) z -= 1;
      if (k.has("s") || k.has("arrowdown")) z += 1;
      keyRef.current = { x, z };
      apply();
    };
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      pressed.current.add(e.key.toLowerCase());
      recompute();
    };
    const up = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
      recompute();
    };
    const blur = () => {
      pressed.current.clear();
      recompute();
    };
    // Ao focar um campo de texto com uma tecla de movimento ainda segurada, o
    // keyup iria pro campo — zera pra o personagem não ficar andando sozinho.
    const focusIn = (e: FocusEvent) => {
      if (isTypingTarget(e.target)) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("focusin", focusIn);
    return () => {
      window.removeEventListener("focusin", focusIn);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /** Alimentado pelo joystick de toque (valores em [-1, 1]). */
  const setJoystick = (x: number, z: number) => {
    joyRef.current = { x, z };
    apply();
  };

  return { inputRef, read, setJoystick };
}
