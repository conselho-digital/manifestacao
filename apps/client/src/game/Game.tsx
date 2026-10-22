import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { VEHICLES, type AvatarConfig, type VehicleId } from "@manifestacao/shared";
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
import { ChatButton } from "../ui/ChatButton.js";
import { SuperchatButton } from "../ui/SuperchatButton.js";
import { SuperchatBanner } from "../ui/SuperchatBanner.js";
import { SuperchatModal } from "../ui/SuperchatModal.js";
import { SignButton } from "../ui/SignButton.js";
import { SignModal } from "../ui/SignModal.js";
import { useSigns } from "./useSigns.js";
import { PromoteMenu } from "../ui/PromoteMenu.js";
import { BillboardButton } from "../ui/BillboardButton.js";
import { BillboardModal } from "../ui/BillboardModal.js";
import { Billboards } from "./Billboards.js";
import { useBillboards } from "./useBillboards.js";
import {
  graphicsDpr,
  loadGraphics,
  saveGraphics,
  type GraphicsLevel,
} from "../config/graphics.js";
import { OptionsModal } from "../ui/OptionsModal.js";
import { AdminPanel } from "../ui/AdminPanel.js";
import { DEFAULT_SPRAY_ID } from "../config/sprays.js";
import { SprayButton } from "../ui/SprayButton.js";
import { TopRightPanel } from "../ui/TopRightPanel.js";
import { Crosshair } from "../ui/Crosshair.js";
import { useIsTouch } from "../ui/useIsTouch.js";
import { hasVehicleViaPremium, vehicleRequiresEntitlement } from "@manifestacao/shared";
import { DriveControls } from "../ui/DriveControls.js";
import { NO_DRIVE_INPUT, type DriveInput } from "./driving.js";

const SIGN_KEY = "manifestacao.sign";
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
  /** Aviso de conta silenciada (chat desativado); null = pode conversar. */
  mutedNotice?: string | null;
}

/**
 * Cena de jogo: avenida 3D, jogador local, jogadores remotos (Realtime),
 * HUD (placar + chat), seletor de veículo, spray e joystick de toque.
 * Sessão/loja não vivem aqui — ver App.tsx.
 */
