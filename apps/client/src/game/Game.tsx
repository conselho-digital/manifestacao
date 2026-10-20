import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { AvatarConfig, VehicleId } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player, type PlayerTransform } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { SprayMarks } from "./SprayMarks.js";
import { isTypingTarget, useInput } from "./useInput.js";
import { modelUrlFor } from "./models.js";
import { CAMERA_SHOULDER_RATIO, CAMERA_DISTANCE_MOBILE, CAMERA_DISTANCE_DESKTOP, CAMERA_PITCH_DEFAULT, CAMERA_PIVOT_HEIGHT } from "./world.js";
import { SPRAY_CARTRIDGE_SIZE, SPRAY_REFILL_INTERVAL_MS } from "./spray.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { Joystick } from "../ui/Joystick.js";
import { CameraLook } from "../ui/CameraLook.js";
import { RunButton } from "../ui/RunButton.js";
import { Hud } from "../ui/Hud.js";
import { VehiclePicker } from "../ui/VehiclePicker.js";
import { StoreButton } from "../ui/StoreButton.js";
import { OptionsButton } from "../ui/OptionsButton.js";
import { OptionsModal } from "../ui/OptionsModal.js";
import { AdminPanel } from "../ui/AdminPanel.js";
import { SprayButton } from "../ui/SprayButton.js";
import { TopRightPanel } from "../ui/TopRightPanel.js";
import { Crosshair } from "../ui/Crosshair.js";
import { useIsTouch } from "../ui/useIsTouch.js";
import { hasVehicleViaPremium, vehicleRequiresEntitlement } from "@manifestacao/shared";

const SKY_COLOR = "#8fc4f0";
const SUN_POSITION: [number, number, number] = [60, 110, -80];

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
  /** Aplica mudanças de perfil (equipe, personagem, apelido) feitas em Opções. */
  onAvatarChange: (a: AvatarConfig) => void;
  /** Sai da conta e volta pra tela inicial. */
  onExit: () => void;
  /** Conta admin: mostra o painel de admin em Opções. */
  isAdmin: boolean;
  /** Há sessão logada — sem ela o Realtime não conecta. */
  signedIn: boolean;
  /** Recarrega a config do jogo depois de o admin salvar algo. */
  onConfigChanged: () => Promise<void>;
}

/**
 * Cena de jogo: avenida 3D, jogador local, jogadores remotos (Realtime),
 * HUD (placar + chat), seletor de veículo, spray e joystick de toque.
 * Sessão/loja não vivem aqui — ver App.tsx.
 */
