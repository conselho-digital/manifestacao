import { useCallback, useEffect, useMemo, useState } from "react";
import { TEAMS, type AvatarConfig } from "@manifestacao/shared";
import { AVATAR_STORAGE_KEY, AvatarPicker } from "./ui/AvatarPicker.js";
import { CookieConsent } from "./ui/CookieConsent.js";
import { Game } from "./game/Game.js";
import { Store } from "./shop/Store.js";
import { signOut, useAuth } from "./auth/useAuth.js";
import { useEntitlements } from "./shop/useEntitlements.js";
import { useIsAdmin } from "./auth/useIsAdmin.js";
import { loadAndApplyGameConfig } from "./config/gameConfig.js";
import { clearProductThumbs } from "./shop/ProductThumb.js";

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
  const { owned, refresh, loading: entitlementsLoading } = useEntitlements(session);
  const isAdmin = useIsAdmin(session);

  // Config editável pelo admin (equipes, bandeiras, nomes/preços, modelos 3D):
  // aplicada por cima dos padrões; `configVersion` força o re-render de quem lê.
  const [configVersion, setConfigVersion] = useState(0);
  const reloadConfig = useCallback(async () => {
    try {
      await loadAndApplyGameConfig();
    } catch {
      /* sem rede/Supabase: segue com os padrões */
    }
    clearProductThumbs();
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
