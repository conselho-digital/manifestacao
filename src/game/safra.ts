// Escultura "Safra" (letreiro dourado de pé na calçada): pilar de latão quadrado e as letras brancas empilhadas, de lado
// (lê-se de baixo para cima), grossas, com a borda dourada, como nas fotos de referência. Sem fonte 3D: cada letra é
// desenhada num canvas e "extrudada" em fatias (planos com recorte pela transparência), o que dá volume com 2 chamadas de desenho.
import * as THREE from 'three';
import { addBox } from './map';

const TEXT = 'Safra';
const PX = 0.018; // metros por pixel do canvas (letra maiúscula ≈ 2,6 m antes da escala do mapa)
const DEPTH = 1.5; // espessura das letras
const SLICES = 20;
const PILLAR = 1.0; // lado do pilar
const BASE_Y = 2.3; // onde começa a primeira letra (o S)
const GAP = 0.24;

/** escala da escultura no mapa (0,5 = metade do tamanho original, ~3,5 m de altura) */
const SCALE = 0.5;
const GOLD = 0xd2a64a;

function letterTextures(ch: string): { front: THREE.CanvasTexture; side: THREE.CanvasTexture; w: number; h: number; capCenter: number } {
  const size = 200;
  const font = `800 ${size}px "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const tw = Math.ceil(probe.measureText(ch).width);
  const pad = 14;
  const W = tw + pad * 2;
  const H = Math.round(size * 1.25);
  const draw = (fill: string, stroke: string, lw: number): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.font = font;
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    const baseline = Math.round(size * 0.97);
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.strokeText(ch, pad, baseline);
    g.fillStyle = fill;
    g.fillText(ch, pad, baseline);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // frente: branco com borda dourada fina; lado: a silhueta toda dourada (um pouco mais gorda)
  return { front: draw('#ffffff', '#dcb256', 7), side: draw('#dcb256', '#dcb256', 8), w: W, h: H, capCenter: Math.round(size * 0.97) - size * 0.36 };
}

/** Cria a escultura (origem no chão, frente = +Z). Devolve também a altura total. */
export function createSafraSign(): THREE.Group {
  const group = new THREE.Group();
  const brass = new THREE.MeshLambertMaterial({ color: GOLD });
  const brassDark = new THREE.MeshLambertMaterial({ color: 0xa57d2e });

  // letras: posições ao longo do eixo de leitura (x local, depois giradas para cima)
  const letters = new THREE.Group();
  let cursor = 0;
  const sideGeos: THREE.BufferGeometry[] = [];
  const frontMeshes: THREE.Mesh[] = [];
  const sideMats: THREE.MeshLambertMaterial[] = [];
  for (const ch of TEXT) {
    const t = letterTextures(ch);
    const w = t.w * PX;
    const h = t.h * PX;
    const sideMat = new THREE.MeshLambertMaterial({ map: t.side, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    sideMats.push(sideMat);
    for (let i = 0; i < SLICES; i++) {
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(cursor + w / 2, h / 2 - t.capCenter * PX, PILLAR / 2 + (i / (SLICES - 1)) * DEPTH * 0.92);
      const m = new THREE.Mesh(g, sideMat);
      letters.add(m);
    }
    const fg = new THREE.PlaneGeometry(w, h);
    fg.translate(cursor + w / 2, h / 2 - t.capCenter * PX, PILLAR / 2 + DEPTH);
    const fm = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: t.front, transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveIntensity: 0.85, emissiveMap: t.front }));
    frontMeshes.push(fm);
    letters.add(fm);
    cursor += w - 0.12 + GAP;
  }
  void sideGeos;
  const total = cursor - GAP;
  // de lado: lê-se de baixo para cima, o topo das letras aponta para a esquerda
  letters.rotation.z = Math.PI / 2;
  letters.position.set(0, BASE_Y, 0);
  group.add(letters);
  const top = BASE_Y + total;

  // pilar de latão (com uma emenda mais escura perto do chão, como nas fotos) e base de pedra
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(PILLAR, top, PILLAR), brass);
  pillar.position.y = top / 2;
  pillar.castShadow = true;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(PILLAR + 0.01, 0.04, PILLAR + 0.01), brassDark);
  seam.position.y = 1.35;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(PILLAR + 0.7, 0.14, PILLAR + 0.7), new THREE.MeshLambertMaterial({ color: 0x9a948a }));
  plinth.position.y = 0.07;
  group.add(pillar, seam, plinth);
  group.userData.height = top;
  group.userData.size = PILLAR + 0.7;
  void brassDark;
  return group;
}

/** Põe a escultura no mapa em (x, z) olhando para `heading` (rad, 0 = +Z) e cria a colisão do pilar. */
export function placeSafraSign(parent: THREE.Object3D, x: number, z: number, heading: number): void {
  const s = createSafraSign();
  s.scale.setScalar(SCALE);
  s.position.set(x, 0, z);
  s.rotation.y = heading;
  parent.add(s);
  const half = ((s.userData.size as number) * SCALE) / 2;
  addBox(x - half, x + half, z - half, z + half, (s.userData.height as number) * SCALE, '#b98f3c');
}
