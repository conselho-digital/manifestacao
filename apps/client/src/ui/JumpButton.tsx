/** Botão de pular (celular, arena): um toque pede um pulo; o Player consome o pedido no próximo quadro. */
export function JumpButton({ jumpRef }: { jumpRef: { current: boolean } }) {
  return (
    <button
      type="button"
      aria-label="Pular"
      onPointerDown={(e) => {
        e.stopPropagation();
        jumpRef.current = true;
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        right: "calc(env(safe-area-inset-right, 0px) + 20px)",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)",
        zIndex: 5,
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: "1px solid var(--line)",
        background: "var(--scrim)",
        color: "var(--ink)",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      Pular
    </button>
  );
}
