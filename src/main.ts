import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createCity } from './game/city';
import { museumSpawn } from './game/map';
import { createCharacter, type CharacterName } from './game/characters';
import { initMouse, readInput, takeLook, type InputState } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';
import { createHud } from './ui/touch';
import type { MobileHud } from './ui/mobile';
import { Animator } from './game/anim';
import { Net } from './net/sync';
import { Voice } from './net/voice';
import { RemotePlayer } from './game/remote';
import { CARS, createCars, despawnPersonal, TRAFFIC, findVehicleSpot, PERSONAL, spawnPersonal, updateEngines, updateTraffic } from './game/vehicle';
import { Combat } from './game/combat';
import { WeaponVisual } from './game/weapons';
import { warmUp } from './game/preload';
import { setListener } from './game/audio';
import { HUD_KEY, Inventory, type WeaponId } from './game/inventory';
import { isAdmin, lookOf, makeTeamRing, saveTeamId, teamById, validTeamId } from './game/teams';
import { loadPrices, loadPurchases } from './game/shop';
import type { PlayerInfo, VehInfo } from './net/sync';
import { createPauseMenu, type PauseMenu } from './ui/pause';

// Endereço oficial: https://gameprotesto.com.br (sem www). Os outros endereços de produção redirecionam para ele
// (o login do Google só vale nele). localhost e prévias da Vercel não são afetados.
const SITE = 'gameprotesto.com.br';
if (['www.' + SITE, 'manifestacao-ten.vercel.app'].includes(location.hostname)) {
  location.replace(`https://${SITE}${location.pathname}${location.search}${location.hash}`);
}

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
handleResize(renderer, camera);
const city = createCity();
scene.add(city);
scene.add(createCars());
initMouse(renderer.domElement);

// Ângulo extra da câmera (para inspecionar de lado): ?camoffset=1.57
const camOffset = Number(new URLSearchParams(location.search).get('camoffset') ?? 0) || 0;
// Vista aérea (inspeção do mapa, como a foto da maquete): ?vista=aerea
const aerial = new URLSearchParams(location.search).get('vista') === 'aerea';
if (aerial) scene.fog = null;
// Câmera fixa de inspeção: ?cam=x,y,z,alvoX,alvoY,alvoZ
const fixedCam = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
let yaw = 0; // câmera olha para +Z
const PITCH_DEFAULT = 0.28; // um pouco de cima (como a referência do GTA SA)
const PITCH_MIN = -0.6; // olhando para cima
const PITCH_MAX = 1.2; // quase vista de cima
let pitch = PITCH_DEFAULT;
let aimK = 0;

// Menu: a cidade inteira vista de cima, girando devagar (sem neblina); ao entrar no jogo volta o normal
const menuFog = scene.fog;
let menuT = 0;
let inMenu = true; // a câmera do menu só vale enquanto o menu está aberto (o deslocamento lateral dela quebrava a câmera do jogo)
if (!aerial) scene.fog = null;
function menuCamera(dt: number): void {
  menuT += dt;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  const ang = menuT * 0.05; // uma volta em ~2 min
  const dist = aspect < 1 ? 300 : 205; // cabe a cidade (220 x 168 m) inteira
  const elev = 1.2; // ~70° de cima: dá para ver as ruas e a avenida
  camera.position.set(Math.sin(ang) * dist * 0.4, dist * Math.sin(elev), Math.cos(ang) * dist * 0.4);
  camera.lookAt(0, 0, 0);
  // em tela larga o cartão do menu fica à esquerda: a cidade desloca para a direita
  if (aspect > 1.3) camera.setViewOffset(w, h, -w * 0.18, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const sun = scene.userData.sun as THREE.DirectionalLight;
  sun.position.set(40, 80, 30);
  sun.target.position.set(0, 0, 0);
}

// No menu: pré-carrega e aquece o mapa, os veículos e as armas para o jogo não engasgar
// No menu a cidade é desenhada sem recalcular sombras e com resolução 1x (mais leve); o jogo volta ao normal ao entrar
const GAME_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2);
void warmUp(renderer, scene, camera).then(() => {
  if (!inMenu) return;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(1);
});

