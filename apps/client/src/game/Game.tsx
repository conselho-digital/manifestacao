import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { AvatarConfig, VehicleId } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player, type PlayerTransform } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { SprayMarks } from "./SprayMarks.js";
import { useInput } from "./useInput.js";
import { modelUrlFor } from "./models.js";
import { clampToAvenue } from "./world.js";
import { SPRAY_CARTRIDGE_SIZE, SPRAY_REACH, SPRAY_REFILL_INTERVAL_MS } from "./spray.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { Joystick } from "../ui/Joystick.js";
import { CameraLook } from "../ui/CameraLook.js";
import { RunButton } from "../ui/RunButton.js";
import { Hud } from "../ui/Hud.js";
import { VehiclePicker } from "../ui/VehiclePicker.js";
import { StoreButton } from "../ui/StoreButton.js";
import { SprayButton } from "../ui/SprayButton.js";
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
 * HUD (placar + chat), seletor de veículo, spray e joystick de toque.
 * Sessão/loja não vivem aqui — ver App.tsx.
 */
export function Game({ avatar, owned, onOpenStore, paused, entitlementsLoading }: GameProps) {
  const [vehicle, setVehicle] = useState<VehicleId>("nenhum");
  // Pausa o movimento por teclado enquanto a loja (renderizada por cima,
  // em App.tsx) está aberta. O joystick já fica coberto pelo overlay da
  // loja (zIndex maior), então só o teclado precisa dessa trava explícita.
  const { inputRef, setJoystick } = useInput(!paused);
  const net = useAvenueRealtime(avatar);

  // Ângulo da câmera (controlado pelo arrasto na metade direita da tela) e
  // estado do botão de correr — lidos a cada frame pelo Player, sem passar
  // por re-render do React.
  const cameraYawRef = useRef(0);
  const runRef = useRef(false);

  const transformRef = useRef<PlayerTransform>({ x: 0, z: 0, rotationY: 0 });
  // Só true depois do primeiro useFrame do Player — evita que um clique no
  // instante do mount (antes do R3F rodar o primeiro frame) borrife na
  // origem do mundo (0,0) em vez de ignorar o clique.
  const transformReadyRef = useRef(false);

  // Cartucho de spray: contador local (client-trust, como o resto do MVP não
  // autoritativo — CLAUDE.md §4). Recarrega sozinho até o máximo.
  const [sprayCharges, setSprayCharges] = useState(SPRAY_CARTRIDGE_SIZE);
  useEffect(() => {
    const t = setInterval(() => {
      setSprayCharges((c) => Math.min(SPRAY_CARTRIDGE_SIZE, c + 1));
    }, SPRAY_REFILL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const handleSpray = useCallback(() => {
    if (!transformReadyRef.current) return;
    setSprayCharges((c) => {
      if (c <= 0) return c;
      const { x, z, rotationY } = transformRef.current;
      // "Na frente" do jogador, na direção para onde ele está virado.
      const target = clampToAvenue(x + Math.sin(rotationY) * SPRAY_REACH, z + Math.cos(rotationY) * SPRAY_REACH);
      net.sendSpray(target.x, target.z, avatar.shirt);
      return c - 1;
    });
  }, [net, avatar.shirt]);

  return (
    <>
      {/* Z negativo: combina com o sinal que Player.tsx usa pra calcular a
          câmera (yaw inicial 0 → atrás do personagem fica em -Z), evitando
          um giro perceptível da câmera logo na entrada. */}
      <Canvas shadows camera={{ position: [0, 10, -14], fov: 55 }}>
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
        <SprayMarks marksRef={net.sprayMarksRef} version={net.sprayVersion} />
        <Player
          color={avatar.shirt}
          name={avatar.nickname}
          flag={avatar.flag}
          vehicle={vehicle}
          modelUrl={modelUrlFor(avatar.character)}
          inputRef={inputRef}
          cameraYawRef={cameraYawRef}
          runRef={runRef}
          onMove={net.sendMove}
          transformRef={transformRef}
          transformReadyRef={transformReadyRef}
        />
        <RemotePlayers ids={net.remoteIds} playersRef={net.playersRef} />
      </Canvas>

      <Joystick onMove={setJoystick} />
      <CameraLook yawRef={cameraYawRef} />
      <RunButton runRef={runRef} />
      <TopRightPanel>
        <StoreButton onClick={onOpenStore} />
        <SprayButton charges={sprayCharges} maxCharges={SPRAY_CARTRIDGE_SIZE} onSpray={handleSpray} />
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
