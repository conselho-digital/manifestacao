import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Torre de concreto cinza (escritório modernista), modelada a partir da foto de referência:
 * 4 pilares verticais, 3 vãos de janelas em grade fina, cornija, parapeito, térreo recuado com marquise,
 * casa de máquinas, venezianas, ventiladores redondos, ar-condicionado e duas antenas treliçadas.
 * Frente = +Z. A direita de quem olha a fachada = +X.
 */
export const TOWER = { w: 31.1, d: 24.4, h: 42 }; // metade da altura original (84 m)

const FLOOR = 3.2;
const MODULE = 1.04; // largura de uma janela
const EDGE = 2.2; // pilar de canto
const MID = 0.9; // pilar intermediário
const BAY_FRONT = 8.3;
const BAY_SIDE = 9.55;
const PROJ = 0.35; // quanto o pilar sai da linha da fachada
const GLASS_IN = 0.45; // o vidro fica recuado em relação ao pilar

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Um módulo de janela: vidro escuro com caixilho e faixa cinza (peitoril) embaixo. */
function glassModule(): THREE.CanvasTexture {
  return tex(64, 192, (g, w, h) => {
    const glassH = h * 0.7;
    const grad = g.createLinearGradient(0, 0, 0, glassH);
    grad.addColorStop(0, '#59656f');
    grad.addColorStop(0.5, '#3d4852');
    grad.addColorStop(1, '#2e3842');
    g.fillStyle = grad; g.fillRect(0, 0, w, glassH);
    g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(6, 4, w - 12, 10);        // reflexo no topo
    g.fillStyle = '#9aa0a5'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h); // montantes verticais
    g.fillStyle = '#868c91'; g.fillRect(0, glassH * 0.45, w, 2);                // travessa
    g.fillStyle = '#7e868d'; g.fillRect(0, glassH, w, h - glassH);              // faixa de peitoril
    g.fillStyle = '#6d747a'; g.fillRect(0, glassH + 4, w, 3); g.fillRect(0, h - 8, w, 3);
    g.fillStyle = '#b6bbbf'; g.fillRect(0, glassH, w, 2);                       // aresta clara
  });
}

function louverTex(): THREE.CanvasTexture {
  return tex(64, 64, (g, w, h) => {
    g.fillStyle = '#c9b585'; g.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 6) { g.fillStyle = '#a89560'; g.fillRect(0, y, w, 2); g.fillStyle = '#dbc994'; g.fillRect(0, y + 2, w, 1); }
    g.strokeStyle = '#8b7a4e'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  });
}

/** Junta as peças por material para gerar poucas malhas. */
class Parts {
  private readonly groups = new Map<string, THREE.BufferGeometry[]>();
  private readonly mats = new Map<string, THREE.Material>();

