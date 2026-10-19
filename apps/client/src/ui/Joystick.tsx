import { useRef, useState } from "react";

interface JoystickProps {
  /** x e z normalizados em [-1, 1]; z negativo = para frente. */
  onMove: (x: number, z: number) => void;
}

const MAX = 56;
const DEAD = 10;
const BASE_SIZE = MAX * 2;
const KNOB_SIZE = 44;
/** Margem do canto inferior esquerdo até o centro da bolinha fixa. */
const ANCHOR_INSET = 28 + MAX;

/**
 * Joystick virtual de toque, fixo no canto inferior esquerdo (uma "bolinha"
 * sempre visível, como em jogos de terceira pessoa). A área sensível cobre
 * a metade inferior esquerda da tela — tocar em qualquer ponto dela arrasta
 * o botão a partir do centro fixo da base, não de onde o dedo tocou.
 * Em desktop, o jogador usa o teclado e pode ignorá-lo.
 */
export function Joystick({ onMove }: JoystickProps) {
  const [knob, setKnob] = useState({ dx: 0, dy: 0 });
  const [active, setActive] = useState(false);
  const pointer = useRef<number | null>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);

  const anchorOf = (zone: Element): { x: number; y: number } => {
    const rect = zone.getBoundingClientRect();
    return { x: rect.left + ANCHOR_INSET, y: rect.bottom - ANCHOR_INSET };
  };

  const start = (e: React.PointerEvent) => {
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    anchorRef.current = anchorOf(e.currentTarget);
    setActive(true);
    move(e);
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current || !anchorRef.current) return;
    const dx = e.clientX - anchorRef.current.x;
    const dy = e.clientY - anchorRef.current.y;
    const dist = Math.min(Math.hypot(dx, dy), MAX);
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) * dist;
    const ky = Math.sin(ang) * dist;
    setKnob({ dx: kx, dy: ky });
    if (Math.hypot(dx, dy) < DEAD) onMove(0, 0);
    else onMove(Math.max(-1, Math.min(1, dx / MAX)), Math.max(-1, Math.min(1, dy / MAX)));
  };

  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    anchorRef.current = null;
    setActive(false);
    setKnob({ dx: 0, dy: 0 });
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
        width: "50%",
        bottom: 0,
        height: "55%",
        touchAction: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: ANCHOR_INSET - MAX,
          bottom: ANCHOR_INSET - MAX,
          width: BASE_SIZE,
          height: BASE_SIZE,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid var(--line)",
          transition: active ? "none" : "background .15s",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: ANCHOR_INSET - KNOB_SIZE / 2 + knob.dx,
          bottom: ANCHOR_INSET - KNOB_SIZE / 2 - knob.dy,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: "50%",
          background: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.5)",
          border: "2px solid rgba(21,24,29,0.5)",
          transition: active ? "none" : "left .15s, bottom .15s, background .15s",
        }}
      />
    </div>
  );
}
