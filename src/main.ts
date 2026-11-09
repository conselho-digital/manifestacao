import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createCity, updateCity } from './game/city';
import { createCharacter } from './game/characters';
import { initMouse, readInput, takeLook, type InputState } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';
import { createHud } from './ui/touch';
import type { MobileHud } from './ui/mobile';
import { Animator } from './game/anim';
import { cleanChat, Net } from './net/sync';
import { RemotePlayer } from './game/remote';
import { createCars } from './game/vehicle';
import { Combat } from './game/combat';
import { WeaponVisual } from './game/weapons';

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
const PITCH_DEFAULT = 0.2; // um pouco de cima
const PITCH_MIN = -0.6; // olhando para cima
const PITCH_MAX = 1.2; // quase vista de cima
let pitch = PITCH_DEFAULT;
let aimK = 0;

const clock = new THREE.Clock();
let player: Player | null = null;
let hud: MobileHud | null = null;
let combat: Combat | null = null;
const BASE_FOV = camera.fov;
const net = new Net();
const remotes = new Map<string, RemotePlayer>();
let profileName = 'Jogador';
let lastInput: InputState | null = null;

void showLobby().then(async (profile) => {
  profileName = profile.name;
  hud = createHud((text) => {
    net.sendChat(text);
    const t = cleanChat(text);
    if (t) hud?.addChat(`${profileName}: ${t}`);
  });
  hud.addChat(`Sistema: bem-vindo, ${profile.name}!`);
  const obj = await createCharacter(profile.character);
  // Ponto de partida (?pos=x,z serve para inspecionar o mapa)
  const startQ = new URLSearchParams(location.search).get('pos')?.split(',').map(Number);
  obj.position.set(startQ?.[0] ?? 25, 0, startQ?.[1] ?? 16);
  scene.add(obj);
  player = new Player(obj, await Animator.create(obj));
  player.weaponVis = new WeaponVisual(obj);
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
      },
      onMove: (m) => remotes.get(m.id)?.setTarget(m),
      onShot: (m) => combat?.onShot(m),
      onKill: (m) => combat?.onKill(m),
      onChat: (m) => {
        const who = remotes.get(m.id)?.info.name;
        if (who) hud?.addChat(`${who}: ${m.t}`);
      },
    });
  } catch (e) {
    console.warn('Multiplayer indisponível, jogando offline:', e);
  }
});

function loop(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (player && combat) {
    const look = takeLook();
    yaw -= look.dx * 0.006;
    pitch = THREE.MathUtils.clamp(pitch + look.dy * 0.005, PITCH_MIN, PITCH_MAX);
    const dh = player.driveHeading;
    if (dh !== null) {
      // No carro a câmera fica atrás dele
      const d = Math.atan2(Math.sin(dh - yaw), Math.cos(dh - yaw));
      yaw += d * Math.min(1, dt * 2.5);
    }
    const input = readInput();
    lastInput = input;
    combat.update(dt, input, player);
    player.update(dt, input, yaw);
    aimK += ((input.aim && combat.weapon === 0 && !player.isDriving ? 1 : 0) - aimK) * Math.min(1, dt * 9);
    player.followCamera(camera, dt, yaw + camOffset, pitch, aimK);
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
        kmh: Math.abs(player.carSpeed) * 3.6,
        remotes: [...remotes.values()].map((r) => ({ name: r.info.name, x: r.root.position.x, z: r.root.position.z })),
        players: remotes.size + 1, maxPlayers: 30,
        health: combat.health, armor: combat.armor, money: combat.money,
        weapon: combat.weapon === 0 ? 'ak' : 'fist', weaponName: combat.weaponName,
        mag: combat.mag, reserve: combat.reserve, reloading: combat.reloading,
        aiming: input.aim, dead: combat.dead, respawnIn: combat.respawnIn,
        hitTick: combat.hitTick, hurtTick: combat.hurtTick, nearCar: player.nearCar,
        scores: combat.statRows().map((r) => ({ name: r.name, k: r.k, d: r.d, me: r.id === my.id })),
      }, dt);
    }
    // Mira: aproxima a câmera suavemente
    const fov = lastInput?.aim && combat.weapon === 0 ? BASE_FOV * 0.7 : BASE_FOV;
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
  updateCity(dt);
  remotes.forEach((r) => r.update(dt));
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