  constructor() {
    const lam = (c: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: c });
    this.mats.set('concrete', lam(0xc6c3ba));
    this.mats.set('concreteLight', lam(0xd8d5cc));
    this.mats.set('concreteDark', lam(0xa9a69d));
    this.mats.set('glass', new THREE.MeshLambertMaterial({ map: glassModule() }));
    this.mats.set('lobby', lam(0x2c3945));
    this.mats.set('redband', lam(0x8e4a3b));
    this.mats.set('metal', lam(0x70747b));
    this.mats.set('metalDark', lam(0x3a3e45));
    this.mats.set('red', lam(0xc13a2d));
    this.mats.set('white', lam(0xf3f3f1));
    this.mats.set('penthouse', lam(0xd3cfc4));
    this.mats.set('tan', new THREE.MeshLambertMaterial({ map: louverTex() }));
    this.mats.set('green', lam(0x4c8a3c));
    this.mats.set('trunk', lam(0x5b4333));
  }

  private push(key: string, g: THREE.BufferGeometry): void {
    (this.groups.get(key) ?? this.groups.set(key, []).get(key)!).push(g);
  }

  box(key: string, w: number, h: number, d: number, x: number, y: number, z: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  cyl(key: string, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 14): void {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(x, y + h / 2, z);
    this.push(key, g);
  }

  /** Disco (prato de antena, ventilador) com o eixo apontando para `axis`. */
  disc(key: string, r: number, thick: number, at: THREE.Vector3, axis: THREE.Vector3): void {
    const g = new THREE.CylinderGeometry(r, r * 0.9, thick, 18);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()));
    g.translate(at.x, at.y, at.z);
    this.push(key, g);
  }

  sphere(key: string, r: number, x: number, y: number, z: number): void {
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.translate(x, y, z);
    this.push(key, g);
  }

  /** Barra fina entre dois pontos (treliça das antenas). */
  strut(key: string, a: THREE.Vector3, b: THREE.Vector3, t: number): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.BoxGeometry(t, len, t);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g.translate(a.x, a.y, a.z);
    this.push(key, g);
  }

  /** Vão de janelas: face de vidro com a textura repetida (módulos x andares). `face`: 0 frente(+Z), 1 direita(+X), 2 trás(-Z), 3 esquerda(-X). */
  glassBay(face: 0 | 1 | 2 | 3, along: number, width: number, y0: number, floors: number, depthPos: number): void {
    const h = floors * FLOOR;
    const g = new THREE.BoxGeometry(width, h, 0.14);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const mods = Math.max(1, Math.round(width / MODULE));
    for (let i = 0; i < 24; i++) {
      if (i >= 16 && i < 20) uv.setXY(i, uv.getX(i) * mods, uv.getY(i) * floors); // só a face externa leva a janela
      else uv.setXY(i, 0.05, 0.9);
    }
    g.translate(0, y0 + h / 2, 0);
    // coloca na face certa
    const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][face]!;
    g.rotateY(rot);
    const out = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
    const tang = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    g.translate(out.x * depthPos + tang.x * along, 0, out.z * depthPos + tang.z * along);
    this.push('glass', g);
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [key, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, this.mats.get(key)!);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
}

/** Antena treliçada em faixas vermelhas e brancas (pernas, anéis e diagonais). */
function lattice(p: Parts, x: number, y: number, z: number, height: number, baseHalf: number, topHalf: number, segs: number): void {
  const segH = height / segs;
  const ring = (i: number): THREE.Vector3[] => {
    const hh = THREE.MathUtils.lerp(baseHalf, topHalf, i / segs);
    return [new THREE.Vector3(x - hh, y + i * segH, z - hh), new THREE.Vector3(x + hh, y + i * segH, z - hh), new THREE.Vector3(x + hh, y + i * segH, z + hh), new THREE.Vector3(x - hh, y + i * segH, z + hh)];
  };
  for (let i = 0; i < segs; i++) {
    const a = ring(i);
    const b = ring(i + 1);
    const key = i % 2 === 0 ? 'red' : 'white';
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      p.strut(key, a[k]!, b[k]!, 0.13);          // perna
      p.strut(key, b[k]!, b[n]!, 0.08);          // anel
      p.strut(key, a[k]!, b[n]!, 0.06);          // diagonal 1
      p.strut(key, a[n]!, b[k]!, 0.06);          // diagonal 2
    }
  }
}

