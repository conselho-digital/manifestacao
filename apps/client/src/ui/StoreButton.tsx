interface StoreButtonProps {
  onClick: () => void;
}

/**
 * Botão para abrir a loja. Sem posicionamento próprio — fica dentro do
 * TopRightPanel (junto do VehiclePicker), fora da área de toque do joystick.
 */
export function StoreButton({ onClick }: StoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir loja"
      style={{
        minHeight: 44,
        minWidth: 44,
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
