import { AVATAR_STORAGE_KEY } from "../ui/AvatarPicker.js";
import { deleteMyAccount } from "../net/account.js";
import { useStageVoice } from "../net/useStageVoice.js";
import { StageButton } from "../ui/StageButton.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { TEAMS, VEHICLES, hexColor, type AvatarConfig, type VehicleId } from "@manifestacao/shared";
import { Scenery } from "./Scenery.js";
import { Player, type PlayerTransform } from "./Player.js";
import { RemotePlayers } from "./RemotePlayers.js";
import { SprayMarks } from "./SprayMarks.js";
import { isTypingTarget, useInput } from "./useInput.js";
import { modelUrlFor } from "./models.js";
import { CAMERA_SHOULDER_RATIO, CAMERA_DISTANCE_MOBILE, CAMERA_DISTANCE_DESKTOP, CAMERA_PITCH_DEFAULT, CAMERA_PIVOT_HEIGHT } from "./world.js";
import { useDailySprays } from "./useDailySprays.js";
import { sprayImageFor } from "./models.js";
import { useAvenueRealtime } from "../net/useAvenueRealtime.js";
import { Joystick } from "../ui/Joystick.js";
import { CameraLook } from "../ui/CameraLook.js";
import { RunButton } from "../ui/RunButton.js";
import { Hud } from "../ui/Hud.js";
import { ActionsMenu } from "../ui/ActionsMenu.js";
import { StoreButton } from "../ui/StoreButton.js";
import { OptionsButton } from "../ui/OptionsButton.js";
import { ChatButton } from "../ui/ChatButton.js";
import { SuperchatBanner } from "../ui/SuperchatBanner.js";
import { SuperchatModal } from "../ui/SuperchatModal.js";
import { SignModal } from "../ui/SignModal.js";
import { useSigns } from "./useSigns.js";
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
/** Quanto tempo quem não comprou bandeira pode carregar a escolhida, contado da conexão. */
const FREE_FLAG_MS = 30 * 60 * 1000;
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
  // Bandeira: quem não comprou nenhuma pode carregar a escolhida por 30 minutos desde que conectou; depois some.
  const ownsPaidFlag = useMemo(() => [...owned].some((id) => id.startsWith("flag:")), [owned]);
  const [freeFlagExpired, setFreeFlagExpired] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFreeFlagExpired(true), FREE_FLAG_MS);
    return () => window.clearTimeout(t);
  }, []);
  const flagAllowed = ownsPaidFlag || !freeFlagExpired;
  const playAvatar = useMemo(
    () => (flagAllowed || avatar.flag === "nenhuma" ? avatar : { ...avatar, flag: "nenhuma" as const }),
    [avatar, flagAllowed],
  );
  // Contexto WebGL perdido (GPU/memória do celular): tenta restaurar; se não voltar logo, recria o canvas.
  const [canvasKey, setCanvasKey] = useState(0);
  const [glLost, setGlLost] = useState(false);
  useEffect(() => {
    if (!glLost) return;
    const t = window.setTimeout(() => {
      setGlLost(false);
      setCanvasKey((k) => k + 1);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [glLost]);
  const net = useAvenueRealtime(playAvatar, signedIn, signId);
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
    const release = () => {
      driveRef.current = { ...driveRef.current, up: false, down: false };
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
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
  const voice = useStageVoice({
    selfId: net.selfId,
    nickname: avatar.nickname,
    posRef: transformRef,
    sendVoice: net.sendVoice,
    voiceHandlerRef: net.voiceHandlerRef,
    blocked: !!mutedNotice,
    isOnline: (id) => net.playersRef.current.has(id),
  });
  // Só true depois do primeiro useFrame do Player — evita que um clique no
  // instante do mount (antes do R3F rodar o primeiro frame) borrife na
  // origem do mundo (0,0) em vez de ignorar o clique.
  const transformReadyRef = useRef(false);

  // Sprays do dia (15 por dia): contador no aparelho — client-trust, como o resto do MVP não autoritativo (CLAUDE.md §4).
  const sprays = useDailySprays();
  const handleSpray = useCallback(() => {
    if (!transformReadyRef.current) return;
    // Gasta ANTES de enviar (a contagem relê o armazenamento: outra aba pode ter gasto); se o envio for descartado
    // pelo cooldown, devolve.
    if (!sprays.spend()) return;
    // Onde a mira (centro da tela) cruza o chão — ver Player.tsx.
    const target = aimRef.current;
    // A marca é a bandeira da equipe (imagem); a cor da equipe é o reserva sem imagem.
    if (!net.sendSpray(target.x, target.z, avatar.shirt, DEFAULT_SPRAY_ID)) sprays.refund();
  }, [net, avatar.shirt, sprays]);

  return (
    <>
      {/* Posição calculada com os mesmos yaw=0/pitch padrão que o Player.tsx
          usa pra orbitar a câmera — evita um salto/giro perceptível da
          câmera logo na entrada, antes do primeiro frame recalcular. */}
      <Canvas
        // Novo `key` = novo canvas e novo contexto WebGL (recuperação quando a GPU derruba o contexto).
        key={canvasKey}
        onCreated={({ gl }) => {
          const el = gl.domElement;
          el.addEventListener("webglcontextlost", (e) => {
            e.preventDefault(); // permite a restauração automática
            setGlLost(true);
          });
          el.addEventListener("webglcontextrestored", () => {
            setGlLost(false);
            setCanvasKey((k) => k + 1);
          });
        }}
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
          flag={playAvatar.flag}
          team={avatar.team}
          character={avatar.character}
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
      {glLost && (
        <div role="status" style={{ position: "fixed", inset: 0, zIndex: 4, display: "grid", placeItems: "center", background: "var(--scrim)", color: "var(--ink)", fontWeight: 700 }}>
          Recuperando a imagem…
        </div>
      )}
      <Crosshair />
      <StageButton voice={voice} blockedNotice={mutedNotice} />
      <TopRightPanel>
        <div style={{ display: "flex", gap: 8 }}>
          <ChatButton open={chatOpen} onClick={() => setChatOpen((o) => !o)} />
          <OptionsButton onClick={() => setOptionsOpen(true)} />
          <StoreButton onClick={onOpenStore} />
        </div>
        <ActionsMenu
          signedIn={signedIn}
          onBillboards={() => setBillboardOpen(true)}
          onSign={() => setSignOpen(true)}
          onSuperchat={() => setSuperchatOpen(true)}
          vehicle={vehicle}
          onVehicle={setVehicle}
          owned={owned}
          onLocked={onOpenStore}
          loading={entitlementsLoading}
        />
        <SprayButton
          charges={sprays.charges}
          maxCharges={sprays.max}
          onSpray={handleSpray}
          imageUrl={sprayImageFor(avatar.team)}
          color={hexColor(TEAMS[avatar.team].color)}
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
          onDeleteAccount={
            signedIn
              ? async () => {
                  await deleteMyAccount();
                  try {
                    localStorage.removeItem(AVATAR_STORAGE_KEY); // a política promete apagar o perfil, inclusive o salvo no aparelho
                  } catch {
                    /* sem acesso ao armazenamento local */
                  }
                  onExit();
                }
              : undefined
          }
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
