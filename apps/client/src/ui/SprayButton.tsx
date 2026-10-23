import { useState } from "react";

interface SprayButtonProps {
  charges: number;
  maxCharges: number;
  onSpray: () => void;
  /** Bandeira da equipe enviada no admin; sem ela, o retângulo da imagem leva a cor da equipe. */
  imageUrl: string | null;
  /** Cor da equipe (CSS). */
  color: string;
}

/**
 * Botão de spray: um retângulo escrito "Spray" (com quantas pixações restam hoje) e outro mostrando a imagem que será
 * pintada (a bandeira da equipe, ou a cor dela). Vive no TopRightPanel, fora da metade inferior da tela (toda área de
 * toque do joystick). O limite é diário (ver game/useDailySprays.ts).
 */
export function SprayButton({ charges, maxCharges, onSpray, imageUrl, color }: SprayButtonProps) {
  const empty = charges <= 0;
  const [pressed, setPressed] = useState(false);
  const edge = empty ? "var(--line)" : "var(--accent)";

  return (
    <button
      type="button"
      onClick={onSpray}
      disabled={empty}
      aria-label={empty ? "Acabaram os sprays de hoje" : `Usar spray, ${charges} de ${maxCharges} hoje`}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: "flex",
        gap: 6,
        padding: 0,
        border: "none",
        background: "transparent",
        color: "var(--ink)",
        cursor: empty ? "default" : "pointer",
        opacity: empty ? 0.55 : 1,
        transform: pressed && !empty ? "scale(0.96)" : "scale(1)",
        transition: "transform .08s, opacity .12s",
        touchAction: "manipulation",
      }}
    >
      <span
        style={{
          minWidth: 92,
          minHeight: 44,
          padding: "4px 12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--r-sm)",
          border: `1px solid ${edge}`,
          background: "var(--scrim)",
          fontSize: "var(--t-ui)",
          fontWeight: 800,
          lineHeight: 1.15,
        }}
      >
        Spray
        <span style={{ color: "var(--ink-dim)", fontWeight: 600 }}>
          {charges}/{maxCharges}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 64,
          minHeight: 44,
          borderRadius: "var(--r-sm)",
          border: `1px solid ${edge}`,
          background: imageUrl ? `center / cover no-repeat url("${imageUrl}"), ${color}` : color,
        }}
      />
    </button>
  );
}
