interface StoreButtonProps {
  onClick: () => void;
}

/** Botão fixo para abrir a loja (canto inferior direito). */
export function StoreButton({ onClick }: StoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir loja"
      style={{
        position: "fixed",
        right: "calc(env(safe-area-inset-right, 0px) + 10px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        zIndex: 6,
        minHeight: 48,
        minWidth: 48,
        padding: "10px 18px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--accent)",
        background: "var(--accent)",
        color: "var(--on-accent)",
        cursor: "pointer",
      }}
    >
      Loja
    </button>
  );
}
