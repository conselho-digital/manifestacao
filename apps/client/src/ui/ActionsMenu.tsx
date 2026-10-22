import { useEffect, useRef, useState } from "react";
import {
  VEHICLES,
  VEHICLE_IDS,
  hasVehicleViaPremium,
  vehicleRequiresEntitlement,
  type VehicleId,
} from "@manifestacao/shared";

interface ActionsMenuProps {
  /** Conta logada: só ela divulga (telões, cartaz, superchat). */
  signedIn: boolean;
  onBillboards: () => void;
  onSign: () => void;
  onSuperchat: () => void;
  vehicle: VehicleId;
  onVehicle: (v: VehicleId) => void;
  /** Itens que o usuário possui (ids "vehicle:x" / "pass:premium"). */
  owned: ReadonlySet<string>;
  /** Chamado ao escolher um veículo bloqueado (abre a loja). */
  onLocked: (vehicle: VehicleId) => void;
  /** Posse ainda carregando: não mostra cadeado nem preço (pode ser falso-positivo). */
  loading: boolean;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Menu do jogo: um único botão com quatro pontos que abre "Divulgar" (Telões, Cartaz, Superchat) e "Veículo".
 * A lista é `fixed` porque o painel do canto tem rolagem e cortaria uma lista absoluta.
 */
export function ActionsMenu({ signedIn, onBillboards, onSign, onSuperchat, vehicle, onVehicle, owned, onLocked, loading }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Girar a tela com o menu aberto o deixaria fora do lugar (a posição é calculada ao abrir).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("orientationchange", close);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("orientationchange", close);
    };
  }, [open]);

  // Abriu: foco no primeiro item; setas ↑/↓, Home e End andam pela lista.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [open]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]!.focus();
  };

  const choose = (fn: () => void) => () => {
    setOpen(false);
    btnRef.current?.focus();
    fn();
  };

  const optionBtn: React.CSSProperties = {
    minHeight: 44,
    padding: "8px 14px",
    fontSize: "var(--t-ui)",
    fontWeight: 700,
    textAlign: "left",
    borderRadius: "var(--r-sm)",
    border: "1px solid transparent",
    background: "var(--surface-2)",
    color: "var(--ink)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const heading: React.CSSProperties = {
    margin: "4px 4px 0",
    fontSize: "var(--t-ui)",
    color: "var(--ink-dim)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  return (
    <div ref={rootRef} style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu: divulgar e veículos"
        onClick={toggle}
        style={{
          width: 48,
          height: 48,
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--r-sm)",
          border: `1px solid ${open || vehicle !== "nenhum" ? "var(--accent)" : "var(--line)"}`,
          background: "var(--scrim)",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        {/* Quatro pontos (2×2) */}
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <circle cx="7" cy="7" r="2.6" />
          <circle cx="17" cy="7" r="2.6" />
          <circle cx="7" cy="17" r="2.6" />
          <circle cx="17" cy="17" r="2.6" />
        </svg>
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          onKeyDown={onMenuKey}
          role="menu"
          aria-label="Menu"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            minWidth: 220,
            maxWidth: "calc(100vw - 16px)",
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
          {signedIn && (
            <>
              <p style={heading}>Divulgar</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" role="menuitem" onClick={choose(onBillboards)} style={{ ...optionBtn, flex: 1, textAlign: "center" }}>
                  Telões
                </button>
                <button type="button" role="menuitem" onClick={choose(onSign)} style={{ ...optionBtn, flex: 1, textAlign: "center" }}>
                  Cartaz
                </button>
                <button type="button" role="menuitem" onClick={choose(onSuperchat)} style={{ ...optionBtn, flex: 1, textAlign: "center" }}>
                  Superchat
                </button>
              </div>
            </>
          )}
          <p style={heading}>Veículo</p>
          {VEHICLE_IDS.map((id) => {
            const selected = id === vehicle;
            const needsEntitlement = vehicleRequiresEntitlement(id);
            const unlocked = loading || !needsEntitlement || owned.has(`vehicle:${id}`) || hasVehicleViaPremium(id, owned);
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={loading}
                aria-label={!loading && !unlocked ? `${VEHICLES[id].label}, ${formatBRL(VEHICLES[id].priceCents)}, bloqueado: abre a loja` : undefined}
                onClick={choose(() => (unlocked ? onVehicle(id) : onLocked(id)))}
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
