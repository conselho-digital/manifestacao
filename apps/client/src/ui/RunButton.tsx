import { useState } from "react";

interface RunButtonProps {
  /** true enquanto o botão está pressionado. */
  runRef: { current: boolean };
}

/**
 * Botão de correr: pressionar e segurar aumenta a velocidade (ver
 * RUN_MULTIPLIER em game/world.ts). Fica no canto inferior direito, dentro
 * da zona de olhar da câmera (CameraLook) mas com zIndex maior — o próprio
 * elemento intercepta o toque antes de chegar à zona de arrasto por trás.
 */
export function RunButton({ runRef }: RunButtonProps) {
  const [pressed, setPressed] = useState(false);

  const setRunning = (v: boolean) => {
    runRef.current = v;
    setPressed(v);
  };

  return (
    <button
      type="button"
      aria-label="Correr"
      onPointerDown={(e) => {
        e.stopPropagation();
        setRunning(true);
      }}
      onPointerUp={() => setRunning(false)}
      onPointerLeave={() => setRunning(false)}
      onPointerCancel={() => setRunning(false)}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        right: "calc(env(safe-area-inset-right, 0px) + 28px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
        zIndex: 5,
        minWidth: 72,
        minHeight: 72,
        borderRadius: "50%",
        border: `1px solid ${pressed ? "var(--accent)" : "var(--line)"}`,
        background: pressed ? "var(--accent)" : "var(--scrim)",
        color: pressed ? "var(--on-accent)" : "var(--ink)",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      Correr
    </button>
  );
}
