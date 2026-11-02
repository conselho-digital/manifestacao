/**
 * Botão "Bater": golpe com a bandeira (0,7 s) ou, sem bandeira, soco (0,5 s). Só a pé. Atalho no PC: F.
 * No toque (`fab`) é o botão de ação principal do polegar direito, ao lado de Correr e Pular.
 */
export function HitButton({ onHit, busy, fab = false }: { onHit: () => void; busy: boolean; fab?: boolean }) {
  const base: React.CSSProperties = {
    color: "var(--ink)",
    fontSize: "var(--t-ui)",
    fontWeight: 800,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
    touchAction: "manipulation",
    userSelect: "none",
  };
  return (
    <button
      type="button"
      onClick={onHit}
      onPointerDown={fab ? (e) => e.stopPropagation() : undefined}
      disabled={busy}
      aria-label="Bater (tecla F)"
      style={
        fab
          ? {
              ...base,
              position: "fixed",
              right: "calc(env(safe-area-inset-right, 0px) + 92px)",
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
              zIndex: 5,
              width: 64,
              height: 64,
              borderRadius: "50%",
              border: "2px solid var(--accent)",
              background: "var(--scrim)",
              color: "var(--accent)",
            }
          : { ...base, minWidth: 92, minHeight: 44, padding: "4px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "var(--scrim)" }
      }
    >
      Bater
    </button>
  );
}
