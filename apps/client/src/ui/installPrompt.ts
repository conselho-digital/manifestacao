import { useSyncExternalStore } from "react";

/**
 * Instalar o jogo como atalho (PWA). O Chrome/Brave/Edge no Android avisam UMA vez, cedo, por `beforeinstallprompt`:
 * guardamos o evento aqui (importado em main.tsx) para o botão da página inicial usar quando a pessoa tocar.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

/** Celular ou tablet (toque como ponteiro principal, iOS ou Android). No computador o atalho não é oferecido. */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (isIos() || /Android/i.test(navigator.userAgent)) return true;
  return window.matchMedia?.("(pointer: coarse)").matches === true && navigator.maxTouchPoints > 0;
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Abre o aviso nativo de instalação. Devolve true se a pessoa aceitou. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null;
  emit();
  try {
    await ev.prompt();
    return (await ev.userChoice).outcome === "accepted";
  } catch {
    return false;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Estado do botão: já instalado, instalável agora (aviso nativo), ou só instruções (iOS/outros). */
export function useInstallState(): "installed" | "native" | "manual" {
  const can = useSyncExternalStore(subscribe, () => deferred !== null);
  const done = useSyncExternalStore(subscribe, () => installed);
  if (done || isStandalone()) return "installed";
  return can ? "native" : "manual";
}
