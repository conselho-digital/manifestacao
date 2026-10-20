interface SuperchatButtonProps {
  onClick: () => void;
}

/** Abre o envio de superchat. Fica no TopRightPanel, abaixo de Chat/Opções/Loja. */
export function SuperchatButton({ onClick }: SuperchatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: "10px 18px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--accent)",
        background: "var(--scrim)",
        color: "var(--accent)",
        cursor: "pointer",
      }}
    >
      Superchat
    </button>
  );
}
