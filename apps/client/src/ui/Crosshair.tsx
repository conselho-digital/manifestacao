/**
 * Mira do spray, fixa no centro da tela: a marca cai no ponto do chão sob ela
 * (ver aimRef em game/Player.tsx). Não captura toque/clique.
 */
export function Crosshair() {
  return (
    <svg
      aria-hidden
      width={36}
      height={36}
      viewBox="0 0 36 36"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {/* contorno escuro por baixo pra ler bem em qualquer fundo */}
      <g stroke="rgba(0,0,0,0.6)" strokeWidth={4} strokeLinecap="round" fill="none">
        <circle cx={18} cy={18} r={9} />
        <path d="M18 2v7M18 27v7M2 18h7M27 18h7" />
      </g>
      <g stroke="#fff" strokeWidth={2} strokeLinecap="round" fill="none">
        <circle cx={18} cy={18} r={9} />
        <path d="M18 2v7M18 27v7M2 18h7M27 18h7" />
      </g>
      <circle cx={18} cy={18} r={1.5} fill="#fff" />
    </svg>
  );
}
