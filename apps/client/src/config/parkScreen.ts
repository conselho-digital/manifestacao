import { useSyncExternalStore } from "react";

/**
 * Outdoor do parque: um telão gigante que mostra um link (vídeo do YouTube ou página da internet) definido pelo
 * operador no painel de admin (aba Outdoor). Fica em game_config.screen = { url, title }.
 */

export const SCREEN_TITLE_MAX = 60;
const URL_MAX = 500;

export interface ScreenConfig {
  url: string;
  title: string;
}

export type ScreenMedia = { kind: "youtube"; id: string } | { kind: "page" };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Reconhece links do YouTube (watch, youtu.be, shorts, live, embed) e devolve o id do vídeo. */
export function parseScreenMedia(url: string): ScreenMedia {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
        id = m ? m[1]! : null;
      }
    }
    if (id && YT_ID.test(id)) return { kind: "youtube", id };
  } catch {
    /* link inválido: tratado como página */
  }
  return { kind: "page" };
}

/** Valida o que vem do banco ou do formulário: só https, sem usuário/senha, tamanhos limitados. */
export function cleanScreen(v: unknown): ScreenConfig | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || o.url.length === 0 || o.url.length > URL_MAX) return null;
  let u: URL;
  try {
    u = new URL(o.url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const title = typeof o.title === "string" ? o.title.replace(/[\p{Cf}\p{Cc}]/gu, "").trim().slice(0, SCREEN_TITLE_MAX) : "";
  return { url: u.href, title };
}

export function embedUrl(media: ScreenMedia, url: string): string {
  return media.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${media.id}?autoplay=1&rel=0&playsinline=1` : url;
}

export function thumbnailUrl(media: ScreenMedia): string | null {
  return media.kind === "youtube" ? `https://i.ytimg.com/vi/${media.id}/hqdefault.jpg` : null;
}

// ── Estado compartilhado (config + modal aberto), lido pela cena 3D e pela interface ──
type Listener = () => void;
const listeners = new Set<Listener>();
let screen: ScreenConfig | null = null;
let open = false;

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setParkScreen(next: ScreenConfig | null): void {
  screen = next;
  if (!next) open = false;
  emit();
}
export function currentParkScreen(): ScreenConfig | null {
  return screen;
}
export function openParkScreen(): void {
  if (!screen) return;
  open = true;
  emit();
}
export function closeParkScreen(): void {
  open = false;
  emit();
}
export function useParkScreen(): ScreenConfig | null {
  return useSyncExternalStore(subscribe, () => screen);
}
export function useParkScreenOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open);
}
