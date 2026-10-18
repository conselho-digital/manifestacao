interface SprayButtonProps {
  charges: number;
  maxCharges: number;
  onSpray: () => void;
}

/**
 * Botão de spray (canto inferior, ao lado da loja). Mostra a carga restante
 * do cartucho; sem carga, fica desabilitado até recarregar (ver game/spray.ts).
 */
export function SprayButton({ charges, maxCharges, onSpray }: SprayButtonProps) {
  const empty = charges <= 0;
  return (
    <button
      type="button"
      onClick={onSpray}
      disabled={empty}
      aria-label={empty ? "Spray sem tinta — aguarde recarregar" : "Usar spray"}
      style={{
        position: "fixed",
        right: "calc(env(safe-area-inset-right, 0px) + 10px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 66px)",
        zIndex: 6,
        minHeight: 44,
        minWidth: 44,
        padding: "8px 16px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-lg)",
        border: `1px solid ${empty ? "var(--line)" : "var(--accent)"}`,
        background: empty ? "var(--scrim)" : "var(--surface)",
        color: empty ? "var(--ink-dim)" : "var(--ink)",
        cursor: empty ? "default" : "pointer",
      }}
    >
      Spray · {charges}/{maxCharges}
    </button>
  );
}
