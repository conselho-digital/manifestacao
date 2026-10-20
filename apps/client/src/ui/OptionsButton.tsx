interface OptionsButtonProps {
  onClick: () => void;
}

/**
 * Botão "Opções" (perfil). Sem posicionamento próprio — fica no TopRightPanel,
 * ao lado do botão da Loja. Estilo neutro: só a Loja usa o destaque da marca.
 */
export function OptionsButton({ onClick }: OptionsButtonProps) {
  return (
    <button
      type="button"
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
      Opções
    </button>
  );
}