const clock = new THREE.Clock();
let player: Player | null = null;
let hud: MobileHud | null = null;
let combat: Combat | null = null;
const BASE_FOV = camera.fov;
const net = new Net();
const remotes = new Map<string, RemotePlayer>();
if (import.meta.env.DEV) (window as unknown as { __net: Net; __game: { ready: () => boolean } }).__net = net;
if (import.meta.env.DEV) (window as unknown as { __game: { ready: () => boolean; camera: THREE.PerspectiveCamera; scene: THREE.Scene; combat: () => Combat | null; player: () => Player | null; sim: { TRAFFIC: typeof TRAFFIC; CARS: typeof CARS; updateTraffic: typeof updateTraffic; spawnPersonal: typeof spawnPersonal } } }).__game = { ready: () => !!player, camera, scene, combat: () => combat, player: () => player, sim: { TRAFFIC, CARS, updateTraffic, spawnPersonal } };
let profileName = 'Jogador';
// Voz por proximidade (WebRTC): sinalização pelo canal do Supabase; só liga depois do primeiro toque no botão do microfone
const voice = new Voice(net.id, (to, k, d) => net.sendRtc(to, k, d), (state, peers) => {
  hud?.setVoice(state, peers);
  if (state === 'denied') hud?.addChat('Sistema: microfone bloqueado. Libere nas permissões do navegador; você ainda ouve quem está perto.');
});
let lastInput: InputState | null = null;
if (import.meta.env.DEV) (window as unknown as { __voice: () => Voice }).__voice = () => voice;

// ---------- equipe, personagem, pausa e loja ----------
const inv = new Inventory();
let character: CharacterName = 'Carlos';
let teamId = '';
let myRing: THREE.Group = makeTeamRing(null);
let pauseMenu: PauseMenu | null = null;
let paused = false;
const myLook = (): ReturnType<typeof lookOf> => lookOf(teamById(teamId));

/** Monta o personagem local (modelo, animador, arma e anel da equipe). `from` = o jogador anterior (troca de personagem). */
async function makePlayer(name: CharacterName, from?: Player): Promise<Player> {
  const obj = await createCharacter(name);
  if (from) {
    obj.position.copy(from.object.position);
    obj.rotation.copy(from.object.rotation);
  }
  scene.add(obj);
  const p = new Player(obj, await Animator.create(obj));
  p.attachWeapon(new WeaponVisual(obj));
  if (from) p.setHeading(from.object.rotation.y);
  myRing.removeFromParent();
  myRing = makeTeamRing(myLook());
  obj.add(myRing);
  return p;
}

const saveCharacter = (): void => {
  try {
    const raw = JSON.parse(localStorage.getItem('arena-profile') ?? '{}') as Record<string, unknown>;
    localStorage.setItem('arena-profile', JSON.stringify({ ...raw, character }));
  } catch { /* sem armazenamento */ }
};

/** Cores do meu veículo: as da equipe, ou cinza e preto sem equipe. */
const myPaint = (): { c1: string; c2: string } => {
  const t = teamById(teamId);
  return t ? { c1: t.c1, c2: t.c2 } : { c1: '#c8ccd2', c2: '#2b2e33' };
};

/** Meu veículo pessoal (o que chamei na Garagem), para a presence: modelo, cores, equipe e onde está parado. */
function myVehInfo(): VehInfo | null {
  const c = PERSONAL.get(net.id);
  if (!c || !c.model) return null;
  const pt = myPaint();
  return { m: c.model, c1: pt.c1, c2: pt.c2, t: teamId, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, h: Math.round(c.heading * 100) / 100 };
}

