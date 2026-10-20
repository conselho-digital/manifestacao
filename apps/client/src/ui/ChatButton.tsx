interface ChatButtonProps {
  onClick: () => void;
}

/** Botão "Chat": abre/fecha a caixa de texto. Fica no TopRightPanel, ao lado de Opções. */
export function ChatButton({ onClick }: ChatButtonProps) {
  return (
    <button
      type="button"
      // Evita tirar o foco do campo (e fechar o chat no celular) antes do clique.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: "10px 18px",
        fontSize: "var(--t-ui)",
        fontWeight: 700,
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--line)",
        background: "var(--scrim)",
        color: "var(--ink)",
        cursor: "pointer",
      }}
    >
      Chat
    </button>
  );
}
