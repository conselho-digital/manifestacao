import { useCallback, useEffect, useMemo, useState } from "react";
import { TEAMS, VEHICLE_IDS, type AvatarConfig } from "@manifestacao/shared";
import { AVATAR_STORAGE_KEY, AvatarPicker } from "./ui/AvatarPicker.js";
import { CookieConsent } from "./ui/CookieConsent.js";
import { Game } from "./game/Game.js";
import { Store } from "./shop/Store.js";
import { signOut, useAuth } from "./auth/useAuth.js";
import { useEntitlements } from "./shop/useEntitlements.js";
import { useCatalog } from "./shop/useCatalog.js";
import { useIsAdmin } from "./auth/useIsAdmin.js";
import { useSanctions } from "./auth/useSanctions.js";
import { loadAndApplyGameConfig } from "./config/gameConfig.js";
import { clearProductThumbs } from "./shop/ProductThumb.js";
import { clearFacePortraits } from "./ui/CharacterFace.js";

/**
 * Raiz do app: escolhe o avatar e então entra na avenida.
 *
 * Sessão/posses vivem aqui (não dentro do Game nem da Store) para que a
 * loja fique disponível tanto na tela de entrada (ver Premium antes de
 * jogar) quanto durante o jogo, com um único estado compartilhado — sem
 * isso, fechar/abrir a loja perdia o refresh do inventário (ver §7).
 */
export function App() {
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const { session, loading: authLoading } = useAuth();
  const { owned: ownedByPurchase, refresh, loading: entitlementsLoading } = useEntitlements(session);
  const isAdmin = useIsAdmin(session);
  const sanctions = useSanctions(session);
  const { items: catalogItems } = useCatalog();
  // Conta admin tem TODOS os itens (inclusive os criados depois) para testar tudo sem comprar.
  const owned = useMemo(() => {
    if (!isAdmin) return ownedByPurchase;
    const all = new Set(ownedByPurchase);
    for (const it of catalogItems) all.add(it.id);
    for (const v of VEHICLE_IDS) if (v !== "nenhum") all.add(`vehicle:${v}`);
    all.add("pass:premium");
    return all;
  }, [isAdmin, ownedByPurchase, catalogItems]);

  // Config editável pelo admin (equipes, bandeiras, nomes/preços, modelos 3D):
  // aplicada por cima dos padrões; `configVersion` força o re-render de quem lê.
  const [configVersion, setConfigVersion] = useState(0);
  // A primeira carga precisa terminar antes de mostrar seletor/jogo: senão o boneco padrão aparece e só depois troca
  // pelo modelo enviado pelo admin.
  const [configReady, setConfigReady] = useState(false);
  const reloadConfig = useCallback(async () => {
    try {
      const loading = loadAndApplyGameConfig();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([loading, new Promise((r) => (timer = setTimeout(r, 8000)))]);
      clearTimeout(timer);
      // Se passou do prazo, quando a carga terminar o que lê a config é atualizado.
      void loading.then(() => setConfigVersion((v) => v + 1)).catch(() => {});
    } catch {
      /* sem rede/Supabase: segue com os padrões */
    }
    setConfigReady(true);
    clearProductThumbs();
    clearFacePortraits();
    setConfigVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  // A cor da camisa acompanha a cor atual da equipe (o admin pode mudá-la).
  const liveAvatar = useMemo(
    () => (avatar ? { ...avatar, shirt: TEAMS[avatar.team].color } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [avatar, configVersion],
  );
  // Enquanto a sessão OU o fetch de posses ainda não resolveram, não dá para
  // confiar em `owned` (pode estar vazio só porque ainda não chegou, não
  // porque o usuário realmente não tem o item).
  const ownedLoading = authLoading || entitlementsLoading;

  // Como `owned`/`refresh` agora vivem aqui (fora do ciclo de vida da
  // Store), abrir/fechar o modal não remonta o hook — sem isto, reabrir a
  // loja depois de um pagamento confirmado em segundo plano não refletia
  // o item liberado até recarregar a página inteira.
  useEffect(() => {
    if (storeOpen) void refresh();
  }, [storeOpen, refresh]);

  const changeAvatar = (a: AvatarConfig) => {
    setAvatar(a);
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(a));
    } catch {
      /* modo privado: vale só nesta sessão */
    }
  };

  // Sai da conta e volta pra tela inicial.
  const exitPlatform = () => {
    void signOut();
    setAvatar(null);
  };

  // Aviso do silêncio (chat desativado); o relógio da página reavalia ao mudar o minuto.
  const mutedNotice =
    sanctions.mutedUntil && sanctions.mutedUntil > Date.now()
      ? sanctions.mutedUntil >= Number.MAX_SAFE_INTEGER
        ? "Você está silenciado."
        : `Silenciado até ${new Date(sanctions.mutedUntil).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
      : null;

  if (sanctions.banned) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "var(--bg)",
          color: "var(--ink)",
        }}
      >
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, textTransform: "uppercase", fontSize: 32 }}>
          Conta banida
        </h1>
        <p style={{ margin: 0, maxWidth: 360, color: "var(--ink-dim)", fontSize: "var(--t-body)" }}>
          Esta conta não pode entrar na avenida.{sanctions.reason ? ` Motivo: ${sanctions.reason}` : ""}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          style={{
            minHeight: 44,
            padding: "0 20px",
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--line)",
            background: "transparent",
            color: "var(--ink)",
            fontSize: "var(--t-ui)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sair da conta
        </button>
      </main>
    );
  }

  if (!configReady) {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--ink-dim)" }}>
        Carregando…
      </main>
    );
  }

  return (
    <>
      {liveAvatar ? (
        <Game
          avatar={liveAvatar}
          owned={owned}
          onOpenStore={() => setStoreOpen(true)}
          paused={storeOpen}
          entitlementsLoading={ownedLoading}
          onAvatarChange={changeAvatar}
          onExit={exitPlatform}
          isAdmin={isAdmin}
          signedIn={session !== null}
          onConfigChanged={reloadConfig}
          mutedNotice={mutedNotice}
        />
      ) : (
        <AvatarPicker
          onReady={setAvatar}
          session={session}
          authLoading={authLoading}
          onOpenStore={() => setStoreOpen(true)}
        />
      )}
      {storeOpen && (
        <Store
          onClose={() => setStoreOpen(false)}
          session={session}
          authLoading={authLoading}
          owned={owned}
          refresh={refresh}
        />
      )}
      <CookieConsent />
    </>
  );
}
