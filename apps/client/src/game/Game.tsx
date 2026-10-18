import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { AvatarConfig, VehicleId } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { useInput } from "./useInput.js";
import { modelUrlFor } from "./models.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { useAuth } from "../auth/useAuth.js";
import { useEntitlements } from "../shop/useEntitlements.js";
import { Joystick } from "../ui/Joystick.js";
import { Hud } from "../ui/Hud.js";
import { VehiclePicker } from "../ui/VehiclePicker.js";
import { StoreButton } from "../ui/StoreButton.js";
import { TopRightPanel } from "../ui/TopRightPanel.js";
import { Store } from "../shop/Store.js";

/**
 * Cena de jogo: avenida 3D, jogador local, jogadores remotos (Realtime),
 * HUD (placar + chat), seletor de veículo, loja e joystick de toque.
 */
export function Game({ avatar }: { avatar: AvatarConfig }) {
  const [vehicle, setVehicle] = useState<VehicleId>("nenhum");
  const [storeOpen, setStoreOpen] = useState(false);
  // Pausa o movimento por teclado enquanto a loja (modal) está aberta; o
  // joystick já fica coberto pelo overlay da loja (zIndex maior).
  const { inputRef, setJoystick } = useInput(!storeOpen);
  const net = useAvenueRealtime(avatar);

  // Sessão/posses compartilhadas entre o gating do VehiclePicker e a Store
  // (uma única fonte, em vez de cada um buscar por conta própria).
  const { session, loading: authLoading } = useAuth();
  const { owned, refresh } = useEntitlements(session);

  return (
    <>
      <Canvas shadows camera={{ position: [0, 10, 14], fov: 55 }}>
        <color attach="background" args={["#161a1f"]} />
        <fog attach="fog" args={["#161a1f", 40, 120]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[20, 40, 20]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Scenery />
        <Player
          color={avatar.shirt}
          name={avatar.nickname}
          flag={avatar.flag}
          vehicle={vehicle}
          modelUrl={modelUrlFor(avatar.character)}
          inputRef={inputRef}
          onMove={net.sendMove}
        />
        <RemotePlayers ids={net.remoteIds} playersRef={net.playersRef} />
      </Canvas>

      <Joystick onMove={setJoystick} />
      <TopRightPanel>
        <StoreButton onClick={() => setStoreOpen(true)} />
        <VehiclePicker
          value={vehicle}
          onChange={setVehicle}
          owned={owned}
          onLocked={() => setStoreOpen(true)}
        />
      </TopRightPanel>
      <Hud
        online={net.online}
        scores={net.scores}
        chatLog={net.chatLog}
        onChat={net.sendChat}
      />
      {storeOpen && (
        <Store
          onClose={() => setStoreOpen(false)}
          session={session}
          authLoading={authLoading}
          owned={owned}
          refresh={refresh}
        />
      )}
    </>
  );
}
