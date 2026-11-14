# Congresso Nacional (SketchUp → jogo)

Origem: `assets-src/mapa-esplanada/congresso_nacional_original.skp` (arquivo do usuário, SketchUp 2021, fotos casadas).

1. `npm i openskp` (só ferramenta, fora do jogo) e `node dump.mjs original.skp`: grava `dump/prims.json` (malhas por material) e `dump/texN.jpg`.
   Foram descartados o terreno (Google Earth: primitivas 214–217), os postes (96 triângulos) e a foto do chão (32).
2. `python3 -I build.py`: gira 280,75° (laje alinhada ao eixo, torres ao norte), espelha em x (o mapa Esplanada é espelhado), escala
   horizontal 0,58 e vertical 0,30 (teto em y = 0, chão em −5,34), laje com a frente em z = 92. Rosa (255,84,84) vira concreto.
   Gera `out/congresso.glb`: 2 malhas (cores por vértice + atlas de fotos 2048x516) = 2 chamadas de desenho, ~700 KB.
3. `python3 -I vox.py 1.2 0.3`: voxeliza as superfícies (1,2 m x 0,3 m), preenche torres e cúpulas como sólidos e funde em caixas
   (`out/colliders.json`: [minX, maxX, minZ, maxZ, topo, base], y absoluto). ~700 caixas, a rampa vira degraus de 0,3 m (dá para subir andando).
Saídas vão para `public/models/map/congresso.glb` e `congresso-colliders.json`.
