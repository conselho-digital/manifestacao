import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createMap } from './game/map';
import { createCharacter } from './game/characters';
import { readInput } from './game/input';
import { Player } from './game/player';
import { showLobby } from './ui/lobby';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
handleResize(renderer, camera);
scene.add(createMap());

let yaw = 0; // câmera olha para +Z
window.addEventListener('mousemove', (e) => {
  if (e.buttons & 1) yaw -= e.movementX * 0.005;
});

const clock = new THREE.Clock();
let player: Player | null = null;

void showLobby().then(async (profile) => {
  const obj = await createCharacter(profile.character);
  obj.position.set(0, 0, 8);
  scene.add(obj);
  player = new Player(obj);
});

function loop(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (player) {
    player.update(dt, readInput(), yaw);
    player.followCamera(camera, dt, yaw);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
