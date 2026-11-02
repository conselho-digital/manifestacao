/**
 * Agrupa os controles do canto superior direito (Loja, Veículo) num único
 * contêiner posicionado, fora da área de toque do joystick (que ocupa a
 * metade inferior da tela). Evita que botões soltos com position:fixed
 * disputem o mesmo canto e se sobreponham.
 */
export function TopRightPanel({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        right: "calc(env(safe-area-inset-right, 0px) + 10px)",
        zIndex: 6,
        display: "flex",
        // Celular deitado: duas fileiras curtas no topo (nada desce até os botões do polegar); senão, uma coluna.
        flexDirection: compact ? "row" : "column",
        flexWrap: compact ? "wrap" : "nowrap",
        justifyContent: compact ? "flex-end" : undefined,
        alignItems: compact ? "center" : "flex-end",
        gap: compact ? 8 : 10,
        maxWidth: compact ? "min(420px, 58vw)" : undefined,
        maxHeight: compact ? "108px" : "calc(100dvh - 140px)",
        overflowY: compact ? "visible" : "auto",
      }}
    >
      {children}
    </div>
  );
}
