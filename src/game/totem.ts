// Totem semafórico "Av. Paulista" (azul): coluna quadrada com semáforo de veículos no alto, placa com o nome da avenida
// (lê-se de baixo para cima), contador de tempo e, na lateral, o semáforo de pedestres. Proporções da foto de referência.
import * as THREE from 'three';
import { addBox } from './map';

const W = 0.3;
const H = 3.6;
const BLUE = 0x2766b8;
const CW = 96; // pixels do canvas da frente (proporção W:H = 1:12)
const CH = 1152;

let frontTex: THREE.CanvasTexture | null = null;
function frontTexture(): THREE.CanvasTexture {
  if (frontTex) return frontTex;
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a6cc0';
  g.fillRect(0, 0, CW, CH);
  g.fillStyle = '#18498a';                       // bordas
  g.fillRect(0, 0, 5, CH); g.fillRect(CW - 5, 0, 5, CH);
  // caixa do semáforo de veículos
  g.fillStyle = '#16181b';
  g.beginPath(); g.roundRect(10, 160, CW - 20, 185, 10); g.fill();
  const lamp = (y: number, color: string, glow: boolean): void => {
    if (glow) { const gr = g.createRadialGradient(CW / 2, y, 4, CW / 2, y, 30); gr.addColorStop(0, 'rgba(255,60,50,.55)'); gr.addColorStop(1, 'rgba(255,60,50,0)'); g.fillStyle = gr; g.fillRect(0, y - 30, CW, 60); }
    g.fillStyle = '#0a0b0c'; g.beginPath(); g.arc(CW / 2, y, 25, 0, 6.3); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(CW / 2, y, 20, 0, 6.3); g.fill();
  };
  lamp(197, '#ff2a22', true);
  lamp(252, '#4a3a12', false);
  lamp(307, '#0f3a2a', false);
  // placa "Av. Paulista"
  g.fillStyle = '#2f74cc';
  g.fillRect(6, 358, CW - 12, 298);
  g.save();
  g.translate(CW / 2 + 2, 507);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.font = '800 49px "Segoe UI", Arial, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Av. Paulista', 0, 0);
  g.restore();
  // contador
  g.fillStyle = '#3b4146';
  g.fillRect(12, 664, CW - 24, 52);
  g.fillStyle = '#2b3034';
  g.font = '700 38px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('88', CW / 2, 691);
  // emenda da chapa
  g.fillStyle = '#143f78';
  g.fillRect(0, 756, CW, 3);
  frontTex = new THREE.CanvasTexture(c);
  frontTex.colorSpace = THREE.SRGBColorSpace;
  frontTex.anisotropy = 4;
  return frontTex;
}

let pedTex: THREE.CanvasTexture | null = null;
function pedTexture(): THREE.CanvasTexture {
  if (pedTex) return pedTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141517';
  g.fillRect(0, 0, 64, 128);
  const disc = (y: number, fill: string): void => { g.fillStyle = '#050505'; g.beginPath(); g.arc(32, y, 25, 0, 6.3); g.fill(); g.fillStyle = fill; g.beginPath(); g.arc(32, y, 21, 0, 6.3); g.fill(); };
  disc(33, '#3a1210');
  disc(95, '#10301f');
  // homem vermelho (parado) aceso
  g.fillStyle = '#ff3b2f';
  g.beginPath(); g.arc(32, 20, 4.5, 0, 6.3); g.fill();          // cabeça
  g.fillRect(27, 26, 10, 15);                                    // tronco
  g.fillRect(24, 27, 3, 12); g.fillRect(37, 27, 3, 12);          // braços
  g.fillRect(28, 41, 3.5, 13); g.fillRect(32.5, 41, 3.5, 13);    // pernas
  pedTex = new THREE.CanvasTexture(c);
  pedTex.colorSpace = THREE.SRGBColorSpace;
  return pedTex;
}

/** Cria um totem (origem no chão, frente = +Z). */
export function createTotem(): THREE.Group {
  const g = new THREE.Group();
  const blue = new THREE.MeshLambertMaterial({ color: BLUE });
  const front = new THREE.MeshLambertMaterial({ map: frontTexture(), emissive: 0xffffff, emissiveMap: frontTexture(), emissiveIntensity: 0.8 });
  // BoxGeometry: ordem das faces +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, W), [blue, blue, blue, blue, front, blue]);
  body.position.y = H / 2 + 0.06;
  body.castShadow = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.06, W + 0.12), new THREE.MeshLambertMaterial({ color: 0x555a60 }));
  plate.position.y = 0.03;
  // semáforo de pedestres na lateral direita (visto de frente), com o suporte
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.2), [new THREE.MeshLambertMaterial({ color: 0x141517 }), new THREE.MeshLambertMaterial({ color: 0x141517 }), new THREE.MeshLambertMaterial({ color: 0x141517 }), new THREE.MeshLambertMaterial({ color: 0x141517 }), new THREE.MeshLambertMaterial({ map: pedTexture(), emissive: 0xffffff, emissiveMap: pedTexture(), emissiveIntensity: 0.45 }), new THREE.MeshLambertMaterial({ color: 0x141517 })]);
  ped.position.set(W / 2 + 0.2, 0.75, 0.04);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), new THREE.MeshLambertMaterial({ color: 0x20262c }));
  arm.position.set(W / 2 + 0.04, 0.9, 0.04);
  g.add(body, plate, ped, arm);
  return g;
}

/** Põe um totem no mapa em (x, z) olhando para `heading` (rad, 0 = +Z), com colisão do pilar. */
export function placeTotem(parent: THREE.Object3D, x: number, z: number, heading: number): void {
  const t = createTotem();
  t.position.set(x, 0, z);
  t.rotation.y = heading;
  parent.add(t);
  addBox(x - 0.25, x + 0.25, z - 0.25, z + 0.25, H, '#1f5aa6');
}
