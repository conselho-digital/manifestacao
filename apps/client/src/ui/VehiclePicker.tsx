import { useEffect, useRef, useState } from "react";
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
  /** true enquanto a posse ainda não terminou de carregar: não mostra
   * cadeado nem preço (pode ser falso-positivo), só desabilita a troca. */
  loading: boolean;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Seletor de veículo em dropdown: um botão principal mostra o veículo atual e abre a lista de opções.
 * Sem posicionamento próprio — fica dentro do
 * TopRightPanel (junto do StoreButton). Veículos com preço (carro de som)
 * exigem posse (entitlement direto ou via passe Premium); sem posse, o
 * clique abre a loja em vez de selecionar. O estado travado é comunicado só
 * por cor/opacidade (sem ícones/emoji, fora do sistema de tokens do app).
 */
export function VehiclePicker({ value, onChange, owned, onLocked, loading }: VehiclePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // A lista é `fixed` (o painel do canto tem rolagem e cortaria uma lista absoluta).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  // Fecha ao tocar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const optionBtn: React.CSSProperties = {
    minHeight: 44,
    width: "100%",
    padding: "8px 12px",
    fontSize: "var(--t-ui)",
    fontWeight: 700,
    textAlign: "left",
    borderRadius: "var(--r-sm)",
    border: "1px solid transparent",
    cursor: "pointer",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button
        type="button"
        ref={btnRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Veículo: ${VEHICLES[value].label}. Toque para trocar`}
        disabled={loading}
        onClick={toggle}
        style={{
          minHeight: 44,
          minWidth: 148,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          fontSize: "var(--t-ui)",
          fontWeight: 700,
          borderRadius: "var(--r-sm)",
          border: `1px solid ${value === "nenhum" ? "var(--line)" : "var(--accent)"}`,
          background: "var(--scrim)",
          color: "var(--ink)",
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "default" : "pointer",
        }}
      >
        <span>
          <span style={{ color: "var(--ink-dim)", fontWeight: 400 }}>Veículo: </span>
          {VEHICLES[value].label}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && pos && (
        <div
          role="listbox"
          aria-label="Veículo"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            minWidth: 220,
            maxHeight: `calc(100dvh - ${pos.top + 16}px)`,
            overflowY: "auto",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
            zIndex: 9,
          }}
        >
          {VEHICLE_IDS.map((id) => {
            const selected = id === value;
            const needsEntitlement = vehicleRequiresEntitlement(id);
            const unlocked = loading || !needsEntitlement || owned.has(`vehicle:${id}`) || hasVehicleViaPremium(id, owned);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={!loading && !unlocked ? `${VEHICLES[id].label} — bloqueado, toque para comprar na loja` : undefined}
                onClick={() => {
                  setOpen(false);
                  if (unlocked) onChange(id);
                  else onLocked(id);
                }}
                style={{
                  ...optionBtn,
                  background: selected ? "var(--accent)" : "var(--surface-2)",
                  color: selected ? "var(--on-accent)" : unlocked ? "var(--ink)" : "var(--ink-dim)",
                }}
              >
                {VEHICLES[id].label}
                {!loading && !unlocked && ` · ${formatBRL(VEHICLES[id].priceCents)}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