/** Avisa os outros e refaz o anel quando a equipe, o personagem ou o veículo mudam. */
function announceMe(): void {
  net.updateMe({ name: profileName, character, team: myLook(), veh: myVehInfo() });
}

/** Chama o veículo pessoal para perto de mim (troca o que já existe). Retorna a mensagem de erro, se houver. */
function callVehicle(model: string): string {
  if (!player) return 'Entre no jogo primeiro.';
  if (!inv.hasVehicle(model)) return 'Você não tem este veículo.';
  if (player.isDriving) return 'Saia do veículo antes de chamar outro.';
  const old = PERSONAL.get(net.id);
  if (old && old.driver !== null) return 'Seu veículo está em uso por alguém da equipe.';
  const o = player.object;
  const spot = findVehicleSpot(o.position.x, o.position.z, o.rotation.y);
  const pt = myPaint();
  if (old && old.model !== model) despawnPersonal(net.id);
  spawnPersonal(net.id, model, pt, teamId, spot.x, spot.z, o.rotation.y);
  announceMe();
  return '';
}

function parkVehicle(): void {
  const c = PERSONAL.get(net.id);
  if (c && c.driver !== null) return;
  despawnPersonal(net.id);
  announceMe();
}

/** Veículo pessoal de outro jogador (vindo da presence): cria, move ou some. */
function syncRemoteVehicle(p: PlayerInfo): void {
  if (!p.veh) { despawnPersonal(p.id); return; }
  const v = p.veh;
  spawnPersonal(p.id, v.m, { c1: v.c1, c2: v.c2 }, v.t, v.x, v.z, v.h);
}

function setMyTeam(id: string): void {
  teamId = id;
  saveTeamId(id);
  myRing.removeFromParent();
  myRing = makeTeamRing(myLook());
  player?.object.add(myRing);
  const mine = PERSONAL.get(net.id);
  if (mine) { mine.teamId = id; mine.recolor(myPaint()); }
  announceMe();
  hud?.addChat(`Sistema: ${teamById(id) ? `equipe ${teamById(id)!.name}` : 'sem equipe'}.`);
}

let lastDenied = 0;
/** Liga ao jogador local as regras de veículo (quem pode entrar), o aviso ao sair e o atropelamento. */
function wirePlayer(p: Player): void {
  p.onRunOver = (sp) => combat?.vehicleHit(sp) ?? true;
  p.enterRule = (c) => !c.ownerId || c.ownerId === net.id || (!!c.teamId && c.teamId === teamId);
  p.onEnterDenied = () => {
    if (performance.now() - lastDenied < 3000) return;
    lastDenied = performance.now();
    hud?.addChat('Sistema: este veículo é de outra equipe.');
  };
  p.onExitCar = (c) => { if (c.ownerId === net.id) announceMe(); };
}

async function setMyCharacter(name: CharacterName): Promise<void> {
  if (!player || name === character) return;
  if (player.isDriving) { hud?.addChat('Sistema: saia do veículo para trocar de personagem.'); return; }
  const old = player;
  const next = await makePlayer(name, old);
  wirePlayer(next);
  old.object.removeFromParent();
  player = next;
  character = name;
  saveCharacter();
  announceMe();
}