export function Game({ avatar, owned, onOpenStore, paused, entitlementsLoading, onAvatarChange, onExit, isAdmin, signedIn, onConfigChanged, mutedNotice = null }: GameProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [graphics, setGraphics] = useState<GraphicsLevel>(loadGraphics);
  const chooseGraphics = (l: GraphicsLevel) => {
    setGraphics(l);
    saveGraphics(l);
  };
  const [adminOpen, setAdminOpen] = useState(false);
  const [superchatOpen, setSuperchatOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [billboardOpen, setBillboardOpen] = useState(false);
  // Cartaz que o jogador carrega (id salvo no aparelho; o texto vem do banco, só se estiver ativo).
  const [signId, setSignId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SIGN_KEY);
    } catch {
      return null;
    }
  });
  const equipSign = (id: string | null) => {
    setSignId(id);
    try {
      if (id) localStorage.setItem(SIGN_KEY, id);
      else localStorage.removeItem(SIGN_KEY);
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  };
  const [vehicle, setVehicle] = useState<VehicleId>("nenhum");
  // Pausa o movimento por teclado enquanto a loja (renderizada por cima,
  // em App.tsx) está aberta. O joystick já fica coberto pelo overlay da
  // loja (zIndex maior), então só o teclado precisa dessa trava explícita.
  const modalOpen = paused || optionsOpen || adminOpen || superchatOpen || signOpen || billboardOpen;
  useEffect(() => {
    document.body.toggleAttribute("data-modal-open", modalOpen);
    return () => document.body.removeAttribute("data-modal-open");
  }, [modalOpen]);
  const { inputRef, setJoystick } = useInput(!paused && !optionsOpen && !adminOpen && !superchatOpen && !signOpen && !billboardOpen);
  const net = useAvenueRealtime(avatar, signedIn, signId);
  const isTouch = useIsTouch();
  const signs = useSigns(net.remoteIds, net.playersRef, signId);
  const billboardAds = useBillboards(signedIn);

  // Ângulo/inclinação da câmera (controlados pelo arrasto na metade direita
  // da tela) e estado do botão de correr — lidos a cada frame pelo Player,
  // sem passar por re-render do React.
  const cameraYawRef = useRef(0);
  const cameraPitchRef = useRef(CAMERA_PITCH_DEFAULT);
  const runRef = useRef(false);
  // Direção: botões na tela escrevem em driveRef; wheelieRef (moto empinada) é só leitura do desenho.
  const driveRef = useRef<DriveInput>(NO_DRIVE_INPUT);
  const wheelieRef = useRef(0);
  const cameraTouchedAtRef = useRef(0);
  const vehicleKind = VEHICLES[vehicle]?.kind ?? "foot";
  const driving = vehicleKind !== "foot";
  // PC: Q empina e E abaixa a roda da frente da moto (W S A D / setas já vêm do useInput).
  useEffect(() => {
    if (vehicleKind !== "moto") return;
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "q") driveRef.current = { ...driveRef.current, up: down };
      else if (k === "e") driveRef.current = { ...driveRef.current, down: down };
    };
    const onDown = key(true);
    const onUp = key(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      driveRef.current = { ...driveRef.current, up: false, down: false };
    };
  }, [vehicleKind]);
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
    // A marca é a bandeira da equipe (imagem); a cor da equipe é o reserva sem imagem.
    if (net.sendSpray(target.x, target.z, avatar.shirt, DEFAULT_SPRAY_ID)) {
      setSprayCharges((c) => Math.max(0, c - 1));
    }
  }, [net, avatar.shirt]);

  return (
    <>
      {/* Posição calculada com os mesmos yaw=0/pitch padrão que o Player.tsx
          usa pra orbitar a câmera — evita um salto/giro perceptível da
          câmera logo na entrada, antes do primeiro frame recalcular. */}
      <Canvas
        // Contexto de empilhamento próprio: nada de dentro do canvas (nomes) passa por cima de menus.
        style={{ zIndex: 0 }}
        shadows
        dpr={graphicsDpr(graphics)}
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
        <fog attach="fog" args={[SKY_COLOR, 70, 260]} />
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
          team={avatar.team}
          sign={signId ? signs.get(signId) ?? null : null}
          vehicle={vehicle}
          modelUrl={modelUrlFor(avatar.character, avatar.team)}
          inputRef={inputRef}
          cameraYawRef={cameraYawRef}
          cameraPitchRef={cameraPitchRef}
          cameraDistance={cameraDistance}
          aimRef={aimRef}
          runRef={runRef}
          onMove={net.sendMove}
          driveRef={driveRef}
          wheelieRef={wheelieRef}
          cameraTouchedAtRef={cameraTouchedAtRef}
          transformRef={transformRef}
          transformReadyRef={transformReadyRef}
        />
        <RemotePlayers ids={net.remoteIds} playersRef={net.playersRef} signs={signs} />
        <Billboards ads={billboardAds} />
      </Canvas>

      {isTouch && !driving && <Joystick onMove={setJoystick} />}
      {isTouch && vehicleKind !== "foot" && <DriveControls kind={vehicleKind} driveRef={driveRef} />}
      {/* Tela toda gira a câmera; o Joystick (z-index maior) só captura o toque dentro da própria área. */}
      <CameraLook yawRef={cameraYawRef} pitchRef={cameraPitchRef} touchedAtRef={cameraTouchedAtRef} fullScreen />
      {isTouch ? (
        !driving && <RunButton runRef={runRef} />
      ) : driving ? (
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
          <strong>W</strong> acelera · <strong>S</strong> freia · <strong>A</strong>/<strong>D</strong> viram
          {vehicleKind === "moto" && (
            <>
              {" "}
              · <strong>Q</strong>/<strong>E</strong> empina
            </>
          )}
        </div>
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
          <ChatButton open={chatOpen} onClick={() => setChatOpen((o) => !o)} />
          <OptionsButton onClick={() => setOptionsOpen(true)} />
          <StoreButton onClick={onOpenStore} />
        </div>
        {signedIn &&
          (isTouch ? (
            // Celular: um botão "Divulgar" com a fileira de opções (poupa espaço no canto).
            <PromoteMenu
              onBillboards={() => setBillboardOpen(true)}
              onSign={() => setSignOpen(true)}
              onSuperchat={() => setSuperchatOpen(true)}
            />
          ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <BillboardButton onClick={() => setBillboardOpen(true)} />
            <SignButton onClick={() => setSignOpen(true)} />
            <SuperchatButton onClick={() => setSuperchatOpen(true)} />
          </div>
          ))}
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
          graphics={graphics}
          onGraphics={chooseGraphics}
          onOpenAdmin={isAdmin ? () => setAdminOpen(true) : undefined}
        />
      )}
      {superchatOpen && signedIn && <SuperchatModal defaultName={avatar.nickname} isAdmin={isAdmin} onClose={() => setSuperchatOpen(false)} />}
      {billboardOpen && signedIn && <BillboardModal ads={billboardAds} isAdmin={isAdmin} onClose={() => setBillboardOpen(false)} />}
      {signOpen && signedIn && <SignModal equippedId={signId} onEquip={equipSign} isAdmin={isAdmin} onClose={() => setSignOpen(false)} />}
      <SuperchatBanner enabled={signedIn} />
      {adminOpen && isAdmin && <AdminPanel onClose={() => setAdminOpen(false)} onChanged={onConfigChanged} />}
      <Hud
        enterFocusesChat={!paused && !optionsOpen && !adminOpen && !superchatOpen && !signOpen && !billboardOpen}
        online={net.online}
        scores={net.scores}
        chatLog={net.chatLog}
        onChat={net.sendChat}
        mutedNotice={mutedNotice}
        chatOpen={chatOpen}
        onChatOpenChange={setChatOpen}
      />
    </>
  );
}
