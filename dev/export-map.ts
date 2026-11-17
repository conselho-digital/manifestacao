// Ferramenta de desenvolvimento: exporta o mapa gerado por código (createCity) para GLB (binário) em window.GLB (base64).
// Uso: /dev/export-map.html — o script do scratchpad lê window.GLB e grava o arquivo.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createCity } from '../src/game/city';

const city = createCity();
const root = new THREE.Group();
root.name = 'mapa_paulista';
root.add(city);
await new Promise((r) => setTimeout(r, 6000)); // o MASP carrega em segundo plano
root.updateMatrixWorld(true);
let tris = 0, meshes = 0;
root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { meshes++; const g = (o as THREE.Mesh).geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
const buf = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false, maxTextureSize: 1024 })) as ArrayBuffer;
let s = '';
const u8 = new Uint8Array(buf);
for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
(window as unknown as { GLB: string; INFO: object; READY: boolean }).GLB = btoa(s);
(window as unknown as { INFO: object }).INFO = { bytes: u8.length, meshes, tris };
(window as unknown as { READY: boolean }).READY = true;
