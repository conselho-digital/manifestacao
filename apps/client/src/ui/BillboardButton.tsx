interface BillboardButtonProps {
  onClick: () => void;
}

/** Abre o leilão dos telões. Fica no TopRightPanel, junto de Cartaz e Superchat. */
export function BillboardButton({ onClick }: BillboardButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 0,
        padding: "8px 16px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--line)",
        background: "var(--scrim)",
        color: "var(--ink)",
        cursor: "pointer",
      }}
    >
      Telões
    </button>
  );
}