void showLobby().then(async (profile) => {
  profileName = profile.name;
  character = profile.character;
  teamId = validTeamId(profile.team);
  inv.load(profile.userId);
  inMenu = false;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  renderer.setPixelRatio(GAME_PIXEL_RATIO);
  scene.fog = menuFog;
  camera.clearViewOffset();
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  hud = createHud({ onVoiceToggle: () => { void voice.toggle(); }, onPause: () => pauseMenu?.open() });
  hud.addChat(`Sistema: bem-vindo, ${profile.name}!`);
  // Ponto de partida (?pos=x,z serve para inspecionar o mapa)
  const startQ = new URLSearchParams(location.search).get('pos')?.split(',').map(Number);
  const spawn = museumSpawn(); // em frente ao museu, num ponto aleatório
  const first = await createCharacter(profile.character);
  first.position.set(startQ?.[0] ?? spawn[0], 0, startQ?.[1] ?? spawn[1]);
  scene.add(first);
  player = new Player(first, await Animator.create(first));
  player.attachWeapon(new WeaponVisual(first));
  myRing = makeTeamRing(myLook());
  first.add(myRing);
  await Promise.all([loadPrices(), isAdmin().then((a) => loadPurchases(inv, a))]);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('admin')) inv.admin = true; // só para testar no npm run dev
  combat = new Combat({ scene, camera, net, name: profile.name, remotes, log: (t) => hud?.addChat(t), inv });
  wirePlayer(player);

  pauseMenu = createPauseMenu({
    inv,
    getTeamId: () => teamId,
    setTeam: setMyTeam,
    getCharacter: () => character,
    setCharacter: (n) => { void setMyCharacter(n); },
    currentWeapon: () => (combat?.weapon ?? 1) as WeaponId,
    protectLeft: () => combat?.protectT ?? 0,
    equip: (w) => combat?.equip(w),
    ammoOf: (w) => combat?.ammoOf(w) ?? { mag: 0, reserve: 0 },
    buy: (item) => combat?.buy(item) ?? { ok: false, msg: 'Indisponível.' },
    garage: { current: () => PERSONAL.get(net.id)?.model ?? '', call: callVehicle, park: parkVehicle },
    onToggle: (open) => {
      paused = open;
      if (combat) combat.paused = open;
      if (!open) readInput(); // descarta toques/teclas de enquanto estava pausado
    },
    onTeamsChanged: () => {
      setMyTeam(validTeamId(teamId));
    },
  });
  if (import.meta.env.DEV) (window as unknown as { __pause: PauseMenu }).__pause = pauseMenu;

  try {
    await net.join({ name: profile.name, character: profile.character, team: myLook(), veh: myVehInfo() }, {
      onJoin: (p) => {
        syncRemoteVehicle(p);
        hud?.addChat(`${p.name}: entrou na arena`);
        const r = new RemotePlayer(p);
        remotes.set(p.id, r);
        scene.add(r.root);
      },
      onUpdate: (p) => {
        syncRemoteVehicle(p);
        const r = remotes.get(p.id);
        if (!r) return;
        if (r.info.character !== p.character) {
          // trocou de personagem: refaz o boneco no mesmo lugar
          const nr = new RemotePlayer(p);
          nr.adopt(r);
          r.dispose();
          remotes.set(p.id, nr);
          scene.add(nr.root);
        } else r.setTeam(p.team);
      },
      onLeave: (id) => {
        const who = remotes.get(id)?.info.name;
        if (who) hud?.addChat(`${who}: saiu da arena`);
        remotes.get(id)?.dispose();
        remotes.delete(id);
        despawnPersonal(id);
        voice.leave(id);
      },
      onMove: (m) => remotes.get(m.id)?.setTarget(m),
      onShot: (m) => combat?.onShot(m),
      onKill: (m) => combat?.onKill(m),
      onChat: (m) => {
        const who = remotes.get(m.id)?.info.name;
        if (who) hud?.addChat(`${who}: ${m.t}`);
      },
      onRtc: (m) => void voice.onSignal(m),
    });
  } catch (e) {
    console.warn('Multiplayer indisponível, jogando offline:', e);
  }
});

