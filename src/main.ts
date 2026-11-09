import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createMap } from './game/map';
import { createCharacter } from './game/characters';
import { readInput, takeLook } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';
import { createHud } from './ui/touch';
import type { MobileHud } from './ui/mobile';
import { Animator } from './game/anim';
import { Net } from './net/sync';
import { RemotePlayer } from './game/remote';
import { createCars } from './game/vehicle';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
handleResize(renderer, camera);
scene.add(createMap());
scene.add(createCars());

// Ângulo extra da câmera (para inspecionar de lado): ?camoffset=1.57
const camOffset = Number(new URLSearchParams(location.search).get('camoffset') ?? 0) || 0;
let yaw = 0; // câmera olha para +Z
window.addEventListener('mousemove', (e) => {
  if (e.buttons & 1) yaw -= e.movementX * 0.005;
});

const clock = new THREE.Clock();
let player: Player | null = null;
let hud: MobileHud | null = null;
const BASE_FOV = camera.fov;
const net = new Net();
const remotes = new Map<string, RemotePlayer>();
let profileName = 'Jogador';

void showLobby().then(async (profile) => {
  profileName = profile.name;
  hud = createHud();
  hud?.addChat(`Sistema: bem-vindo, ${profile.name}!`);
  const obj = await createCharacter(profile.character);
  obj.position.set(0, 0, 8);
  scene.add(obj);
  player = new Player(obj, await Animator.create(obj));

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
    });
  } catch (e) {
    console.warn('Multiplayer indisponível, jogando offline:', e);
  }
});

function loop(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (player) {
    yaw -= takeLook() * 0.006;
    const dh = player.driveHeading;
    if (dh !== null) {
      // No carro a câmera fica atrás dele
      const d = Math.atan2(Math.sin(dh - yaw), Math.cos(dh - yaw));
      yaw += d * Math.min(1, dt * 2.5);
    }
    player.update(dt, readInput(), yaw);
    player.followCamera(camera, dt, yaw + camOffset);
    const p = player.object;
    if (hud) {
      hud.update({
        name: profileName,
        x: p.position.x, z: p.position.z, yaw,
        driving: player.carId >= 0,
        remotes: [...remotes.values()].map((r) => ({ name: r.info.name, x: r.root.position.x, z: r.root.position.z })),
        players: remotes.size + 1, maxPlayers: 30,
      }, dt);
      // Mira: aproxima a câmera suavemente
      const fov = hud.aiming ? BASE_FOV * 0.7 : BASE_FOV;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
        camera.updateProjectionMatrix();
      }
    }
    net.sendMove(p.position.x, p.position.y, p.position.z, p.rotation.y, player.animName, player.carId, performance.now());
  }
  remotes.forEach((r) => r.update(dt));
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
