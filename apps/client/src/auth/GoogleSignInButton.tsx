import { useEffect, useRef, useState } from "react";
import { googleClientId } from "../config/env.js";
import { signInWithGoogle, signInWithGoogleIdToken } from "./useAuth.js";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_LOAD_TIMEOUT_MS = 4000;
/** Limite da própria API do Google pro parâmetro `width` do botão renderizado. */
const GIS_BUTTON_MAX_WIDTH = 400;

// Tipagem mínima da API do Google Identity Services que usamos (não há
// pacote de tipos oficial pequeno o bastante para valer a pena instalar).
interface GoogleIdCredentialResponse {
  credential: string;
}
interface GoogleButtonConfig {
  type: "standard";
  theme: "outline" | "filled_black" | "filled_blue";
  size: "large" | "medium" | "small";
  text: "signin_with" | "continue_with";
  shape: "pill" | "rectangular";
  logo_alignment: "left" | "center";
  width?: number;
}
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (res: GoogleIdCredentialResponse) => void;
    /** Amarra o ID token a esta tentativa de login — ver uso abaixo. */
    nonce?: string;
  }): void;
  /**
   * Desenha o botão oficial do Google num container nosso. Ao clicar, o
   * próprio Google abre o seletor de conta num popup/iframe dele — sem
   * redirecionar a página inteira nem passar pelo fluxo de OAuth do
   * Supabase (que é o que expõe a URL do projeto Supabase na tela de
   * "Prosseguir para..."). Diferente de `prompt()` (One Tap), não depende
   * de heurísticas/cooldown do navegador pra decidir se mostra ou não —
   * é isso que resolve o caso em que o One Tap ficava sempre caindo pro
   * redirect com motivo `opt_out_or_no_session`.
   */
  renderButton(parent: HTMLElement, config: GoogleButtonConfig): void;
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
 * Botão "Continuar com o Google": usa o SDK oficial do Google (Identity
 * Services) e o botão RENDERIZADO POR ELE (`renderButton`), não mais o
 * `prompt()` (One Tap). O One Tap tinha supressão silenciosa do navegador
 * (motivo `opt_out_or_no_session`, reproduzido tanto no Chrome quanto no
 * Brave do celular) que sempre caía pro redirect de página inteira — e esse
 * redirect passa pelo fluxo de OAuth do Supabase, que é o que mostra a URL
 * do projeto Supabase na tela "Prosseguir para...". `renderButton` abre o
 * seletor de conta num popup/iframe do próprio Google, sem esse redirect.
 *
 * Único efeito colateral: o visual do botão é o do Google (não dá pra pintar
 * de amarelo — é restrição da própria API, por consistência de marca). Só o
 * tema/forma são configuráveis.
 *
 * Se o script do Google não carregar (bloqueador de conteúdo, rede etc.),
 * cai pro botão nosso com redirect de página inteira (`signInWithGoogle`).
 */
