import { useEffect, useRef } from "react";

/** Vetor de movimento no plano XZ, componentes em [-1, 1]. */
export interface InputVector {
  x: number;
  z: number;
}

/**
 * Entrada de movimento unificada: teclado (WASD/setas) + joystick de toque.
 * Retorna um ref lido a cada frame e um setter que o joystick alimenta.
 * z negativo = para frente (longe da câmera).
 */
export function useInput() {
  const inputRef = useRef<InputVector>({ x: 0, z: 0 });
  const keyRef = useRef<InputVector>({ x: 0, z: 0 });
  const joyRef = useRef<InputVector>({ x: 0, z: 0 });
  const pressed = useRef<Set<string>>(new Set());

  // Combina teclado e joystick; teclado tem prioridade se ativo.
  const read = (): InputVector => {
    const k = keyRef.current;
    if (k.x !== 0 || k.z !== 0) return k;
    return joyRef.current;
  };

  // Atualiza o ref lido a cada frame pelo Player. Chamado nos próprios
  // handlers (sem depender de re-render do React).
  const apply = () => {
    inputRef.current = read();
  };

  useEffect(() => {
    const recompute = () => {
      const k = pressed.current;
      let x = 0;
      let z = 0;
      if (k.has("a") || k.has("arrowleft")) x -= 1;
      if (k.has("d") || k.has("arrowright")) x += 1;
      if (k.has("w") || k.has("arrowup")) z -= 1;
      if (k.has("s") || k.has("arrowdown")) z += 1;
      keyRef.current = { x, z };
      apply();
    };
    const down = (e: KeyboardEvent) => {
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
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
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
