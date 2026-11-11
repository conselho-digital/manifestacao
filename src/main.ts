import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createCity } from './game/city';
import { museumSpawn } from './game/map';
import { createCharacter } from './game/characters';
import { initMouse, readInput, takeLook, type InputState } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';
import { createHud } from './ui/touch';
import type { MobileHud } from './ui/mobile';
import { Animator } from './game/anim';
import { Net } from './net/sync';
import { Voice } from './net/voice';
import { RemotePlayer } from './game/remote';
import { CARS, createCars, updateEngines, updateTraffic } from './game/vehicle';
import { Combat } from './game/combat';
import { WeaponVisual } from './game/weapons';
import { warmUp } from './game/preload';
import { setListener } from './game/audio';

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
void warmUp(renderer, scene, camera);

const clock = new THREE.Clock();
let player: Player | null = null;
let hud: MobileHud | null = null;
let combat: Combat | null = null;
const BASE_FOV = camera.fov;
const net = new Net();
const remotes = new Map<string, RemotePlayer>();
if (import.meta.env.DEV) (window as unknown as { __net: Net; __game: { ready: () => boolean } }).__net = net;
if (import.meta.env.DEV) (window as unknown as { __game: { ready: () => boolean; camera: THREE.PerspectiveCamera } }).__game = { ready: () => !!player, camera };
let profileName = 'Jogador';
// Voz por proximidade (WebRTC): sinalização pelo canal do Supabase; só liga depois do primeiro toque no botão do microfone
const voice = new Voice(net.id, (to, k, d) => net.sendRtc(to, k, d), (state, peers) => {
  hud?.setVoice(state, peers);
  if (state === 'denied') hud?.addChat('Sistema: microfone bloqueado. Libere nas permissões do navegador; você ainda ouve quem está perto.');
});
let lastInput: InputState | null = null;
if (import.meta.env.DEV) (window as unknown as { __voice: () => Voice }).__voice = () => voice;

void showLobby().then(async (profile) => {
  profileName = profile.name;
  inMenu = false;
  scene.fog = menuFog;
  camera.clearViewOffset();
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  hud = createHud(() => { void voice.toggle(); });
  hud.addChat(`Sistema: bem-vindo, ${profile.name}!`);
  const obj = await createCharacter(profile.character);
  // Ponto de partida (?pos=x,z serve para inspecionar o mapa)
  const startQ = new URLSearchParams(location.search).get('pos')?.split(',').map(Number);
  const spawn = museumSpawn(); // em frente ao museu, num ponto aleatório
  obj.position.set(startQ?.[0] ?? spawn[0], 0, startQ?.[1] ?? spawn[1]);
  scene.add(obj);
  player = new Player(obj, await Animator.create(obj));
  player.attachWeapon(new WeaponVisual(obj));
  combat = new Combat({ scene, camera, net, name: profile.name, remotes, log: (t) => hud?.addChat(t) });

  try {
    await net.join({ name: profile.name, character: profile.character }, {
      onJoin: (p) => {
        hud?.addChat(`${p.name}: entrou na arena`);
        const r = new RemotePlayer(p);
        remotes.set(p.id, r);
        scene.add(r.root);
      },
      onLeave: (id) => {
        const who = remotes.get(id)?.info.name;
        if (who) hud?.addChat(`${who}: saiu da arena`);
        remotes.get(id)?.dispose();
        remotes.delete(id);
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
    yaw -= look.dx * 0.006;
    pitch = THREE.MathUtils.clamp(pitch + look.dy * 0.005, PITCH_MIN, PITCH_MAX);
    const dh = player.driveHeading;
    if (dh !== null && Math.abs(player.carSpeed) > 0.8) {
      // Em movimento a câmera fica atrás do carro; parado, dá para olhar para todos os lados
      const d = Math.atan2(Math.sin(dh - yaw), Math.cos(dh - yaw));
      yaw += d * Math.min(1, dt * 2.5);
    }
    const input = readInput();
    lastInput = input;
    combat.update(dt, input, player);
    player.update(dt, input, yaw);
    aimK += ((input.aim && combat.isGun && !player.isDriving ? 1 : 0) - aimK) * Math.min(1, dt * 9);
    player.followCamera(camera, dt, yaw + camOffset, pitch, aimK);
    setListener(player.object.position.x, player.object.position.z, yaw + camOffset); // ouve do personagem, vira com a câmera
    player.setAimPitch(pitch);
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
        weapon: (['ak', 'fist', 'bat', 'pistol', 'sign'] as const)[combat.weapon], weaponName: combat.weaponName,
        mag: combat.mag, reserve: combat.reserve, reloading: combat.reloading,
        aiming: input.aim, crouching: player.isCrouching, dead: combat.dead, respawnIn: combat.respawnIn,
        hitTick: combat.hitTick, hurtTick: combat.hurtTick, nearCar: player.nearCar,
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
      combat.dead ? 'dead' : player.animName, player.isDriving ? player.carId : -1,
      combat.dead ? 0 : player.weaponCode, pitch, performance.now(),
    );
  }
  const blockers: [number, number][] = CARS.filter((c) => c.driver !== null).map((c) => [c.x, c.z]);
  if (player) blockers.push([player.object.position.x, player.object.position.z]);
  remotes.forEach((r) => blockers.push([r.root.position.x, r.root.position.z]));
  updateTraffic(dt, blockers);
  if (player) updateEngines(dt);
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
