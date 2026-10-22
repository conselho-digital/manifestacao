import { useEffect, useRef, useState } from "react";
import type { VehicleKind } from "@manifestacao/shared";
import type { DriveInput } from "../game/driving.js";

interface DriveControlsProps {
  /** Carro/caminhão: 4 botões. Moto: 6 (com empinar/abaixar a roda da frente). */
  kind: Exclude<VehicleKind, "foot">;
  /** Os botões escrevem aqui; o Player lê a cada frame. */
  driveRef: { current: DriveInput };
}

type Key = keyof DriveInput;

const SIZE = 76;
/** Botões da cruz da moto: do mesmo tamanho dos de acelerar/frear, bem juntos. */
const CROSS_SIZE = SIZE;
const CROSS_GAP = 0;
const cross: React.CSSProperties = { width: CROSS_SIZE, height: CROSS_SIZE };
const EDGE = 14;

function Arrow({ dir }: { dir: "left" | "right" | "up" | "down" }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M8 4l9 8-9 8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Botão de segurar: fica ativo enquanto o dedo está nele (cada botão tem o seu dedo, então dá para
 * girar e acelerar ao mesmo tempo). Solta ao levantar o dedo, cancelar o toque ou perder o foco.
 */
function HoldButton({
  label,
  onChange,
  accent = false,
  children,
  style,
}: {
  label: string;
  onChange: (down: boolean) => void;
  accent?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [down, setDown] = useState(false);
  const pointer = useRef<number | null>(null);
  const set = (v: boolean) => {
    setDown(v);
    onChange(v);
  };
  const release = () => {
    if (pointer.current === null) return;
    pointer.current = null;
    set(false);
  };
  useEffect(() => {
    const off = () => release();
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", off);
    return () => {
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", off);
      if (pointer.current !== null) onChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={down}
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: "50%",
        border: `2px solid ${accent ? "var(--accent)" : "var(--line)"}`,
        background: down ? (accent ? "var(--accent)" : "rgba(255,255,255,0.28)") : "var(--scrim)",
        color: down && accent ? "var(--on-accent)" : "var(--ink)",
        fontSize: "var(--t-ui)",
        fontWeight: 800,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "pointer",
        transform: down ? "scale(.94)" : undefined,
        transition: "transform .08s, background .12s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Controles de direção na tela (celular). Esquerda: virar. Direita: acelerar e frear.
 * Moto: cruz no lado esquerdo — cima/baixo empinam e abaixam a roda da frente, esquerda/direita viram.
 */
export function DriveControls({ kind, driveRef }: DriveControlsProps) {
  const bind = (key: Key) => (down: boolean) => {
    driveRef.current = { ...driveRef.current, [key]: down };
  };
  const inset = {
    left: `calc(env(safe-area-inset-left, 0px) + ${EDGE}px)`,
    right: `calc(env(safe-area-inset-right, 0px) + ${EDGE}px)`,
    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${EDGE + 10}px)`,
  };
  return (
    <>
      {/* Esquerda. Moto: cruz (empinar em cima, abaixar embaixo, virar nos lados). Carro/caminhão: só virar. */}
      {kind === "moto" ? (
        <div
          style={{
            position: "fixed",
            left: inset.left,
            bottom: inset.bottom,
            zIndex: 5,
            display: "grid",
            gridTemplateColumns: `repeat(3, ${CROSS_SIZE}px)`,
            gridTemplateRows: `repeat(3, ${CROSS_SIZE}px)`,
            gap: CROSS_GAP,
          }}
        >
          <HoldButton label="Empinar a roda da frente" onChange={bind("up")} style={{ ...cross, gridColumn: 2, gridRow: 1 }}>
            <Arrow dir="up" />
          </HoldButton>
          <HoldButton label="Virar para a esquerda" onChange={bind("left")} style={{ ...cross, gridColumn: 1, gridRow: 2 }}>
            <Arrow dir="left" />
          </HoldButton>
          <HoldButton label="Virar para a direita" onChange={bind("right")} style={{ ...cross, gridColumn: 3, gridRow: 2 }}>
            <Arrow dir="right" />
          </HoldButton>
          <HoldButton label="Abaixar a roda da frente" onChange={bind("down")} style={{ ...cross, gridColumn: 2, gridRow: 3 }}>
            <Arrow dir="down" />
          </HoldButton>
        </div>
      ) : (
        <div style={{ position: "fixed", left: inset.left, bottom: inset.bottom, zIndex: 5, display: "flex", gap: 12 }}>
          <HoldButton label="Virar para a esquerda" onChange={bind("left")}>
            <Arrow dir="left" />
          </HoldButton>
          <HoldButton label="Virar para a direita" onChange={bind("right")}>
            <Arrow dir="right" />
          </HoldButton>
        </div>
      )}
      {/* Direita: acelerar e frear. */}
      <div style={{ position: "fixed", right: inset.right, bottom: inset.bottom, zIndex: 5, display: "flex", flexDirection: "column", gap: 12 }}>
        <HoldButton label="Acelerar" onChange={bind("accel")} accent>
          Acelerar
        </HoldButton>
        <HoldButton label="Frear" onChange={bind("brake")}>
          Frear
        </HoldButton>
      </div>
    </>
  );
}
