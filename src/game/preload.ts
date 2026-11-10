import * as THREE from 'three';
import { BIKE_MODELS, buildCarVisual, CAR_MODELS, loadModel } from './vehicle';
import { loadWeaponModels } from './weapons';
import { preloadAnimations } from './anim';
import { createCharacter, CHARACTERS } from './characters';

/**
 * Pré-carrega tudo o que o jogo usa (carros, motos, armas, animações, personagens) enquanto o jogador
 * está no menu, e desenha uma vez cada modelo fora de vista para compilar shaders e subir texturas à GPU.
 * Assim nada "engasga" na primeira vez que aparece.
 */
export async function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
  try {
    const group = new THREE.Group();
    const models = await Promise.all([...CAR_MODELS, ...BIKE_MODELS].map((m) => loadModel(m).then((src) => buildCarVisual(src, 0xcccccc).group)));
    models.forEach((m, i) => { m.position.x = i * 3 - 12; group.add(m); });
    for (const w of await loadWeaponModels()) group.add(w);
    // um personagem com esqueleto (Carlos) e um sem (qualquer outro)
    for (const name of ['Carlos', CHARACTERS[0]] as const) group.add(await createCharacter(name));
    void preloadAnimations();
    group.traverse((o) => { o.frustumCulled = false; });
    group.position.copy(camera.localToWorld(new THREE.Vector3(0, -2, -10)));
    scene.add(group);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera); // sobe geometrias e texturas
    scene.remove(group);
    // demais personagens: só baixa os arquivos
    for (const name of CHARACTERS) void createCharacter(name).catch(() => undefined);
  } catch (e) {
    console.warn('Pré-carregamento falhou (segue sem ele):', e);
  }
}