export function buildGrayTower(): THREE.Group {
  const { w: W, d: D, h: H } = TOWER;
  const hw = W / 2;
  const hd = D / 2;
  const p = new Parts();

  // ---- alturas ----
  const lobbyH = 7.4; // térreo (hall) até a viga de transição
  const topBand = H - 6.2; // base da cornija
  const floors = Math.floor((topBand - lobbyH) / FLOOR);

  // ---- base ----
  p.box('concreteDark', W + 2.4, 0.15, D + 2.4, 0, 0, 0);          // soleira
  p.box('concreteLight', 14, 0.3, 2.2, 0, 0.15, hd + 1.9);         // degraus da entrada
  p.box('concreteLight', 12, 0.3, 1.3, 0, 0.45, hd + 1.55);

  // ---- pilares ----
  const pierBottom = 0.15;
  const pierH = topBand - pierBottom;
  // cantos: quatro blocos
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.box('concrete', EDGE + PROJ, pierH, EDGE + PROJ, sx * (hw - (EDGE - PROJ) / 2), pierBottom, sz * (hd - (EDGE - PROJ) / 2));
  }
  // faixas dos pilares de canto (frisos verticais nas duas faces)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.box('concreteDark', 0.12, pierH, 0.5, sx * (hw + PROJ - 0.06), pierBottom, sz * (hd - 0.9));
    p.box('concreteDark', 0.5, pierH, 0.12, sx * (hw - 0.9), pierBottom, sz * (hd + PROJ - 0.06));
  }
  // intermediários: frente/trás (2 por face) e laterais (1 por face)
  const frontX = [-hw + EDGE + BAY_FRONT + MID / 2, -hw + EDGE + BAY_FRONT * 2 + MID * 1.5];
  for (const x of frontX) for (const sz of [-1, 1]) p.box('concrete', MID, pierH, 1.3, x, pierBottom, sz * (hd - 0.65 + PROJ / 2 + 0.0));
  for (const sx of [-1, 1]) p.box('concrete', 1.3, pierH, MID, sx * (hw - 0.65 + PROJ / 2), pierBottom, 0);
  // capitéis (blocos de topo dos pilares)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box('concreteLight', EDGE + PROJ + 0.5, 0.45, EDGE + PROJ + 0.5, sx * (hw - (EDGE - PROJ) / 2), topBand - 0.45, sz * (hd - (EDGE - PROJ) / 2));
  for (const x of frontX) for (const sz of [-1, 1]) p.box('concreteLight', MID + 0.4, 0.4, 1.6, x, topBand - 0.4, sz * (hd - 0.55));

  // ---- vãos de janelas ----
  const gz = hd - GLASS_IN - 0.4; // posição do vidro (recuado)
  const gx = hw - GLASS_IN - 0.4;
  const frontCenters = [-hw + EDGE + BAY_FRONT / 2, -hw + EDGE + BAY_FRONT + MID + BAY_FRONT / 2, -hw + EDGE + (BAY_FRONT + MID) * 2 + BAY_FRONT / 2];
  for (const c of frontCenters) {
    p.glassBay(0, c, BAY_FRONT, lobbyH, floors, gz);
    p.glassBay(2, -c, BAY_FRONT, lobbyH, floors, gz);
  }
  const sideCenters = [-BAY_SIDE / 2 - MID / 2, BAY_SIDE / 2 + MID / 2];
  for (const c of sideCenters) {
    p.glassBay(1, c, BAY_SIDE, lobbyH, floors, gx);
    p.glassBay(3, -c, BAY_SIDE, lobbyH, floors, gx);
  }
  // faixas vermelhas (peitoril colorido) em dois andares, como na foto
  for (const yb of [lobbyH + FLOOR * 4.6, lobbyH + FLOOR * 5.6]) {
    for (const c of frontCenters) { p.box('redband', BAY_FRONT, 0.22, 0.1, c, yb, hd - GLASS_IN - 0.28); p.box('redband', BAY_FRONT, 0.22, 0.1, -c, yb, -(hd - GLASS_IN - 0.28)); }
    for (const c of sideCenters) { p.box('redband', 0.1, 0.22, BAY_SIDE, hw - GLASS_IN - 0.28, yb, c); p.box('redband', 0.1, 0.22, BAY_SIDE, -(hw - GLASS_IN - 0.28), yb, -c); }
  }
  // fundo atrás do vidro (parede interna) para não ver através do prédio
  p.box('concreteDark', W - 2 * EDGE - 0.2, floors * FLOOR, D - 2 * EDGE - 0.2, 0, lobbyH, 0);

  // ---- térreo / hall recuado, viga de transição e marquise ----
  const lobbyIn = 2.2;
  p.box('lobby', W - 2 * EDGE, lobbyH - 1.1, 0.3, 0, 0.15, hd - lobbyIn);          // vidro do hall (frente)
  p.box('lobby', W - 2 * EDGE, lobbyH - 1.1, 0.3, 0, 0.15, -hd + lobbyIn);         // fundo
  p.box('lobby', 0.3, lobbyH - 1.1, D - 2 * EDGE, hw - lobbyIn, 0.15, 0);          // lados
  p.box('lobby', 0.3, lobbyH - 1.1, D - 2 * EDGE, -hw + lobbyIn, 0.15, 0);
  for (let x = -hw + EDGE + 1.5; x < hw - EDGE; x += 3) p.box('metal', 0.18, lobbyH - 1.1, 0.4, x, 0.15, hd - lobbyIn + 0.15); // montantes do hall
  p.box('metalDark', 1.4, 2.6, 0.2, -1.4, 0.15, hd - lobbyIn + 0.28);               // portas
  p.box('metalDark', 1.4, 2.6, 0.2, 1.4, 0.15, hd - lobbyIn + 0.28);
  p.box('concreteLight', W - 2 * EDGE, 1.2, 1.0, 0, lobbyH - 1.2, hd - 0.35);       // viga de transição
  p.box('concreteLight', W - 2 * EDGE, 1.2, 1.0, 0, lobbyH - 1.2, -hd + 0.35);
  p.box('concreteLight', 1.0, 1.2, D - 2 * EDGE, hw - 0.35, lobbyH - 1.2, 0);
  p.box('concreteLight', 1.0, 1.2, D - 2 * EDGE, -hw + 0.35, lobbyH - 1.2, 0);
  p.box('concreteDark', W - 2 * EDGE - 0.4, 0.18, 0.5, 0, lobbyH - 1.25, hd + 0.2);  // aresta de sombra
  // marquise da entrada
  p.box('concreteLight', 12, 0.35, 3.4, 0, 5.1, hd + 1.0);
  p.box('concreteDark', 12.4, 0.12, 3.8, 0, 4.98, hd + 1.0);
  p.box('metal', 0.2, 4.9, 0.2, -5.6, 0.15, hd + 2.5);
  p.box('metal', 0.2, 4.9, 0.2, 5.6, 0.15, hd + 2.5);
  // jardineiras redondas na entrada
  for (const x of [-9.5, 9.5]) {
    p.cyl('concreteLight', 1.6, 1.7, 0.6, x, 0.15, hd + 2.6, 20);
    p.cyl('green', 1.3, 1.5, 0.5, x, 0.7, hd + 2.6, 12);
    p.sphere('green', 1.0, x, 1.5, hd + 2.6);
  }

  // ---- cornija, lábio e parapeito ----
  p.box('concrete', W + 0.9, 2.5, D + 0.9, 0, topBand, 0);                         // faixa superior
  p.box('concreteLight', W + 1.5, 0.4, D + 1.5, 0, topBand + 2.5, 0);              // lábio
  p.box('concreteDark', W + 0.5, 0.25, D + 0.5, 0, topBand - 0.25, 0);             // aresta de sombra sob a cornija
  const roofY = H - 3.1;
  const rim = 0.6;
  const rimH = 1.4;
  p.box('concreteLight', W + 1.5, rimH, rim, 0, roofY, hd + 0.75 - rim / 2);       // parapeito (4 lados)
  p.box('concreteLight', W + 1.5, rimH, rim, 0, roofY, -hd - 0.75 + rim / 2);
  p.box('concreteLight', rim, rimH, D + 1.5 - 2 * rim, hw + 0.75 - rim / 2, roofY, 0);
  p.box('concreteLight', rim, rimH, D + 1.5 - 2 * rim, -hw - 0.75 + rim / 2, roofY, 0);
  p.box('concreteDark', W + 0.2, 0.1, D + 0.2, 0, roofY - 0.05, 0);                // laje do telhado
  const rY = roofY; // chão do telhado

  // ---- casa de máquinas, venezianas, ventiladores, ar-condicionado ----
  p.box('penthouse', 10, 4.6, 6.2, 0.4, rY, -hd * 0.42);
  p.box('concreteLight', 10.5, 0.35, 6.7, 0.4, rY + 4.6, -hd * 0.42);              // laje da casa de máquinas
  p.box('tan', 6, 3.0, 0.15, 0.4, rY + 0.8, -hd * 0.42 + 3.15);                    // veneziana na parede
  p.box('metalDark', 1.1, 2.0, 0.2, -3.6, rY, -hd * 0.42 + 3.15);                  // porta de serviço
  p.box('tan', 5, 0.25, 4.4, -hw * 0.5, rY + 0.35, -hd * 0.2);                     // painel de venezianas no chão
  p.box('metal', 5.2, 0.35, 4.6, -hw * 0.5, rY, -hd * 0.2);
  for (let i = 0; i < 3; i++) {
    const zf = -hd * 0.55 + i * (hd * 0.4);
    const xf = hw * 0.62;
    p.box('concreteLight', 2.6, 0.5, 2.6, xf, rY, zf);                             // base do ventilador
    p.cyl('metal', 1.0, 1.05, 0.8, xf, rY + 0.5, zf, 20);                          // carcaça redonda
    p.cyl('metalDark', 0.85, 0.85, 0.1, xf, rY + 1.3, zf, 20);                     // grade
    p.cyl('metal', 0.15, 0.15, 0.25, xf, rY + 1.35, zf, 8);                        // cubo
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      p.strut('metal', new THREE.Vector3(xf, rY + 1.4, zf), new THREE.Vector3(xf + Math.cos(a) * 0.8, rY + 1.4, zf + Math.sin(a) * 0.8), 0.07); // pás
    }
  }
  for (const x of [-2.2, 1.4, 4.4]) {                                              // ar-condicionado
    p.box('metal', 2.2, 1.5, 1.7, x, rY, hd * 0.5);
    p.box('metalDark', 1.9, 0.12, 1.4, x, rY + 1.5, hd * 0.5);
    p.cyl('metalDark', 0.55, 0.55, 0.1, x, rY + 1.6, hd * 0.5, 12);
  }
  p.box('metal', 1.4, 2.0, 1.4, 6.6, rY, hd * 0.2);                                // caixa elétrica
  p.cyl('white', 0.3, 0.3, 1.6, -hw * 0.82, rY, hd * 0.55, 8);                      // exaustores
  p.cyl('metal', 0.45, 0.1, 0.35, -hw * 0.82, rY + 1.6, hd * 0.55, 8);

  // ---- antenas ----
  const ax = -2;
  const az = -hd * 0.38;
  const ay = rY + 4.95;                                                            // em cima da casa de máquinas
  lattice(p, ax, ay, az, 26, 1.5, 0.28, 8);
  p.box('metal', 3.4, 0.25, 3.4, ax, ay - 0.25, az);
  for (const [h, ang] of [[10, 0.5], [14, 2.4], [18, 4.3]] as const) {             // pratos
    const dirv = new THREE.Vector3(Math.cos(ang), 0.05, Math.sin(ang));
    const at = new THREE.Vector3(ax + dirv.x * 1.4, ay + h, az + dirv.z * 1.4);
    p.disc('white', 0.75, 0.16, at, dirv);
    p.strut('metal', new THREE.Vector3(ax, ay + h, az), at, 0.07);
  }
  p.sphere('red', 0.22, ax, ay + 26.3, az);
  const bx = 3.6;
  const bz = -hd * 0.3;
  p.cyl('white', 0.12, 0.16, 15, bx, ay - 0.3, bz, 8);                              // segundo mastro
  for (const [h, ang] of [[10.5, 0.8], [12.5, 3.6], [14.2, 5.3]] as const) {
    p.box('white', 0.3, 1.5, 0.12, bx + Math.cos(ang) * 0.3, ay + h, bz + Math.sin(ang) * 0.3);
  }
  p.cyl('red', 0.14, 0.14, 1.2, bx, ay + 12.8, bz, 8);
  p.sphere('red', 0.18, bx, ay + 14.9, bz);

  return p.build();
}
