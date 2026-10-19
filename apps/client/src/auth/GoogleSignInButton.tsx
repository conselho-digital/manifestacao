import { useEffect, useRef, useState } from "react";
import { googleClientId } from "../config/env.js";
import { signInWithGoogle, signInWithGoogleIdToken } from "./useAuth.js";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_LOAD_TIMEOUT_MS = 4000;

// Tipagem mínima da API do Google Identity Services que usamos (não há
// pacote de tipos oficial pequeno o bastante para valer a pena instalar).
interface GoogleIdCredentialResponse {
  credential: string;
}
interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (res: GoogleIdCredentialResponse) => void }): void;
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
  scriptPromise = new Promise((resolve, reject) => {
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
  });
  return scriptPromise;
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

    loadGisScript()
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            setStatus("signing-in");
            setErrorMsg(null);
            void signInWithGoogleIdToken(res.credential).then(({ error }) => {
              if (cancelled) return;
              if (error) {
                setStatus("error");
                setErrorMsg("Não deu pra entrar com essa conta. Tenta de novo.");
                return;
              }
              onSignedIn?.();
            });
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
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
  }, [onSignedIn]);

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
      <div ref={containerRef} style={{ opacity: status === "signing-in" ? 0.6 : 1, pointerEvents: status === "signing-in" ? "none" : "auto" }} />
      {status === "signing-in" && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>Entrando…</p>
      )}
      {status === "error" && errorMsg && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--danger)" }}>{errorMsg}</p>
      )}
    </div>
  );
}
