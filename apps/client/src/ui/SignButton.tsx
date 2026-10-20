interface SignButtonProps {
  onClick: () => void;
}

/** Abre a criação de cartaz. Fica no TopRightPanel, ao lado do Superchat. */
export function SignButton({ onClick }: SignButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 88,
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
      Cartaz
    </button>
  );
}
