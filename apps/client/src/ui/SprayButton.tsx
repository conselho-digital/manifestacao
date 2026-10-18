import { useState } from "react";

interface SprayButtonProps {
  charges: number;
  maxCharges: number;
  onSpray: () => void;
}

/**
 * Botão de spray. Vive dentro do TopRightPanel (junto de Loja/Veículo) —
 * fora da metade inferior da tela, que é toda área de toque do Joystick.
 * Mostra a carga restante do cartucho; sem carga, fica desabilitado até
 * recarregar (ver game/spray.ts).
 */
export function SprayButton({ charges, maxCharges, onSpray }: SprayButtonProps) {
  const empty = charges <= 0;
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onSpray}
      disabled={empty}
      aria-label={empty ? "Spray sem tinta — aguarde recarregar" : "Usar spray"}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        minHeight: 44,
        minWidth: 112,
        padding: "8px 16px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-sm)",
        border: `1px solid ${empty ? "var(--line)" : "var(--accent)"}`,
        background: empty ? "var(--scrim)" : "var(--surface)",
        color: empty ? "var(--ink-dim)" : "var(--ink)",
        cursor: empty ? "default" : "pointer",
        transform: pressed && !empty ? "scale(0.96)" : "scale(1)",
        transition: "transform .08s, background .12s",
      }}
    >
      Spray · {charges}/{maxCharges}
    </button>
  );
}