export function Game({ avatar, owned, onOpenStore, paused, entitlementsLoading, onAvatarChange, onExit, isAdmin, signedIn, onConfigChanged }: GameProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleId>("nenhum");
  // Pausa o movimento por teclado enquanto a loja (renderizada por cima,
  // em App.tsx) está aberta. O joystick já fica coberto pelo overlay da
  // loja (zIndex maior), então só o teclado precisa dessa trava explícita.
  const { inputRef, setJoystick } = useInput(!paused && !optionsOpen && !adminOpen);
  const net = useAvenueRealtime(avatar, signedIn);
  const isTouch = useIsTouch();

  // Ângulo/inclinação da câmera (controlados pelo arrasto na metade direita
  // da tela) e estado do botão de correr — lidos a cada frame pelo Player,
  // sem passar por re-render do React.
  const cameraYawRef = useRef(0);
  const cameraPitchRef = useRef(CAMERA_PITCH_DEFAULT);
  const runRef = useRef(false);
  // Ponto do chão sob a mira (centro da tela), atualizado a cada frame pelo Player.
  const aimRef = useRef({ x: 0, z: 0 });
  const cameraDistance = isTouch ? CAMERA_DISTANCE_MOBILE : CAMERA_DISTANCE_DESKTOP;

  // Dica do Shift: some ao usar Shift ou depois de alguns segundos.
  const [showRunHint, setShowRunHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowRunHint(false), 12_000);
    return () => clearTimeout(t);
  }, []);

  // PC: Shift (segurado) corre. No celular o botão "Correr" faz o mesmo.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !isTypingTarget(e.target)) {
        runRef.current = true;
        setShowRunHint(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") runRef.current = false;
    };
    const release = () => {
      runRef.current = false;
    };
    const focusIn = (e: FocusEvent) => {
      if (isTypingTarget(e.target)) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    window.addEventListener("focusin", focusIn);
    return () => {
      window.removeEventListener("focusin", focusIn);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, []);

  // Todo personagem anda a pé; veículo só com posse. Se a posse sumir (ou o
  // estado vier de antes da compra), volta pra "A pé".
  useEffect(() => {
    if (entitlementsLoading || vehicle === "nenhum") return;
    const allowed =
      !vehicleRequiresEntitlement(vehicle) || owned.has(`vehicle:${vehicle}`) || hasVehicleViaPremium(vehicle, owned);
    if (!allowed) setVehicle("nenhum");
  }, [vehicle, owned, entitlementsLoading]);

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

  const chargesRef = useRef(sprayCharges);
  chargesRef.current = sprayCharges;

  const handleSpray = useCallback(() => {
    if (!transformReadyRef.current || chargesRef.current <= 0) return;
    // Onde a mira (centro da tela) cruza o chão — ver Player.tsx. O cartucho
    // só gasta se o envio foi aceito (o cooldown pode descartá-lo).
    const target = aimRef.current;
    if (net.sendSpray(target.x, target.z, avatar.shirt)) {
      setSprayCharges((c) => Math.max(0, c - 1));
    }
  }, [net, avatar.shirt]);

  return (
    <>
      {/* Posição calculada com os mesmos yaw=0/pitch padrão que o Player.tsx
          usa pra orbitar a câmera — evita um salto/giro perceptível da
          câmera logo na entrada, antes do primeiro frame recalcular. */}
      <Canvas
        shadows
        camera={{
          position: [
            -cameraDistance * CAMERA_SHOULDER_RATIO,
            CAMERA_PIVOT_HEIGHT + Math.sin(CAMERA_PITCH_DEFAULT) * cameraDistance,
            -Math.cos(CAMERA_PITCH_DEFAULT) * cameraDistance,
          ],
          fov: 55,
        }}
      >
        <color attach="background" args={[SKY_COLOR]} />
        <fog attach="fog" args={[SKY_COLOR, 60, 180]} />
        <hemisphereLight args={["#bfdcff", "#4a5a3c", 0.55]} />
        <ambientLight intensity={0.25} />
        {/* Sol: luz direcional quente + disco visível no céu, na mesma direção. */}
        <directionalLight
          position={SUN_POSITION}
          color="#fff1d6"
          intensity={1.6}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-near={1}
          shadow-camera-far={200}
        />
        <mesh position={SUN_POSITION}>
          <sphereGeometry args={[9, 24, 16]} />
          <meshBasicMaterial color="#fff3b0" fog={false} />
        </mesh>
        <Scenery />
        <SprayMarks marksRef={net.sprayMarksRef} version={net.sprayVersion} />
        <Player
          color={avatar.shirt}
          name={avatar.nickname}
          flag={avatar.flag}
          vehicle={vehicle}
          modelUrl={modelUrlFor(avatar.character, avatar.team)}
          inputRef={inputRef}
          cameraYawRef={cameraYawRef}
          cameraPitchRef={cameraPitchRef}
          cameraDistance={cameraDistance}
          aimRef={aimRef}
          runRef={runRef}
          onMove={net.sendMove}
          transformRef={transformRef}
          transformReadyRef={transformReadyRef}
        />
        <RemotePlayers ids={net.remoteIds} playersRef={net.playersRef} />
      </Canvas>

      {isTouch && <Joystick onMove={setJoystick} />}
      <CameraLook yawRef={cameraYawRef} pitchRef={cameraPitchRef} fullScreen={!isTouch} />
      {isTouch ? (
        <RunButton runRef={runRef} />
      ) : (
        showRunHint && (
        <div
          style={{
            position: "fixed",
            right: "calc(env(safe-area-inset-right, 0px) + 16px)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            zIndex: 5,
            padding: "8px 12px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--line)",
            background: "var(--scrim)",
            color: "var(--ink)",
            fontSize: "var(--t-ui)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          Segure <strong>Shift</strong> para correr
        </div>
        )
      )}
      <Crosshair />
      <TopRightPanel>
        <div style={{ display: "flex", gap: 8 }}>
          <OptionsButton onClick={() => setOptionsOpen(true)} />
          <StoreButton onClick={onOpenStore} />
        </div>
        <SprayButton charges={sprayCharges} maxCharges={SPRAY_CARTRIDGE_SIZE} onSpray={handleSpray} />
        <VehiclePicker
          value={vehicle}
          onChange={setVehicle}
          owned={owned}
          onLocked={onOpenStore}
          loading={entitlementsLoading}
        />
      </TopRightPanel>
      {optionsOpen && !adminOpen && (
        <OptionsModal
          avatar={avatar}
          onSave={(a) => {
            onAvatarChange(a);
            setOptionsOpen(false);
          }}
          onClose={() => setOptionsOpen(false)}
          onExit={onExit}
          onOpenAdmin={isAdmin ? () => setAdminOpen(true) : undefined}
        />
      )}
      {adminOpen && isAdmin && <AdminPanel onClose={() => setAdminOpen(false)} onChanged={onConfigChanged} />}
      <Hud
        enterFocusesChat={!paused && !optionsOpen && !adminOpen}
        online={net.online}
        scores={net.scores}
        chatLog={net.chatLog}
        onChat={net.sendChat}
      />
    </>
  );
}
