/**
 * Agrupa os controles do canto superior direito (Loja, Veículo) num único
 * contêiner posicionado, fora da área de toque do joystick (que ocupa a
 * metade inferior da tela). Evita que botões soltos com position:fixed
 * disputem o mesmo canto e se sobreponham.
 */
export function TopRightPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        right: "calc(env(safe-area-inset-right, 0px) + 10px)",
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
        // Em celular deitado a coluna não desce até o botão Correr.
        maxHeight: "calc(100dvh - 140px)",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}