function loop(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (inMenu) menuCamera(dt);
  if (player && combat) {
    const look = takeLook();
    const input = readInput();
    lastInput = input;
    if (!paused) {
      yaw -= look.dx * 0.006;
      pitch = THREE.MathUtils.clamp(pitch + look.dy * 0.005, PITCH_MIN, PITCH_MAX);
      const dh = player.driveHeading;
      if (dh !== null && Math.abs(player.carSpeed) > 0.8) {
        // Em movimento a câmera fica atrás do carro; parado, dá para olhar para todos os lados
        const d = Math.atan2(Math.sin(dh - yaw), Math.cos(dh - yaw));
        yaw += d * Math.min(1, dt * 2.5);
      }
      combat.update(dt, input, player);
      player.update(dt, input, yaw);
      aimK += ((input.aim && combat.isGun && !player.isDriving ? 1 : 0) - aimK) * Math.min(1, dt * 9);
      player.followCamera(camera, dt, yaw + camOffset, pitch, aimK);
      setListener(player.object.position.x, player.object.position.z, yaw + camOffset); // ouve do personagem, vira com a câmera
      player.setAimPitch(pitch);
    }
    myRing.visible = !!myLook() && !player.isDriving;
    if (aerial) {
      camera.position.set(0, 150, -200);
      camera.lookAt(0, 0, 8);
    }
    if (fixedCam && fixedCam.length === 6 && fixedCam.every(Number.isFinite)) {
      camera.position.set(fixedCam[0]!, fixedCam[1]!, fixedCam[2]!);
      camera.lookAt(fixedCam[3]!, fixedCam[4]!, fixedCam[5]!);
    }
    const p = player.object;
    const sun = scene.userData.sun as THREE.DirectionalLight;
    sun.position.set(p.position.x + 35, 70, p.position.z + 25);
    sun.target.position.set(p.position.x, 0, p.position.z);
    if (hud) {
      const my = combat.myStats;
      hud.update({
        name: profileName,
        x: p.position.x, z: p.position.z, yaw,
        driving: player.isDriving,
        bike: player.isBike,
        kmh: Math.abs(player.carSpeed) * 3.6,
        remotes: [...remotes.values()].map((r) => ({ name: r.info.name, x: r.root.position.x, z: r.root.position.z })),
        players: remotes.size + 1, maxPlayers: 30,
        health: combat.health, armor: combat.armor, money: combat.money,
        weapon: HUD_KEY[combat.weapon], weaponName: combat.weaponName,
        mag: combat.mag, reserve: combat.reserve, reloading: combat.reloading,
        aiming: input.aim, crouching: player.isCrouching, dead: combat.dead, respawnIn: combat.respawnIn,
        hitTick: combat.hitTick, hurtTick: combat.hurtTick, nearCar: player.nearCar, protect: combat.protectT,
        scores: combat.statRows().map((r) => ({ name: r.name, k: r.k, d: r.d, me: r.id === my.id })),
      }, dt);
    }
    // Mira: aproxima a câmera suavemente
    const fov = lastInput?.aim && combat.isGun ? BASE_FOV * 0.7 : BASE_FOV;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    net.sendMove(
      p.position.x, p.position.y, p.position.z, p.rotation.y,
      combat.dead ? 'dead' : player.animName, player.isDriving ? player.carId : -1, player.isDriving ? player.carOwner : '',
      combat.dead ? 0 : player.weaponCode, pitch, combat.health, combat.protectT > 0, performance.now(),
    );
  }
  // quem barra o trânsito: veículos em uso (as duas pontas), jogadores; os parados na pista são contornados
  const blockers: [number, number][] = [];
  const parkedCars: [number, number][] = [];
  for (const c of CARS) for (const [cx, cz] of c.circles()) (c.driver !== null ? blockers : parkedCars).push([cx, cz]);
  if (player) blockers.push([player.object.position.x, player.object.position.z]);
  remotes.forEach((r) => blockers.push([r.root.position.x, r.root.position.z]));
  updateTraffic(paused ? 0 : dt, blockers, parkedCars);
  if (player) updateEngines(paused ? 0 : dt);
  remotes.forEach((r) => r.update(dt));
  if (player) {
    const others = new Map<string, { x: number; z: number }>();
    remotes.forEach((r, id) => others.set(id, { x: r.root.position.x, z: r.root.position.z }));
    voice.update(dt, { x: player.object.position.x, z: player.object.position.z }, others);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
