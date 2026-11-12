import * as THREE from 'three';
import { BIKE_MODELS, buildCarVisual, CAR_MODELS, loadModel, POLICE_LOOK, POLICE_MODEL } from './vehicle';
import { loadWeaponModels } from './weapons';
import { preloadAnimations } from './anim';
import { createCharacter, CHARACTERS } from './characters';

/**
 * Pré-carrega tudo o que o jogo usa (carros, motos, armas, animações, personagens) enquanto o jogador
 * está no menu, e desenha uma vez cada modelo fora de vista para compilar shaders e subir texturas à GPU.
 * Assim nada "engasga" na primeira vez que aparece. Compila com e sem neblina (o menu não tem, o jogo tem).
 */
export async function warmUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gameFog: THREE.Fog | THREE.FogExp2 | null): Promise<void> {
  try {
    const group = new THREE.Group();
    const models = await Promise.all([...CAR_MODELS, POLICE_MODEL, ...BIKE_MODELS].map((m) => loadModel(m).then((src) => buildCarVisual(src, 0xcccccc).group)));
    // também as pinturas que usam shaders próprios (viatura, cores da equipe: pneu, faixa e letreiro): sem isso o shader só compilava na primeira vez que o carro aparecia, e o jogo engasgava
    const painted = await Promise.all([...CAR_MODELS, ...BIKE_MODELS].flatMap((m) => {
      const bike = (BIKE_MODELS as readonly string[]).includes(m);
      const looks = bike ? [{ c1: '#009c3b', c2: '#ffdf00' }] : [POLICE_LOOK, { c1: '#009c3b', c2: '#ffdf00' }];
      return looks.map((look) => loadModel(m).then((src) => buildCarVisual(src, 0xcccccc, look, bike).group));
    }));
    [...models, ...painted].forEach((m, i) => { m.position.x = (i % 14) * 3 - 20; m.position.z = Math.floor(i / 14) * 6; group.add(m); });
    for (const w of await loadWeaponModels()) group.add(w);
    // um personagem com esqueleto (Carlos) e um sem (qualquer outro)
    for (const name of ['Carlos', CHARACTERS[0]] as const) group.add(await createCharacter(name));
    void preloadAnimations();
    group.traverse((o) => { o.frustumCulled = false; });
    group.position.copy(camera.localToWorld(new THREE.Vector3(0, -2, -10)));
    scene.add(group);
    // No menu a cena fica sem neblina, mas no jogo tem: o shader muda com a neblina, então compila também com ela
    // (antes, tudo recompilava na entrada do jogo e a cada carro novo que aparecia: engasgos)
    const menuFog = scene.fog;
    scene.fog = gameFog;
    await renderer.compileAsync(scene, camera);
    scene.fog = menuFog;
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera); // sobe geometrias e texturas
    scene.remove(group);
    // demais personagens: só baixa os arquivos
    for (const name of CHARACTERS) void createCharacter(name).catch(() => undefined);
  } catch (e) {
    console.warn('Pré-carregamento falhou (segue sem ele):', e);
  }
}
