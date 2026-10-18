import { useState } from "react";
import {
  VEHICLES,
  VEHICLE_IDS,
  hasVehicleViaPremium,
  vehicleRequiresEntitlement,
  type VehicleId,
} from "@manifestacao/shared";

interface VehiclePickerProps {
  value: VehicleId;
  onChange: (v: VehicleId) => void;
  /** Itens que o usuário possui (ids "vehicle:x" / "pass:premium"). */
  owned: ReadonlySet<string>;
  /** Chamado ao clicar num veículo bloqueado (abre a loja). */
  onLocked: (vehicle: VehicleId) => void;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Seletor de veículo. Sem posicionamento próprio — fica dentro do
 * TopRightPanel (junto do StoreButton). Veículos com preço (carro de som)
 * exigem posse (entitlement direto ou via passe Premium); sem posse, o
 * clique abre a loja em vez de selecionar. O estado travado é comunicado só
 * por cor/opacidade (sem ícones/emoji, fora do sistema de tokens do app).
 */
export function VehiclePicker({ value, onChange, owned, onLocked }: VehiclePickerProps) {
  const [pressed, setPressed] = useState<VehicleId | null>(null);

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
        const label = unlocked
          ? VEHICLES[id].label
          : `${VEHICLES[id].label} · ${formatBRL(VEHICLES[id].priceCents)}`;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            aria-label={unlocked ? undefined : `${VEHICLES[id].label} — bloqueado, toque para comprar na loja`}
            onClick={() => (unlocked ? onChange(id) : onLocked(id))}
            onPointerDown={() => setPressed(id)}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed((p) => (p === id ? null : p))}
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
              opacity: unlocked ? 1 : 0.85,
              cursor: "pointer",
              transform: pressed === id ? "scale(0.96)" : "scale(1)",
              transition: "transform .08s, background .12s, opacity .12s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
