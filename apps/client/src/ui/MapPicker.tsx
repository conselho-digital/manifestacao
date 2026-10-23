import { useState } from "react";
import { MAPS, MAP_IDS, type MapId } from "@manifestacao/shared";
import { useModal } from "./useModal.js";

interface MapPickerProps {
  value: MapId;
  onChange: (m: MapId) => void;
}

/** Botão "Mapa: …" que abre a lista de mapas disponíveis. Usado na entrada e nas opções. */
export function MapPicker({ value, onChange }: MapPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          width: "100%",
          minHeight: 48,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          borderRadius: "var(--r-md)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: "var(--t-body)",
          cursor: "pointer",
        }}
      >
        <span>
          <span style={{ color: "var(--ink-dim)" }}>Mapa: </span>
          <strong>{MAPS[value].label}</strong>
        </span>
        <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "var(--t-ui)" }}>Ver mapas</span>
      </button>
      {open && (
        <MapListModal
          value={value}
          onPick={(m) => {
            onChange(m);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MapListModal({ value, onPick, onClose }: { value: MapId; onPick: (m: MapId) => void; onClose: () => void }) {
  const ref = useModal<HTMLDivElement>(onClose);
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="maps-title"
        tabIndex={-1}
        style={{
          width: "min(460px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          outline: "none",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 id="maps-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 400, textTransform: "uppercase" }}>
            Mapas
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 44, padding: "6px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}
          >
            Fechar
          </button>
        </div>
        <p style={{ margin: 0, color: "var(--ink-dim)", fontSize: "var(--t-ui)" }}>
          Cada mapa tem os seus jogadores: quem está em um não aparece no outro.
        </p>
        {MAP_IDS.map((id) => {
          const selected = id === value;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(id)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                border: `2px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                background: selected ? "var(--surface-2)" : "var(--surface)",
                color: "var(--ink)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <strong style={{ fontSize: "var(--t-body)" }}>
                {MAPS[id].label}
                {selected && <span style={{ color: "var(--accent)", marginLeft: 8, fontSize: "var(--t-ui)" }}>selecionado</span>}
              </strong>
              <span style={{ color: "var(--ink-dim)", fontSize: "var(--t-ui)" }}>{MAPS[id].description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
