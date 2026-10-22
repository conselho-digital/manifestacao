/** Botão "i" que abre/fecha uma explicação curta no topo de um modal. */
export function InfoButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: `2px solid ${open ? "var(--accent)" : "var(--line)"}`,
        background: open ? "var(--accent)" : "transparent",
        color: open ? "var(--on-accent)" : "var(--ink)",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontStyle: "italic",
        fontWeight: 700,
        fontSize: 20,
        cursor: "pointer",
        flex: "none",
      }}
    >
      i
    </button>
  );
}

/** Caixa de explicação: o que é e onde aparece. */
export function InfoPanel({ what, where }: { what: string; where: string }) {
  return (
    <div
      role="note"
      style={{
        background: "var(--surface-2)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "var(--r-sm)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: "var(--t-ui)",
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>O que é:</strong> {what}
      </p>
      <p style={{ margin: 0 }}>
        <strong>Onde aparece:</strong> {where}
      </p>
    </div>
  );
}
