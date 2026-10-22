import { Component, type ReactNode } from "react";

/**
 * Última rede de proteção: se algo no app lançar um erro de renderização, em vez de a tela inteira virar um fundo
 * cinza vazio, mostra uma mensagem com o motivo e um botão para recarregar.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error("[app] erro de renderização:", error);
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 24,
          textAlign: "center",
          background: "var(--bg)",
          color: "var(--ink)",
        }}
      >
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, textTransform: "uppercase", fontSize: 30 }}>
          Algo deu errado
        </h1>
        <p style={{ margin: 0, maxWidth: 360, color: "var(--ink-dim)", fontSize: "var(--t-body)" }}>
          O jogo travou. Recarregue para voltar à avenida.
        </p>
        <code style={{ maxWidth: 360, overflowWrap: "anywhere", color: "var(--ink-dim)", fontSize: "var(--t-ui)" }}>
          {error.message.slice(0, 200)}
        </code>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            minHeight: 48,
            padding: "0 24px",
            borderRadius: "var(--r-lg)",
            border: "none",
            background: "var(--accent)",
            color: "var(--on-accent)",
            fontSize: "var(--t-body)",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Recarregar
        </button>
      </main>
    );
  }
}
