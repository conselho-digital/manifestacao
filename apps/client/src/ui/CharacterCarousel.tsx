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

/** Tela larga (computador): o seletor ocupa a largura toda e mostra várias opções de uma vez. */
export function useWide(): boolean {
  const query = "(min-width: 1100px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Altura (px) do boneco nos cartões da tela larga: acompanha a altura da janela, para tudo caber sem rolar. */
export function useCardBodyHeight(): number {
  const calc = () => {
    const h = window.innerHeight;
    return Math.max(130, Math.min(260, Math.round(0.2 * h + 0.25 * (h - 768))));
  };
  const [h, setH] = useState(calc);
  useEffect(() => {
    const on = () => setH(calc());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

/**
 * Carrossel de uma linha para o computador: mostra `visible` cartões de uma vez e tem setas para ver o resto (também
 * dá para arrastar com o dedo ou rolar). O cartão escolhido sempre é trazido para a vista.
 */
export function WideCarousel({
  ids,
  onSelect,
  selected,
  renderCard,
  visible = 4,
  gap = 12,
}: {
  ids: readonly CharacterId[];
  selected: CharacterId | null;
  onSelect?: (id: CharacterId) => void;
  renderCard: (id: CharacterId) => React.ReactNode;
  visible?: number;
  gap?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: ids.length <= visible });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  void onSelect;

  // Arrastar com o mouse (o dedo já rola sozinho): segura e puxa para o lado; ao soltar, encaixa no cartão mais próximo.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppress.current = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    if (d.moved) el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    if (d.moved) {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      setDragging(false);
      const item = el.children[0] as HTMLElement | undefined;
      const step = (item?.offsetWidth ?? 160) + gap;
      el.scrollTo({ left: Math.round(el.scrollLeft / step) * step, behavior: "smooth" });
    }
  };
  // O clique que termina um arrasto não escolhe o cartão onde o mouse foi solto.
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppress.current) {
      e.stopPropagation();
      e.preventDefault();
      suppress.current = false;
    }
  };
  const suppress = useRef(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(update, [ids.length]);

  // Traz o escolhido para a vista.
  useEffect(() => {
    const el = ref.current;
    if (!el || selected === null) return;
    const i = ids.indexOf(selected);
    const item = el.children[i] as HTMLElement | undefined;
    if (!item) return;
    if (item.offsetLeft < el.scrollLeft || item.offsetLeft + item.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: item.offsetLeft - el.offsetLeft, behavior: "smooth" });
    }
  }, [selected, ids]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const item = el.children[0] as HTMLElement | undefined;
    const step = (item?.offsetWidth ?? 160) + gap;
    el.scrollBy({ left: dir * step * Math.max(1, visible - 1), behavior: "smooth" });
  };

  const arrow = (dir: 1 | -1, disabled: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    [dir === 1 ? "right" : "left"]: -14,
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "1px solid var(--line)",
    background: "var(--surface-2)",
    color: "var(--ink)",
    fontSize: 20,
    lineHeight: 1,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.25 : 1,
    zIndex: 2,
  });

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <div
        ref={ref}
        onScroll={update}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          suppress.current = !!drag.current?.moved;
          endDrag(e);
        }}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        role="group"
        aria-label="Políticos (arraste ou use as setas para ver mais)"
        style={{
          display: "flex",
          gap,
          overflowX: "auto",
          // Durante o arrasto o encaixe automático sai do caminho; ao soltar, o scrollTo acima encaixa.
          scrollSnapType: dragging ? "none" : "x mandatory",
          scrollbarWidth: "none",
          padding: 2,
          cursor: dragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        {ids.map((id) => (
          <div key={id} style={{ display: "flex", flex: `0 0 calc((100% - ${(visible - 1) * gap}px) / ${visible})`, scrollSnapAlign: "start", minWidth: 0 }}>
            <div style={{ display: "flex", flex: 1, minWidth: 0 }}>{renderCard(id)}</div>
          </div>
        ))}
      </div>
      {ids.length > visible && (
        <>
          <button type="button" aria-label="Anteriores" disabled={edge.start} onClick={() => go(-1)} style={arrow(-1, edge.start)}>
            ‹
          </button>
          <button type="button" aria-label="Próximos" disabled={edge.end} onClick={() => go(1)} style={arrow(1, edge.end)}>
            ›
          </button>
        </>
      )}
    </div>
  );
}
