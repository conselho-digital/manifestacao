import { Canvas } from "@react-three/fiber";
import type { AvatarConfig } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { useInput } from "./useInput.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { Joystick } from "../ui/Joystick.js";
import { Hud } from "../ui/Hud.js";

/**
 * Cena de jogo: avenida 3D, jogador local, jogadores remotos (Realtime),
 * HUD (placar + chat) e joystick de toque.
 */
export function Game({ avatar }: { avatar: AvatarConfig }) {
  const { inputRef, setJoystick } = useInput();
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
          inputRef={inputRef}
          onMove={net.sendMove}
        />
        <RemotePlayers ids={net.remoteIds} playersRef={net.playersRef} />
      </Canvas>

      <Joystick onMove={setJoystick} />
      <Hud
        online={net.online}
        scores={net.scores}
        chatLog={net.chatLog}
        onChat={net.sendChat}
      />
    </>
  );
}
