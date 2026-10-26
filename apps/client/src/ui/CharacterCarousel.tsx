import { useEffect, useRef, useState } from "react";
import type { CharacterId } from "@manifestacao/shared";

/** Celular em pé: a seleção de personagem vira carrossel (arrastar para o lado). */
export function useNarrow(): boolean {
  const query = "(max-width: 600px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export const CAROUSEL_CARD_W = 176;
const CAROUSEL_GAP = 12;

/**
 * Carrossel horizontal de personagens: o dedo arrasta e o cartão que para no centro vira o escolhido. Tocar em um
 * cartão também o escolhe e o leva ao centro. Os pontinhos mostram quantos há e qual está selecionado.
 */
export function CharacterCarousel({
  ids,
  selected,
  onSelect,
  renderCard,
}: {
  ids: readonly CharacterId[];
  selected: CharacterId | null;
  onSelect: (id: CharacterId) => void;
  renderCard: (id: CharacterId) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = selected !== null && ids.includes(selected); // o escolhido está nesta fileira?
  const index = selected === null ? 0 : Math.max(0, ids.indexOf(selected));
  const step = CAROUSEL_CARD_W + CAROUSEL_GAP;

  // Começa (e volta, ao tocar) com o escolhido no centro.
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    if (Math.abs(el.scrollLeft - index * step) > 2) el.scrollTo({ left: index * step, behavior: "smooth" });
  }, [index, step, active]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(ids.length - 1, Math.round(el.scrollLeft / step)));
      const id = ids[i];
      if (id && id !== selected) onSelect(id);
    }, 90);
  };

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        role="group"
        aria-label="Personagens (arraste para o lado)"
        style={{
          display: "flex",
          gap: CAROUSEL_GAP,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          padding: `4px calc(50% - ${CAROUSEL_CARD_W / 2}px)`,
          margin: "0 -4px",
        }}
      >
        {ids.map((id) => (
          <div key={id} style={{ display: "flex", flex: `0 0 ${CAROUSEL_CARD_W}px`, scrollSnapAlign: "center" }}>
            <div style={{ display: "flex", flex: 1 }}>{renderCard(id)}</div>
          </div>
        ))}
      </div>
      {ids.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }} aria-hidden="true">
          {ids.map((id) => (
            <span
              key={id}
              style={{ width: 8, height: 8, borderRadius: "50%", background: active && id === selected ? "var(--accent)" : "var(--line)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
