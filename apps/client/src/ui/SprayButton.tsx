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
 * Botão de spray: um só retângulo, com a imagem que será pintada (a bandeira da equipe, ou a cor dela) no fundo e, na
 * frente, quantas pixações restam hoje. Vive no TopRightPanel, fora da metade inferior da tela (toda área de
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
        minWidth: 92,
        minHeight: 44,
        padding: "4px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--r-sm)",
        border: `1px solid ${edge}`,
        background: imageUrl ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), center / cover no-repeat url("${imageUrl}"), ${color}` : color,
        color: "#fff",
        textShadow: "0 1px 3px rgba(0,0,0,.9)",
        fontSize: "var(--t-ui)",
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        cursor: empty ? "default" : "pointer",
        opacity: empty ? 0.55 : 1,
        transform: pressed && !empty ? "scale(0.96)" : "scale(1)",
        transition: "transform .08s, opacity .12s",
        touchAction: "manipulation",
      }}
    >
      {charges}/{maxCharges}
    </button>
  );
}
