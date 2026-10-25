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
  /** Opções do player do YouTube (ignoradas em páginas comuns). */
  autoplay: boolean;
  /** Mostra os controles do player (pausar, volume, tela cheia). */
  controls: boolean;
  /** Repete o vídeo ao terminar. */
  loop: boolean;
  /** Começa sem som (alguns celulares só tocam sozinhos assim). */
  mute: boolean;
  /** Transmissão ao vivo do YouTube: sem linha do tempo; toca no ponto atual da transmissão. */
  live: boolean;
}

export const DEFAULT_SCREEN_OPTIONS = { autoplay: true, controls: true, loop: false, mute: false, live: false } as const;

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
  const flag = (k: keyof typeof DEFAULT_SCREEN_OPTIONS) => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_SCREEN_OPTIONS[k]);
  return { url: u.href, title, autoplay: flag("autoplay"), controls: flag("controls"), loop: flag("loop"), mute: flag("mute"), live: flag("live") };
}

export function embedUrl(media: ScreenMedia, cfg: ScreenConfig, api = false): string {
  if (media.kind !== "youtube") return cfg.url;
  const p = new URLSearchParams({
    autoplay: cfg.autoplay ? "1" : "0",
    controls: cfg.controls ? "1" : "0",
    mute: cfg.mute ? "1" : "0",
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });
  if (api) {
    // Deixa o jogo comandar o player (tocar/pausar/pular em sincronia com o admin).
    p.set("enablejsapi", "1");
    p.set("origin", window.location.origin);
  }
  if (cfg.loop) {
    p.set("loop", "1");
    p.set("playlist", media.id); // o YouTube só repete com a lista do próprio vídeo
  }
  return `https://www.youtube-nocookie.com/embed/${media.id}?${p.toString()}`;
}

export function thumbnailUrl(media: ScreenMedia): string | null {
  return media.kind === "youtube" ? `https://i.ytimg.com/vi/${media.id}/hqdefault.jpg` : null;
}

// ── Reprodução sincronizada: o admin controla o vídeo (play/pause/parar/pular) e quem está com o outdoor aberto acompanha ──
export type PlaybackState = "playing" | "paused" | "stopped";
export interface ScreenPlayback {
  state: PlaybackState;
  /** Posição do vídeo (s) no instante `at`. */
  position: number;
  /** Hora do servidor (ms desde 1970) em que o admin apertou o botão. */
  at: number;
  /** Volume geral (0 a 100) definido pelo admin; o jogo ainda reduz com a distância. Ausente = 100. */
  volume?: number;
}

export function cleanPlayback(v: unknown): ScreenPlayback | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.state !== "playing" && o.state !== "paused" && o.state !== "stopped") return null;
  if (typeof o.position !== "number" || !Number.isFinite(o.position) || o.position < 0 || o.position > 86_400) return null;
  if (typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
  const volume = typeof o.volume === "number" && Number.isFinite(o.volume) ? Math.max(0, Math.min(100, Math.round(o.volume))) : undefined;
  return { state: o.state, position: o.position, at: o.at, ...(volume !== undefined ? { volume } : {}) };
}

let clockOffset = 0;
/** Diferença (ms) entre o relógio do servidor e o deste aparelho. */
export function setClockOffset(ms: number): void {
  clockOffset = Number.isFinite(ms) && Math.abs(ms) < 24 * 3600_000 ? ms : 0;
}
export function serverNow(): number {
  return Date.now() + clockOffset;
}

/** Onde o vídeo deveria estar agora (tocando: avança com o tempo desde o comando do admin). */
export function expectedPosition(pb: ScreenPlayback, now = serverNow()): number {
  if (pb.state === "stopped") return 0;
  if (pb.state === "paused") return pb.position;
  return Math.max(0, pb.position + (now - pb.at) / 1000);
}

// ── Estado compartilhado (config + modal aberto), lido pela cena 3D e pela interface ──
type Listener = () => void;
const listeners = new Set<Listener>();
let screen: ScreenConfig | null = null;
let playback: ScreenPlayback | null = null;
let open = false;

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Volume só deste aparelho (0 a 100): vale por cima do volume geral do operador e da distância.
let localVolume = (() => {
  try {
    const v = Number(localStorage.getItem("manifestacao.outdoorVolume"));
    return Number.isFinite(v) && localStorage.getItem("manifestacao.outdoorVolume") !== null ? Math.max(0, Math.min(100, v)) : 100;
  } catch {
    return 100;
  }
})();
export function currentLocalVolume(): number {
  return localVolume;
}
export function setLocalVolume(v: number): void {
  localVolume = Math.max(0, Math.min(100, Math.round(v)));
  try {
    localStorage.setItem("manifestacao.outdoorVolume", String(localVolume));
  } catch {
    /* modo privado: vale só nesta sessão */
  }
  emit();
}
export function useLocalVolume(): number {
  return useSyncExternalStore(subscribe, () => localVolume);
}

export function setParkScreen(next: ScreenConfig | null): void {
  screen = next;
  if (!next) open = false;
  emit();
}
export function setPlayback(next: ScreenPlayback | null): void {
  playback = next;
  emit();
}
export function currentPlayback(): ScreenPlayback | null {
  return playback;
}
export function usePlayback(): ScreenPlayback | null {
  return useSyncExternalStore(subscribe, () => playback);
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
