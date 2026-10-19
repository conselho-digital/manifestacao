import { useRef } from "react";

interface CameraLookProps {
  /** Ângulo da câmera (radianos) — arrastar na horizontal gira em torno do personagem. */
  yawRef: { current: number };
}

/** Pixels de arrasto para girar 1 radiano (quanto menor, mais sensível). */
const PX_PER_RADIAN = 160;

function wrapAngle(a: number): number {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/**
 * Zona de arrasto invisível na metade direita da tela: controla a câmera de
 * terceira pessoa (como em jogos de câmera livre), sem joystick visual —
 * só o movimento vindo do dedo. Fica embaixo do TopRightPanel (zIndex menor),
 * então os botões de Loja/Veículo/Correr continuam clicáveis por cima.
 */
export function CameraLook({ yawRef }: CameraLookProps) {
  const pointer = useRef<number | null>(null);
  const lastX = useRef(0);

  const start = (e: React.PointerEvent) => {
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    yawRef.current = wrapAngle(yawRef.current + dx / PX_PER_RADIAN);
  };

  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
  };

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: "fixed",
        right: 0,
        width: "50%",
        top: 0,
        bottom: 0,
        touchAction: "none",
        zIndex: 4,
      }}
    />
  );
}
