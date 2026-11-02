/** Botão "Entrar" (perto do veículo estacionado) / "Sair" (dirigindo, parado). Também pela tecla V. */
export function VehicleButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        minHeight: 44,
        padding: "0 16px",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--accent)",
        background: "var(--accent)",
        color: "var(--on-accent)",
        fontSize: "var(--t-ui)",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>(V)</span>
    </button>
  );
}
