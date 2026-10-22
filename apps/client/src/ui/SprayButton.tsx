import { useState } from "react";

interface SprayButtonProps {
  charges: number;
  maxCharges: number;
  onSpray: () => void;
  /** Bandeira da equipe enviada no admin; sem ela, o botão leva a cor da equipe. */
  imageUrl: string | null;
  /** Cor da equipe (CSS). */
  color: string;
}

/**
 * Botão de spray: mostra a bandeira da equipe (ou a cor dela) e quantas pixações restam hoje. Vive no TopRightPanel,
 * fora da metade inferior da tela (toda área de toque do joystick). O limite é diário (ver game/useDailySprays.ts).
 */
export function SprayButton({ charges, maxCharges, onSpray, imageUrl, color }: SprayButtonProps) {
  const empty = charges <= 0;
  const [pressed, setPressed] = useState(false);

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
        position: "relative",
        width: "var(--spray-size, 64px)",
        height: "var(--spray-size, 64px)",
        padding: 0,
        overflow: "hidden",
        borderRadius: "50%",
        border: `2px solid ${empty ? "var(--line)" : "var(--accent)"}`,
        background: imageUrl ? `center / cover no-repeat url("${imageUrl}"), ${color}` : color,
        opacity: empty ? 0.5 : 1,
        cursor: empty ? "default" : "pointer",
        transform: pressed && !empty ? "scale(0.94)" : "scale(1)",
        transition: "transform .08s, opacity .12s",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "2px 0",
          background: "rgba(21, 24, 29, 0.78)",
          color: "var(--ink)",
          fontSize: "var(--t-ui)",
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        {charges}/{maxCharges}
      </span>
    </button>
  );
}
