import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { AvatarConfig, VehicleId } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { useInput } from "./useInput.js";
import { modelUrlFor } from "./models.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { Joystick } from "../ui/Joystick.js";
import { Hud } from "../ui/Hud.js";
import { VehiclePicker } from "../ui/VehiclePicker.js";
import { StoreButton } from "../ui/StoreButton.js";
import { TopRightPanel } from "../ui/TopRightPanel.js";

interface GameProps {
  avatar: AvatarConfig;
  /** Itens que o usuário possui (vem de cima — App.tsx — compartilhado com a Store). */
  owned: ReadonlySet<string>;
  /** Abre a loja (também vive em App.tsx, fora do ciclo de vida do jogo). */
  onOpenStore: () => void;
  /** true enquanto a loja (ou outro modal) está aberta por cima do jogo. */
  paused: boolean;
  /** true enquanto a sessão/posses ainda não terminaram de carregar. */
  entitlementsLoading: boolean;
}

/**
 * Cena de jogo: avenida 3D, jogador local, jogadores remotos (Realtime),
 * HUD (placar + chat), seletor de veículo e joystick de toque. Sessão/loja
 * não vivem aqui — ver App.tsx.
 */
export function Game({ avatar, owned, onOpenStore, paused, entitlementsLoading }: GameProps) {
  const [vehicle, setVehicle] = useState<VehicleId>("nenhum");
  // Pausa o movimento por teclado enquanto a loja (renderizada por cima,
  // em App.tsx) está aberta. O joystick já fica coberto pelo overlay da
  // loja (zIndex maior), então só o teclado precisa dessa trava explícita.
  const { inputRef, setJoystick } = useInput(!paused);
  const net = useAvenueRealtime(avatar);

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
        <StoreButton onClick={onOpenStore} />
        <VehiclePicker
          value={vehicle}
          onChange={setVehicle}
          owned={owned}
          onLocked={onOpenStore}
          loading={entitlementsLoading}
        />
      </TopRightPanel>
      <Hud
        online={net.online}
        scores={net.scores}
        chatLog={net.chatLog}
        onChat={net.sendChat}
      />
    </>
  );
}