export function GoogleSignInButton({ onSignedIn }: GoogleSignInButtonProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "fallback" | "signing-in" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Nonce cru (mandado pro Supabase) — gerado uma vez por montagem/tentativa.
  const nonceRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (cancelled) return;
      setStatus((s) => {
        if (s !== "loading") return s;
        console.warn("[GIS] script/initialize não terminou a tempo, caindo pro redirect.");
        setErrorMsg("Login rápido demorou demais, usando redirecionamento…");
        return "fallback";
      });
    }, GIS_LOAD_TIMEOUT_MS);

    // Nonce único por tentativa de login: amarra o ID token do Google a esta
    // sessão de navegador específica, fechando a janela de replay que um ID
    // token "solto" (sem nonce) teria se vazasse por outro canal.
    //
    // O Google embute no token o HASH SHA-256 do nonce que foi passado em
    // `initialize()`, não o valor cru — é assim que o próprio Google e a
    // documentação do Supabase recomendam. Se mandarmos o nonce cru pros
    // dois lados (initialize E signInWithIdToken), o valor do token nunca
    // bate com o que o Supabase espera, e o login falha com um erro genérico
    // mesmo a conta do Google tendo sido escolhida com sucesso.
    const nonce = crypto.randomUUID();
    nonceRef.current = nonce;

    // `google.accounts.id` é um singleton global do script do Google — se um
    // dia existir mais de uma instância desse componente montada ao mesmo
    // tempo, a segunda `initialize()` sobrescreveria o nonce/callback da
    // primeira. Hoje só há uma instância (AvatarPicker.tsx), então não é um
    // problema real, só uma armadilha a lembrar se isso mudar.
    // Redesenha o botão do Google com a largura atual do container — chamado
    // no carregamento e de novo a cada resize/giro de tela (celular), já que
    // `renderButton` não é reativo sozinho: sem isso, o botão ficava com a
    // largura medida no instante do mount pra sempre (overflow ou botão
    // pequeno demais depois de girar o celular, por ex.).
    const renderButton = () => {
      if (!window.google || !containerRef.current) return;
      // Container escondido (ex.: ainda não visível nesse passo da tela) tem
      // clientWidth 0 — nesse caso não redesenha agora; o listener de resize
      // cobre quando ele aparecer e o layout mudar.
      const measured = containerRef.current.clientWidth;
      if (!measured) return;
      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "left",
        width: Math.min(GIS_BUTTON_MAX_WIDTH, measured),
      });
    };

    Promise.all([loadGisScript(), sha256Hex(nonce)])
      .then(([, hashedNonce]) => {
        if (cancelled || !window.google || !containerRef.current) return;
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
        renderButton();
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Diagnóstico: motivo exato de o GIS não ter ficado pronto (script
        // bloqueado, renderButton rejeitado pelo navegador etc.) — sem isso,
        // qualquer falha aqui virava um fallback silencioso, sem pista do
        // porquê no console.
        console.error("[GIS] falha ao inicializar o login do Google:", err);
        setErrorMsg("Login rápido indisponível, usando redirecionamento…");
        setStatus("fallback");
      });

    window.addEventListener("resize", renderButton);
    window.addEventListener("orientationchange", renderButton);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener("resize", renderButton);
      window.removeEventListener("orientationchange", renderButton);
    };
  }, []);

  const busy = status === "signing-in";

  if (status === "fallback" || status === "loading") {
    return (
      <div>
        {/* Mesmo tamanho do botão "Entrar na avenida" que ele substitui nesta
            mesma barra fixa — sem isso, a troca de estado (logado/deslogado)
            fazia o CTA "encolher" visivelmente (altura, fonte e largura
            menores). */}
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={status === "loading"}
          style={{
            width: "min(720px, 100%)",
            display: "block",
            minHeight: 52,
            padding: "14px 32px",
            fontSize: 17,
            fontWeight: 800,
            borderRadius: "var(--r-lg)",
            border: "none",
            background: "var(--accent)",
            color: "var(--on-accent)",
            cursor: status === "loading" ? "default" : "pointer",
            opacity: status === "loading" ? 0.6 : 1,
            transition: "opacity .12s",
          }}
        >
          Continuar com o Google
        </button>
        {status === "fallback" && errorMsg && (
          <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--danger)" }}>{errorMsg}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* O Google desenha o botão dentro deste container (iframe dele) —
          escondido enquanto `signing-in`, pra não deixar clicável durante o
          processamento, com um botão nosso (desabilitado) no lugar. */}
      <div ref={containerRef} style={{ display: busy ? "none" : "flex", justifyContent: "center" }} />
      {busy && (
        <button
          type="button"
          disabled
          style={{
            width: "min(720px, 100%)",
            display: "block",
            minHeight: 52,
            padding: "14px 32px",
            fontSize: 17,
            fontWeight: 800,
            borderRadius: "var(--r-lg)",
            border: "none",
            background: "var(--accent)",
            color: "var(--on-accent)",
            cursor: "default",
            opacity: 0.6,
          }}
        >
          Entrando…
        </button>
      )}
      {status === "error" && errorMsg && (
        <p style={{ margin: "6px 0 0", fontSize: "var(--t-ui)", color: "var(--danger)" }}>{errorMsg}</p>
      )}
    </div>
  );
}
