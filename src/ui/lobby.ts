import * as THREE from 'three';
import { enterLandscape } from './orientation';
import { CHARACTERS, createCharacter, type CharacterName } from '../game/characters';

export interface Profile {
  name: string;
  character: CharacterName;
}

const STORAGE_KEY = 'arena-profile';
const MAX_NAME = 16;

function loadSaved(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Profile>;
    const character = CHARACTERS.includes(raw.character as CharacterName)
      ? (raw.character as CharacterName)
      : CHARACTERS[0];
    return { name: (raw.name ?? '').slice(0, MAX_NAME), character };
  } catch {
    return { name: '', character: CHARACTERS[0] };
  }
}

const CSS = `
.lobby{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(#2b3a55,#1b1f2a);font-family:system-ui,sans-serif;color:#fff;z-index:10;padding:12px;box-sizing:border-box}
.lobby *{box-sizing:border-box}
.lobby-card{width:min(720px,100%);max-height:100%;overflow:auto;background:#262c3b;border-radius:16px;padding:20px;
  display:grid;grid-template-columns:200px 1fr;gap:20px}
.lobby h1{grid-column:1/-1;margin:0;font-size:24px}
.lobby canvas{width:200px;height:260px;border-radius:12px;background:#1b1f2a}
.lobby label{display:block;font-size:13px;opacity:.8;margin-bottom:6px}
.lobby input{width:100%;padding:12px;font-size:16px;border-radius:8px;border:2px solid #3b4358;background:#1b1f2a;color:#fff}
.lobby-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0;max-height:240px;overflow:auto}
.lobby-grid button{padding:10px 4px;font-size:13px;border-radius:8px;border:2px solid #3b4358;background:#1b1f2a;color:#fff;cursor:pointer}
.lobby-grid button.sel{border-color:#4cc2ff;background:#25415a}
.lobby-go{width:100%;padding:14px;font-size:18px;font-weight:700;border:0;border-radius:10px;background:#4cc2ff;color:#10202e;cursor:pointer}
.lobby-credits{font-size:11px;opacity:.55;margin:10px 0 0}
.lobby-go:disabled{opacity:.4;cursor:default}
@media (max-width:560px){.lobby-card{grid-template-columns:1fr}.lobby canvas{width:100%;height:180px}.lobby-grid{grid-template-columns:repeat(2,1fr)}}
`;

/** Mostra a tela de entrada e resolve quando o jogador clica em Entrar. */
export function showLobby(): Promise<Profile> {
  const saved = loadSaved();
  let selected: CharacterName = saved.character;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'lobby';
  root.innerHTML = `
    <div class="lobby-card">
      <h1>Arena Online 3D</h1>
      <canvas></canvas>
      <div>
        <label for="lobby-name">Seu nome</label>
        <input id="lobby-name" autocomplete="off" placeholder="Digite seu nome" />
        <div class="lobby-grid"></div>
        <button class="lobby-go" disabled>Entrar</button>
        <p class="lobby-credits">Modelos: Diddy_Blud_117 e Nxrmalman. (CC-BY 4.0) — veja CREDITS.md</p>
      </div>
    </div>`;
  document.body.appendChild(root);

  const input = root.querySelector('input') as HTMLInputElement;
  const grid = root.querySelector('.lobby-grid') as HTMLDivElement;
  const go = root.querySelector('.lobby-go') as HTMLButtonElement;
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  input.maxLength = MAX_NAME;
  input.value = saved.name;

  // Prévia 3D
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x1b1f2a);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  cam.position.set(0, 1.1, 4.6);
  cam.lookAt(0, 0.9, 0);
  let preview: THREE.Object3D | null = null;
  let token = 0;

  async function showPreview(name: CharacterName): Promise<void> {
    const mine = ++token;
    const obj = await createCharacter(name);
    if (mine !== token) return; // seleção mudou enquanto carregava
    if (preview) scene.remove(preview);
    preview = obj;
    scene.add(obj);
  }

  const buttons = new Map<CharacterName, HTMLButtonElement>();
  for (const name of CHARACTERS) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => {
      selected = name;
      refresh();
      void showPreview(name);
    };
    buttons.set(name, b);
    grid.appendChild(b);
  }

  function refresh(): void {
    buttons.forEach((b, n) => b.classList.toggle('sel', n === selected));
    go.disabled = input.value.trim().length === 0;
  }
  input.addEventListener('input', refresh);
  refresh();
  void showPreview(selected);

  let raf = 0;
  function frame(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    if (preview) preview.rotation.y += 0.01;
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return new Promise((resolve) => {
    const submit = (): void => {
      const name = input.value.trim();
      if (!name) return;
      void enterLandscape(); // tela cheia + paisagem (precisa ser dentro do toque)
      const profile: Profile = { name, character: selected };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch { /* ignora */ }
      cancelAnimationFrame(raf);
      renderer.dispose();
      root.remove();
      style.remove();
      resolve(profile);
    };
    go.onclick = submit;
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  });
}
