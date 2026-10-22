import { useEffect, useRef, useState } from "react";

interface JoystickProps {
  /** x e z normalizados em [-1, 1]; z negativo = para frente. */
  onMove: (x: number, z: number) => void;
}

const MAX = 56;
const DEAD = 10;
const BASE_SIZE = MAX * 2;
const KNOB_SIZE = 44;
/** Margem do canto esquerdo até a borda da bolinha fixa. */
const INSET_LEFT = 28;
/** Margem do canto inferior até a borda da bolinha (mais alta que a lateral). */
const INSET_BOTTOM = 84;
/** Folga de toque ao redor da bolinha. O RESTO da tela (inclusive o lado esquerdo) gira a câmera. */
const TOUCH_PAD = 10;
const ZONE_SIZE = BASE_SIZE + TOUCH_PAD * 2;

/**
 * Joystick virtual de toque, fixo no canto inferior esquerdo (uma "bolinha"
 * sempre visível, como em jogos de terceira pessoa). A área sensível é só
 * um quadrado em volta da bolinha — o jogador precisa tocar perto dela;
 * arrasta o botão a partir do centro fixo da base, não de onde o dedo tocou.
 * Em desktop, o jogador usa o teclado e pode ignorá-lo.
 */
export function Joystick({ onMove }: JoystickProps) {
  const [knob, setKnob] = useState({ dx: 0, dy: 0 });
  const [active, setActive] = useState(false);
  const pointer = useRef<number | null>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  const anchorOf = (zone: Element): { x: number; y: number } => {
    // Centro da zona (= centro da bolinha). getBoundingClientRect já considera os
    // env(safe-area-inset-*) usados no posicionamento (ver estilo abaixo).
    const rect = zone.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // Recalcula o anchor se a viewport mudar com o dedo ainda tocando (ex.:
  // rotação de tela, barra de endereço recolhendo) — sem isso o dx/dy ficava
  // medido contra um canto que não é mais onde a bolinha é desenhada.
  useEffect(() => {
    const recalc = () => {
      if (pointer.current !== null && zoneRef.current) {
        anchorRef.current = anchorOf(zoneRef.current);
      }
    };
    // Se a aba perde foco/fica oculta com o dedo ainda "tocando" (troca de
    // app, notificação), o pointerup pode nunca chegar — sem isso o joystick
    // travaria permanentemente, ignorando todo novo toque.
    const release = () => {
      pointer.current = null;
      anchorRef.current = null;
      setActive(false);
      setKnob({ dx: 0, dy: 0 });
      onMove(0, 0);
    };
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      onMove(0, 0); // desmontar com o dedo apoiado não pode deixar um input fantasma andando
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [onMove]);

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
    // Eixo horizontal invertido de propósito: o visual do botão segue o dedo,
    // mas o personagem anda pro lado oposto.
    else onMove(Math.max(-1, Math.min(1, -dx / MAX)), Math.max(-1, Math.min(1, dy / MAX)));
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
      ref={zoneRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        position: "fixed",
        // Zona de toque = só a bolinha + folga (nada de faixa até a borda da tela).
        left: `calc(env(safe-area-inset-left, 0px) + ${INSET_LEFT - TOUCH_PAD}px)`,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${INSET_BOTTOM - TOUCH_PAD}px)`,
        width: ZONE_SIZE,
        height: ZONE_SIZE,
        touchAction: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: TOUCH_PAD,
          borderRadius: "50%",
          background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
          border: "1px solid var(--line)",
          transition: active ? "none" : "background .15s",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: ZONE_SIZE / 2 - KNOB_SIZE / 2 + knob.dx,
          top: ZONE_SIZE / 2 - KNOB_SIZE / 2 + knob.dy,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: "50%",
          background: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.5)",
          border: "2px solid rgba(21,24,29,0.5)",
          transition: active ? "none" : "left .15s, top .15s, background .15s",
        }}
      />
    </div>
  );
}
