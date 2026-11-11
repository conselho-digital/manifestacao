// Ferramenta de desenvolvimento: monta um M16A1 low-poly (peças com materiais preto/aço) e exporta em GLB (window.GLB, base64).
// O corpo ocupa os mesmos limites do modelo antigo (x de -0,2466 a 0,7434; y de -0,089 a 0,16) para as mãos (rifles.ts) continuarem certas.
// Eixo X = comprimento (cano para +X), Y = altura, Z = lado. Script scratchpad/m16.js salva em public/models/weapons/m16.glb.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const std = (c: number, rough = 0.6, metal = 0.2): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
const POLY = std(0x7a8088, 0.5, 0.3); // receptor (cinza metálico)
const POLY2 = std(0x2e3034, 0.75, 0.05); // coronha, empunhadura, guarda-mão (preto)
const STEEL = std(0x9aa1a9, 0.4, 0.5); // carregador e massa de mira
const DARK = std(0x17181a, 0.8, 0.1);

const g = new THREE.Group();
g.name = 'm16';
const AX = 0.116; // altura do eixo do cano

function box(x0: number, x1: number, y0: number, y1: number, hz: number, mat: THREE.Material, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, hz * 2), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  m.rotation.z = rz;
  g.add(m);
  return m;
}
function cyl(x0: number, x1: number, y: number, r0: number, r1: number, mat: THREE.Material, seg = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, x1 - x0, seg), mat);
  m.rotation.z = -Math.PI / 2; // eixo do cilindro (Y) vira +X
  m.position.set((x0 + x1) / 2, y, 0);
  g.add(m);
  return m;
}

// cano, quebra-chamas e massa de mira (alturas máximas: massa e alça em 0,16)
cyl(0.3, 0.7, AX, 0.0085, 0.0085, STEEL, 8);
cyl(0.675, 0.7434, AX, 0.0125, 0.0125, DARK, 8);
box(0.58, 0.6, AX, 0.16, 0.004, STEEL); // pilar da massa de mira
cyl(0.5, 0.57, AX, 0.0145, 0.0145, STEEL, 8); // base da massa de mira
// guarda-mão afunilado (ripado) e capa
cyl(0.255, 0.53, AX, 0.0295, 0.0255, POLY2, 10);
cyl(0.255, 0.275, AX, 0.0325, 0.0325, DARK, 10); // anel traseiro
cyl(0.505, 0.525, AX, 0.0285, 0.0285, DARK, 10); // anel dianteiro
for (let x = 0.3; x < 0.5; x += 0.04) cyl(x, x + 0.008, AX, 0.0305, 0.0305, DARK, 10); // ranhuras do guarda-mão
cyl(0.7, 0.7434, AX, 0.0145, 0.0145, STEEL, 8); // ponta do quebra-chamas
// receptor superior (fino) + alça de transporte em arco com janela (topo em 0,16)
box(0.0, 0.272, AX - 0.012, AX + 0.014, 0.0165, POLY);
box(0.02, 0.07, AX + 0.014, 0.16, 0.011, POLY); // poste traseiro da alça (mira)
box(0.17, 0.215, AX + 0.014, 0.16, 0.011, POLY); // poste dianteiro da alça
box(0.02, 0.215, 0.148, 0.16, 0.011, POLY); // barra superior da alça
box(0.07, 0.17, AX + 0.014, 0.148, 0.0035, DARK); // fundo da janela da alça
box(0.04, 0.052, AX - 0.012, AX + 0.01, 0.018, DARK); // janela de ejeção
// receptor inferior, alojamento e carregador (levemente curvo para frente)
box(0.0, 0.272, AX - 0.062, AX - 0.012, 0.0175, POLY2);
box(0.135, 0.205, AX - 0.088, AX - 0.062, 0.0175, POLY2);
box(0.145, 0.195, -0.089, AX - 0.08, 0.0145, STEEL, -0.1);
for (let y = -0.07; y < 0.02; y += 0.022) box(0.14, 0.2, y, y + 0.004, 0.0152, DARK, -0.1); // nervuras do carregador
// empunhadura, guarda-mato e gatilho
box(0.042, 0.082, -0.05, AX - 0.062, 0.0155, POLY2, -0.28);
box(0.09, 0.14, AX - 0.088, AX - 0.08, 0.006, POLY2);
box(0.1, 0.108, AX - 0.078, AX - 0.05, 0.004, DARK);
// coronha fixa (tubo + corpo afunilado) e soleira
cyl(-0.18, 0.02, AX - 0.01, 0.014, 0.014, STEEL, 8);
{
  const sh = new THREE.Shape();
  sh.moveTo(-0.2466, AX + 0.006); sh.lineTo(0.0, AX + 0.002); sh.lineTo(0.0, AX - 0.04); sh.lineTo(-0.12, AX - 0.054); sh.lineTo(-0.2466, AX - 0.072);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.036, bevelEnabled: false });
  geo.translate(0, 0, -0.018);
  g.add(new THREE.Mesh(geo, POLY2));
  box(-0.2466, -0.236, AX - 0.072, AX + 0.006, 0.02, DARK); // soleira de borracha
}
// punho de armar
box(-0.03, 0.0, AX + 0.01, AX + 0.024, 0.012, DARK);

const out = new THREE.Group();
out.add(g);
const box3 = new THREE.Box3().setFromObject(out);
console.log('M16', box3.min.toArray(), box3.max.toArray());
const buf = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
let s = '';
const u8 = new Uint8Array(buf);
for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
(window as unknown as { GLB: string; BOX: number[]; READY: boolean }).GLB = btoa(s);
(window as unknown as { BOX: number[] }).BOX = [...box3.min.toArray(), ...box3.max.toArray()];
(window as unknown as { READY: boolean }).READY = true;
