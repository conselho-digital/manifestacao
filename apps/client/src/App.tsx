import { useEffect, useState } from "react";
import type { AvatarConfig } from "@manifestacao/shared";
import { AvatarPicker } from "./ui/AvatarPicker.js";
import { CookieConsent } from "./ui/CookieConsent.js";
import { Game } from "./game/Game.js";
import { Store } from "./shop/Store.js";
import { useAuth } from "./auth/useAuth.js";
import { useEntitlements } from "./shop/useEntitlements.js";

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

  return (
    <>
      {avatar ? (
        <Game
          avatar={avatar}
          owned={owned}
          onOpenStore={() => setStoreOpen(true)}
          paused={storeOpen}
          entitlementsLoading={ownedLoading}
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
