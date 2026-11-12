Conversão da viatura Renault Duster 2025 PM (copcarla.dff/.txd do usuário) para `public/models/vehicles/duster.glb`.
1. `node exp4.js copcarla.dff copcarla.txd out/` (precisa de `rw-parser`; grava car.json + texturas)
2. `LIST=1 python3 build_duster.py out/ duster-list.glb "duster_pj=0-2,vidro,tampa,leds,branco,lentes,grill_grill_led,estrobo-f-1,estrobo-f-2,grill_grill_glass,ledbranco-1,ledbranco-2,estrobo-b-led-1,estrobo-b-led-2"` (os índices deste DFF são LISTAS de triângulos, não tiras: `LIST=1`; sem interior, sem peças `_dam`; portas da frente em nós `door_L/door_R`)
3. `GLASSK=0.3 KEEP=m26 TINY=100 ERR=0.1 node canon.mjs duster-list.glb duster-c.glb 99999 512 420` (limpeza: tira peças texturizadas minúsculas, junta as rodas em 1 malha e simplifica só roda e vidro; o resto fica intacto porque a carroceria tem cascas finas que se desfazem ao simplificar)
4. `node scripts/models/flat2.mjs duster-c.glb duster.glb` (cores lisas viram cor de vértice e se juntam). O original completo fica em `assets-src/vehicles-hq/vehicles_duster.glb`.
Resultado: ~14 mil triângulos, 16 malhas (chamadas de desenho), texturas até 512, 720 KB.
