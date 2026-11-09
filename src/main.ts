import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createMap } from './game/map';
import { createCharacter } from './game/characters';
import { readInput, takeLook } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';
import { createHud } from './ui/touch';
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
const net = new Net();
const remotes = new Map<string, RemotePlayer>();

void showLobby().then(async (profile) => {
  createHud();
  const obj = await createCharacter(profile.character);
  obj.position.set(0, 0, 8);
  scene.add(obj);
  player = new Player(obj, await Animator.create(obj));

  try {
    await net.join({ name: profile.name, character: profile.character }, {
      onJoin: (p) => {
        const r = new RemotePlayer(p);
        remotes.set(p.id, r);
        scene.add(r.root);
      },
      onLeave: (id) => {
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
    net.sendMove(p.position.x, p.position.y, p.position.z, p.rotation.y, player.animName, player.carId, performance.now());
  }
  remotes.forEach((r) => r.update(dt));
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
