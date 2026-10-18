import { VEHICLES, VEHICLE_IDS, type VehicleId } from "@manifestacao/shared";

interface VehiclePickerProps {
  value: VehicleId;
  onChange: (v: VehicleId) => void;
}

/**
 * Seletor de veículo. Sem posicionamento próprio — fica dentro do
 * TopRightPanel (junto do StoreButton). Na Fase 2 todos estão liberados;
 * na Fase 3 itens pagos (carro de som) passam a exigir posse.
 */
export function VehiclePicker({ value, onChange }: VehiclePickerProps) {
  return (
    <div
      role="group"
      aria-label="Veículo"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: "var(--t-ui)",
          color: "var(--ink-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          paddingRight: 2,
        }}
      >
        Veículo
      </span>
      {VEHICLE_IDS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            style={{
              minHeight: 44,
              minWidth: 112,
              padding: "8px 12px",
              fontSize: "var(--t-ui)",
              fontWeight: 700,
              borderRadius: "var(--r-sm)",
              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
              background: selected ? "var(--accent)" : "var(--scrim)",
              color: selected ? "var(--on-accent)" : "var(--ink)",
              cursor: "pointer",
              transition: "transform .08s, background .12s",
            }}
          >
            {VEHICLES[id].label}
          </button>
        );
      })}
    </div>
  );
}
