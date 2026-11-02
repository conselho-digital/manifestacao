import type { GameMap } from "../game/Game.js";

const MAP_KEY = "manifestacao.map";

/** Mapa inicial: `?mapa=arena` na URL vence; senão o último escolhido neste aparelho. */
export function loadMap(): GameMap {
  try {
    const q = new URLSearchParams(window.location.search).get("mapa");
    if (q === "arena" || q === "avenida") return q;
    const saved = localStorage.getItem(MAP_KEY);
    if (saved === "arena" || saved === "avenida") return saved;
  } catch {
    /* sem acesso à URL/armazenamento: padrão */
  }
  return "avenida";
}

export function saveMap(m: GameMap): void {
  try {
    localStorage.setItem(MAP_KEY, m);
  } catch {
    /* modo privado: vale só nesta sessão */
  }
}

const OPTIONS: { id: GameMap; label: string; hint: string }[] = [
  { id: "avenida", label: "Avenida", hint: "Passeio" },
  { id: "arena", label: "Arena PvP", hint: "Combate" },
];

/** Escolha do mapa na tela de entrada (a avenida é o passeio; a arena é o combate). */
export function MapSwitch({ value, onChange }: { value: GameMap; onChange: (m: GameMap) => void }) {
  return (
    <div>
      <div id="map-label" style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)", fontWeight: 700 }}>
        Mapa
      </div>
      <div
        role="radiogroup"
        aria-labelledby="map-label"
        style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: "var(--r-md)", background: "var(--surface-2)" }}
      >
        {OPTIONS.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  onChange(OPTIONS.find((x) => x.id !== value)!.id);
                }
              }}
              style={{
                minHeight: 52,
                padding: "6px 10px",
                borderRadius: "var(--r-sm)",
                border: "none",
                background: on ? "var(--accent)" : "transparent",
                color: on ? "var(--on-accent)" : "var(--ink)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: "var(--t-body)", fontWeight: 800 }}>{o.label}</span>
              <span style={{ fontSize: "var(--t-ui)", fontWeight: 600, color: on ? "var(--on-accent)" : "var(--ink-dim)" }}>{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
