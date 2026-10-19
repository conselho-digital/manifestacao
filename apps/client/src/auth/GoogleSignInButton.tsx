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
interface GooglePromptNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
}
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (res: GoogleIdCredentialResponse) => void;
    /** Amarra o ID token a esta tentativa de login — ver uso abaixo. */
    nonce?: string;
  }): void;
  /** Dispara o seletor de conta do Google (One Tap/seleção), sem precisar do botão com a marca deles. */
  prompt(momentListener?: (n: GooglePromptNotification) => void): void;
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

/** SHA-256 em hex — ver por que o nonce do lado do Google precisa ser o hash, não o valor cru, logo abaixo. */
async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface GoogleSignInButtonProps {
  /** Chamado depois que o login no Supabase é confirmado com sucesso. */
  onSignedIn?: () => void;
}

/**
 * Botão "Continuar com o Google" com a nossa cara (amarelo, mesmo estilo do
 * resto do app) em vez do widget com a marca do Google — ele só dispara
 * `google.accounts.id.prompt()` (Google Identity Services), que mostra o
 * seletor de conta sem redirecionar a página inteira nem mostrar a URL do
 * projeto Supabase. O token (JWT) coletado é repassado pro Supabase via
 * `signInWithIdToken`, tudo em segundo plano.
 *
 * Se o script do Google não carregar, ou o prompt não aparecer por algum
 * motivo do navegador (cooldown do One Tap, bloqueio, etc.), cai pro
 * redirect de página inteira (`signInWithGoogle`).
 */
export function GoogleSignInButton({ onSignedIn }: GoogleSignInButtonProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "fallback" | "signing-in" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Nonce cru (mandado pro Supabase) — gerado uma vez por montagem/tentativa.
  const nonceRef = useRef<string | null>(null);

  // `onSignedIn` muda de identidade a cada render do AvatarPicker (nickname
  // mudando, time mudando etc.) — se o efeito abaixo dependesse dele
  // diretamente, reinicializaria o GIS a cada tecla. Guardando num ref, o
  // efeito só depende do client ID (fixo).
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

    // Nonce único por tentativa de login: amarra o ID token do Google a esta
    // sessão de navegador específica, fechando a janela de replay que um ID
    // token "solto" (sem nonce) teria se vazasse por outro canal.
    //
    // O Google (via FedCM, usado por baixo dos panos no fluxo de prompt())
    // embute no token o HASH SHA-256 do nonce que foi passado em
    // `initialize()`, não o valor cru — é assim que o próprio Google e a
    // documentação do Supabase recomendam. Se mandarmos o nonce cru pros
    // dois lados (initialize E signInWithIdToken), o valor do token nunca
    // bate com o que o Supabase espera, e o login falha com um erro genérico
    // mesmo a conta do Google tendo sido escolhida com sucesso.
    const nonce = crypto.randomUUID();
    nonceRef.current = nonce;

    Promise.all([loadGisScript(), sha256Hex(nonce)])
      .then(([, hashedNonce]) => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: hashedNonce,
          callback: (res) => {
            if (cancelled) return;
            setStatus("signing-in");
            setErrorMsg(null);
            const currentNonce = nonceRef.current;
            if (!currentNonce) return;
            void signInWithGoogleIdToken(res.credential, currentNonce).then(({ error }) => {
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

  const click = () => {
    if (status !== "ready" || !window.google) {
      void signInWithGoogle();
      return;
    }
    window.google.accounts.id.prompt((notification) => {
      // O seletor não apareceu (cooldown do One Tap, navegador sem suporte,
      // etc.) — sem fallback aqui, o clique não faria nada visível.
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        void signInWithGoogle();
      }
    });
  };

  const busy = status === "signing-in";

  return (
    <div>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        style={{
          minHeight: 44,
          width: 320,
          maxWidth: "100%",
          padding: "10px 18px",
          fontSize: "var(--t-ui)",
          fontWeight: 800,
          borderRadius: 999,
          border: "none",
          background: "var(--accent)",
          color: "var(--on-accent)",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Entrando…" : "Continuar com o Google"}
      </button>
      {status === "error" && errorMsg && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--danger)" }}>{errorMsg}</p>
      )}
    </div>
  );
}
