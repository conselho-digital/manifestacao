import { createCamera, createRenderer, createScene, handleResize } from './game/scene';
import { createMap } from './game/map';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
handleResize(renderer, camera);

scene.add(createMap());

function loop(): void {
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
