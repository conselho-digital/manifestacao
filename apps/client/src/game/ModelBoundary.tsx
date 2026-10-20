import { Component, type ReactNode } from "react";

/**
 * Isola falhas de carregamento de modelo 3D (404, arquivo corrompido, rede):
 * sem isto, um .glb ruim derrubava a cena inteira (tela branca). Mostra o
 * `fallback` no lugar. Use `key={url}` pra tentar de novo se a URL mudar.
 */
export class ModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn("[modelo 3D] falha ao carregar, usando o padrão:", error);
  }
  override render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
