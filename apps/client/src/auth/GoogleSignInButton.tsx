import { useEffect, useRef, useState } from "react";
import { googleClientId } from "../config/env.js";
import { signInWithGoogle, signInWithGoogleIdToken } from "./useAuth.js";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_LOAD_TIMEOUT_MS = 4000;
/** Largura fixa do botão — o GIS não aceita "100%", só px. */
const BUTTON_WIDTH = 320;

// Tipagem mínima da API do Google Identity Services que usamos (não há
// pacote de tipos oficial pequeno o bastante para valer a pena instalar).
interface GoogleIdCredentialResponse {
  credential: string;
}
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (res: GoogleIdCredentialResponse) => void;
    /** Amarra o ID token a esta tentativa de login — ver uso abaixo. */
    nonce?: string;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { type: "standard"; theme: "outline" | "filled_black"; size: "large" | "medium"; text: "signin_with" | "continue_with"; shape: "pill" | "rectangular"; width?: number },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

/** Carrega o script do GIS uma única vez, mesmo com vários componentes montando. */
function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gis script error")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis script error"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    // Sem isso, uma falha (ex.: bloqueador de conteúdo) ficava em cache pra
    // sempre — nenhuma remontagem futura tentaria carregar de novo, mesmo
    // que a rede/bloqueio mudasse nesse meio tempo.
    scriptPromise = null;
    throw err;
  });
  scriptPromise = promise;
  return promise;
}

interface GoogleSignInButtonProps {
  /** Chamado depois que o login no Supabase é confirmado com sucesso. */
  onSignedIn?: () => void;
}

/**
 * Botão de login "Continuar com o Google" via Google Identity Services
 * (GIS): não redireciona a página inteira, então a tela de escolha de
 * conta do Google não mostra a URL do projeto Supabase — fica só o
 * seletor de conta embutido. O token (JWT) coletado é repassado pro
 * Supabase via `signInWithIdToken`, tudo em segundo plano.
 *
 * Se o script do Google não carregar (bloqueador de conteúdo, rede, etc.),
 * cai para o login por redirect de página inteira (`signInWithGoogle`).
 */
export function GoogleSignInButton({ onSignedIn }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback" | "signing-in" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // `onSignedIn` muda de identidade a cada render do AvatarPicker (nickname
  // mudando, time mudando etc.) — se o efeito abaixo dependesse dele
  // diretamente, reinicializaria o GIS (e recriaria o botão) a cada tecla.
  // Guardando num ref, o efeito só depende do client ID (fixo).
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    // Copiado pra uma local: o TS não propaga o narrowing de `!clientId`
    // pra dentro da closure do `.then()` abaixo se usar `googleClientId`
    // (import) direto.
    const clientId = googleClientId;
    if (!clientId) {
      setStatus("fallback");
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "loading" ? "fallback" : s));
    }, GIS_LOAD_TIMEOUT_MS);

    // Nonce único por tentativa de login: amarra o ID token do Google a
    // esta sessão de navegador específica, fechando a janela de replay que
    // um ID token "solto" (sem nonce) teria se vazasse por outro canal.
    const nonce = crypto.randomUUID();

    loadGisScript()
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce,
          callback: (res) => {
            if (cancelled) return;
            setStatus("signing-in");
            setErrorMsg(null);
            void signInWithGoogleIdToken(res.credential, nonce).then(({ error }) => {
              if (cancelled) return;
              if (error) {
                setStatus("error");
                setErrorMsg("Não deu pra entrar com essa conta. Tenta de novo.");
                return;
              }
              onSignedInRef.current?.();
            });
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          // Outline: mais coerente com o resto da UI (superfícies
          // escuras-mas-não-pretas) do que o preto puro do filled_black.
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: BUTTON_WIDTH,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("fallback");
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  if (status === "fallback") {
    // Google Identity Services indisponível — volta pro redirect de página
    // inteira (CLAUDE.md §2: conta obrigatória, mas sempre precisa de uma
    // forma de logar, mesmo que o GIS esteja bloqueado).
    return (
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        style={{
          minHeight: 44,
          width: BUTTON_WIDTH,
          maxWidth: "100%",
          padding: "10px 18px",
          fontSize: "var(--t-ui)",
          fontWeight: 700,
          borderRadius: 999,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        Continuar com o Google
      </button>
    );
  }

  return (
    <div>
      {/* minHeight reserva o espaço do botão do Google antes dele terminar
          de carregar — sem isso, o texto de aviso abaixo "pulava" pra cima
          quando o botão finalmente aparecia. */}
      <div
        ref={containerRef}
        style={{
          minHeight: 44,
          width: BUTTON_WIDTH,
          maxWidth: "100%",
          opacity: status === "signing-in" ? 0.6 : 1,
          pointerEvents: status === "signing-in" ? "none" : "auto",
        }}
      />
      {status === "signing-in" && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>Entrando…</p>
      )}
      {status === "error" && errorMsg && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--danger)" }}>{errorMsg}</p>
      )}
    </div>
  );
}
