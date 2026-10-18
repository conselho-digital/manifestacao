import { useRef, useState } from "react";

interface JoystickProps {
  /** x e z normalizados em [-1, 1]; z negativo = para frente. */
  onMove: (x: number, z: number) => void;
}

const MAX = 56;
const DEAD = 10;

/**
 * Joystick virtual para toque. Aparece onde o dedo encosta na metade inferior
 * da tela. Em desktop, o jogador usa o teclado e pode ignorá-lo.
 */
export function Joystick({ onMove }: JoystickProps) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const pointer = useRef<number | null>(null);

  const start = (e: React.PointerEvent) => {
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    setKnob({ ox: e.clientX, oy: e.clientY, kx: e.clientX, ky: e.clientY });
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current || !knob) return;
    const dx = e.clientX - knob.ox;
    const dy = e.clientY - knob.oy;
    const dist = Math.min(Math.hypot(dx, dy), MAX);
    const ang = Math.atan2(dy, dx);
    const kx = knob.ox + Math.cos(ang) * dist;
    const ky = knob.oy + Math.sin(ang) * dist;
    setKnob({ ...knob, kx, ky });
    if (Math.hypot(dx, dy) < DEAD) onMove(0, 0);
    else onMove(Math.max(-1, Math.min(1, dx / MAX)), Math.max(-1, Math.min(1, dy / MAX)));
  };

  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    setKnob(null);
    onMove(0, 0);
  };

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: "55%",
        touchAction: "none",
        zIndex: 5,
      }}
    >
      {knob && (
        <>
          <div
            style={{
              position: "fixed",
              left: knob.ox - MAX,
              top: knob.oy - MAX,
              width: MAX * 2,
              height: MAX * 2,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: knob.kx - 22,
              top: knob.ky - 22,
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.6)",
              border: "2px solid rgba(21,24,29,0.5)",
            }}
          />
        </>
      )}
    </div>
  );
}
