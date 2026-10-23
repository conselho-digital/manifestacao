import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { LegalPage, legalKindFromPath } from "./ui/LegalPage.js";
import { AppErrorBoundary } from "./ui/AppErrorBoundary.js";
import "./ui/installPrompt.js";

const root = document.getElementById("root");
if (!root) throw new Error("elemento #root não encontrado");

const legal = legalKindFromPath(window.location.pathname);

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>{legal ? <LegalPage kind={legal} /> : <App />}</AppErrorBoundary>
  </StrictMode>,
);

// PWA: registra o service worker só em produção (em desenvolvimento atrapalha o hot reload).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sem service worker o jogo segue normal */
    });
  });
}
