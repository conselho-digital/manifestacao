import { VEHICLES, VEHICLE_IDS, hasVehicleViaPremium, vehicleRequiresEntitlement, type VehicleId } from "@manifestacao/shared";

interface VehiclePickerProps {
  value: VehicleId;
  onChange: (v: VehicleId) => void;
  /** Itens que o usuário possui (ids "vehicle:x" / "pass:premium"). */
  owned: ReadonlySet<string>;
  /** Chamado ao clicar num veículo bloqueado (abre a loja). */
  onLocked: (vehicle: VehicleId) => void;
}

/**
 * Seletor de veículo. Sem posicionamento próprio — fica dentro do
 * TopRightPanel (junto do StoreButton). Veículos com preço (carro de som)
 * exigem posse (entitlement direto ou via passe Premium); sem posse, o
 * clique abre a loja em vez de selecionar.
 */
export function VehiclePicker({ value, onChange, owned, onLocked }: VehiclePickerProps) {
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
        const needsEntitlement = vehicleRequiresEntitlement(id);
        const unlocked = !needsEntitlement || owned.has(`vehicle:${id}`) || hasVehicleViaPremium(id, owned);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => (unlocked ? onChange(id) : onLocked(id))}
            style={{
              minHeight: 44,
              minWidth: 112,
              padding: "8px 12px",
              fontSize: "var(--t-ui)",
              fontWeight: 700,
              borderRadius: "var(--r-sm)",
              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
              background: selected ? "var(--accent)" : "var(--scrim)",
              color: selected ? "var(--on-accent)" : unlocked ? "var(--ink)" : "var(--ink-dim)",
              cursor: "pointer",
              transition: "transform .08s, background .12s",
            }}
          >
            {VEHICLES[id].label}
            {!unlocked && " 🔒"}
          </button>
        );
      })}
    </div>
  );
}
