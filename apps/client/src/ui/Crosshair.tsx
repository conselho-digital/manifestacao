/**
 * Mira do spray: só um ponto branco no centro da tela. A marca cai no ponto do
 * chão sob ele (ver aimRef em game/Player.tsx). Não captura toque/clique.
 */
export function Crosshair() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        width: 8,
        height: 8,
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        background: "#fff",
        // contorno fino escuro só pra o ponto não sumir em fundo claro
        boxShadow: "0 0 0 1.5px rgba(0,0,0,0.7), 0 0 4px rgba(0,0,0,0.5)",
        zIndex: 5,
        pointerEvents: "none",
      }}
    />
  );
}
