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

const OPTIONS: { id: GameMap; label: string }[] = [
  { id: "avenida", label: "Avenida" },
  { id: "arena", label: "Arena PvP" },
];

/** Escolha do mapa na tela de entrada (a avenida é o passeio; a arena é o combate). */
export function MapSwitch({ value, onChange }: { value: GameMap; onChange: (m: GameMap) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Mapa"
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        gap: 4,
        padding: 4,
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--line)",
        background: "var(--scrim)",
      }}
    >
      {OPTIONS.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            style={{
              minHeight: 44,
              padding: "0 16px",
              borderRadius: "var(--r-sm)",
              border: `1px solid ${on ? "var(--accent)" : "transparent"}`,
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--accent)" : "var(--ink)",
              fontSize: "var(--t-ui)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
