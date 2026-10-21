import { useEffect, useRef } from "react";
import { clampPitch } from "../game/world.js";

interface CameraLookProps {
  /** Ângulo horizontal da câmera (radianos) — arrastar na horizontal gira em torno do personagem. */
  yawRef: { current: number };
  /** Inclinação vertical (radianos) — arrastar na vertical olha pra cima/baixo. */
  pitchRef: { current: number };
  /** A zona cobre a tela toda (qualquer toque fora da UI gira a câmera); o joystick e os botões ficam por cima. */
  fullScreen?: boolean;
}

/** Pixels de arrasto para girar 1 radiano (quanto menor, mais sensível). */
const PX_PER_RADIAN = 160;

function wrapAngle(a: number): number {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/**
 * Zona de arrasto invisível (tela toda): controla a câmera de
 * terceira pessoa livre (gira E inclina em torno do personagem, como em
 * jogos de terceira pessoa), sem joystick visual — só o movimento vindo do
 * dedo. Fica embaixo do TopRightPanel (zIndex menor), então os botões de
 * Loja/Veículo/Correr continuam clicáveis por cima.
 */
export function CameraLook({ yawRef, pitchRef, fullScreen = false }: CameraLookProps) {
  const pointer = useRef<number | null>(null);
  const lastX = useRef(0);
  const lastY = useRef(0);

  // Se a aba perde foco/fica oculta com o dedo ainda "tocando" (troca de
  // app, notificação), o pointerup pode nunca chegar — sem isso o arrasto
  // travaria permanentemente, ignorando todo novo toque na zona.
  useEffect(() => {
    const release = () => {
      pointer.current = null;
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);

  const start = (e: React.PointerEvent) => {
    if (pointer.current !== null) return;
    // Mouse: só o botão principal (o menu de contexto do botão direito pode engolir o pointerup).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointer.current = e.pointerId;
    (e.target as Element).setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    lastY.current = e.clientY;
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId !== pointer.current) return;
    const dx = e.clientX - lastX.current;
    const dy = e.clientY - lastY.current;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    // Sentido invertido: arrastar pra direita gira a câmera pra esquerda.
    yawRef.current = wrapAngle(yawRef.current - dx / PX_PER_RADIAN);
    // Arrastar pra cima (dy negativo) inclina a câmera pra baixo (pitch
    // menor), olhando mais de frente/de baixo — como puxar a câmera junto
    // com o dedo. Pitch não é circular, por isso é clampado (não wrapAngle).
    pitchRef.current = clampPitch(pitchRef.current + dy / PX_PER_RADIAN);
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
        width: fullScreen ? "100%" : "50%",
        top: 0,
        bottom: 0,
        touchAction: "none",
        zIndex: 4,
      }}
    />
  );
}
