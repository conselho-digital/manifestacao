import * as THREE from 'three';
import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createMap } from './game/map';
import { createCharacter, type CharacterName } from './game/characters';
import { readInput } from './game/input';
import { Player } from './game/player';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
handleResize(renderer, camera);
scene.add(createMap());

// Personagem escolhido via ?char=Nome (temporário, até a tela de seleção)
const param = new URLSearchParams(location.search).get('char') ?? 'Helena';
const charName = param as CharacterName;

let yaw = 0; // câmera olha para +Z
window.addEventListener('mousemove', (e) => {
  if (e.buttons & 1) yaw -= e.movementX * 0.005;
});

const clock = new THREE.Clock();
let player: Player | null = null;

createCharacter(charName).then((obj) => {
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
