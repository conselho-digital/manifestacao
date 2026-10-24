/** Botão "Bater": golpe com a bandeira (0,7 s) ou, sem bandeira, soco (0,5 s). Só a pé. Atalho no PC: F. */
export function HitButton({ onHit, busy }: { onHit: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onHit}
      disabled={busy}
      aria-label="Bater (tecla F)"
      style={{
        minWidth: 92,
        minHeight: 44,
        padding: "4px 12px",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--line)",
        background: "var(--scrim)",
        color: "var(--ink)",
        fontSize: "var(--t-ui)",
        fontWeight: 800,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        touchAction: "manipulation",
      }}
    >
      Bater
    </button>
  );
}
