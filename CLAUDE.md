# Arena Online 3D

Multiplayer no navegador. Mapa: cidade inspirada na Av. Paulista (SP), com o MASP no centro. Personagens low-poly. Plano **grátis** (Vercel + Supabase).

## Stack
- Vite + TypeScript + Three.js (front-end)
- Vercel (site estático, sem backend próprio; sem WebSocket server)
- Supabase Realtime (Broadcast + Presence)
- Modelos GLB em `public/models/`

## Estrutura
- `public/models/characters/` — Helena, Stewart, Bennyse, Amanda, Garota1, Carlos, Gordao, Cesar (.glb)
- `public/models/vehicles/` — carros e motos (a criar)
- `src/main.ts` — entrada, loop
- `src/game/` — cena, cidade (`city.ts`), câmera, input, física simples, combate, veículos
- `src/net/` — cliente Supabase, sync
- `src/ui/` — seleção, nome, HUD

## Comandos
- `npm run dev` / `npm run build` / `npx vercel --prod`

## Env
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Só chave anon. `.env.local` fora do git.

## Modelos
- 8 personagens, 974–2644 triângulos, `KHR_materials_unlit`. Sem animação; só Carlos tem esqueleto.
- Gordao.glb (~931 KB): reduzir textura para 512x512. Jogo todo abaixo de ~15 MB.
- GLB, origem nos pés, metros (personagem ~1,8 m). Máx ~3000 tri (personagem), ~5000 (veículo).
- Texturas até 512x512. Veículos: nós `body`, `wheel_FL`, `wheel_FR`, `wheel_BL`, `wheel_BR`.
- Roupas: trocar textura/material, não duplicar malha. Verificar licença.
- Otimizar: `npx gltf-transform optimize in.glb out.glb`. Não sobrescrever originais; salvar em pasta separada.

## Multiplayer
- Canal `arena:main`. Presence: id, nome, personagem. Broadcast `move`: posição e rotação.
- 10–15 envios/s. Interpolar no cliente. Sem autoridade de servidor.
- Ranking/persistência: tabela Postgres com RLS.

## Código
- TS estrito, funções pequenas, poucas dependências.
- `GLTFLoader` + `clone` (`SkeletonUtils.clone` para Carlos). Cache de modelos.
- `setPixelRatio(Math.min(devicePixelRatio, 2))`, sombras simples, poucos draw calls.
- Celular (toque) e PC (WASD + mouse).

## Plano
1. ✅ Vite + Three.js, mapa simples
2. ✅ Personagem com WASD, câmera 3ª pessoa
3. ✅ Tela de entrada: nome + 8 personagens
4. ✅ Multiplayer Supabase: presence + broadcast + interpolação
5. ✅ Animação (ped.ifp: parado, andar, correr; Shift anda). Carlos e Law1-9 animados. Falta: modelos sem esqueleto (Helena, Stewart, Bennyse, Amanda, Garota1, Gordao, Cesar, Akiyama)
6. ✅ Motos: Harley, Triumph, BMW S1000 e Suzuki GSX-R600 (piloto sentado: clipe bike_ride do bikes.ifp + mãos no guidão por IK) em public/models/bikes (nós body, wheel_F, wheel_R); V ou botão ↑ empina. Carros: Blista, Buffalo, Clover e Gol PMESP (GLB convertidos de DFF GTA SA em `public/models/vehicles/`; nós `body` + `wheel_FL/FR/BL/BR`, material `paint` recebe a cor do carro). Conversor: `exp3.js`/`build3.py` (ver CREDITS)
7. Deploy Vercel
8. Chat, ranking, roupas

## Regras para o Claude
- Uma etapa por vez, testar no navegador.
- Perguntar antes de serviço pago ou dependência pesada.
- Explicar alterações em frases curtas.

## Controles
- PC: WASD move · Shift anda · Q sprint · Espaço pula · E (ou C) escala · arrastar o mouse gira a câmera · G abre o menu de animações.
- Carros: a porta do motorista abre ao entrar e sair, e ele aparece sentado (clipe car_sit, mãos no volante por IK). F entra/sai (botão da porta no celular). PC: W acelera, S freia/dá ré, Espaço = freio de mão, A/D esterça. Celular: joystick só esterça; pedais Acelerar, Freio e Freio de mão na direita.
- Armas (botão Arma alterna): fuzil, pistola, placa de trânsito (traffic-sign.glb, usa as animações do taco), taco (a bandeira flag-turkey.glb, convertida do shovel.dff), punho (combo knife_1 a 4 do arquivo do usuário). Pistola 12/60 (15 de dano), taco 30. Joystick e WASD sempre andam devagar; Sprint (ou Shift/Q) corre. Depois de atirar a mira fica levantada por 3 s. A mira do HUD fica no centro da tela (o tiro sai por ela).
- Combate (PC): clique no jogo trava o mouse (gira a câmera); botão esquerdo atira, direito mira, R recarrega, 1/2/X troca arma, T/Enter abre o chat, M abre o mapa grande. Celular: botões de tiro, mira, recarga e arma; o Pular é o botão grande e escala sozinho perto de obstáculos altos (a tecla E também escala); o botão da porta só aparece perto de um carro (no lugar do Sprint); toque no minimapa abre o mapa; botão Chat.
- Câmera orbital: arrastar (dedo ou mouse) gira para os lados e inclina (dedo para cima = olhar para cima). Pitch de -34° a +69°. Ao mirar a câmera aproxima e passa para o ombro direito. Não atravessa prédios. O tiro vai para onde a câmera olha (cima/baixo incluído), saindo do cano. O atirador calcula o acerto, quem leva o tiro aplica o dano em si (casual, sem servidor). AK-47: 20 de dano, 40 na cabeça; colete absorve 60%. Morreu: renasce em 3,5 s.
- Celular: ao entrar o jogo vai para tela cheia e paisagem (onde o navegador não trava, aparece "Gire o celular"). HUD estilo GTA: minimapa, vida/colete, arma e munição, joystick, Sprint, tiro, mira, pular, porta (carro), escalar, chat e placar. Combate (dano, vida, kills) ainda não existe: munição e contadores são locais.
- Agachar: Z ou Ctrl (botão Agachar no celular). Armado o corpo sempre olha para a mira; anda de frente, de costas e de lado com clipes próprios (gun_*), corre com run_armed.
- Animação (refeita): o IFP é usado SEM inverter os quaternions (só a pélvis tira a rotação do osso Root). Carlos é recalculado a partir do Law (pernas/tronco por rotação de mundo, braços por direção). Com o fuzil, braços por IK nas empunhaduras, fuzil preso ao peito, tronco/cabeça acompanham a mira. Revisão por quadros: `npm run dev` e abrir `/dev/anim-viewer.html?char=Carlos`, depois `V.sheet('walk', 8)` no console.
- Dados de animação: `public/anims/ped*.json` (esqueleto GTA SA, Law1-9) e `carlos*.json` (baked). Os `-extra` carregam em segundo plano.

## Mapa (cidade)
- Gerado por código em `src/game/city.ts` (prédios com janelas em geometria fundida, árvores instanciadas). MASP é o modelo `public/models/map/masp.glb` (CC-BY, ver CREDITS.md).
- Limites em `MAP` (`src/game/map.ts`): 220 x 168 m. Avenida no eixo X (z de -12 a 12), 3 ruas transversais ao norte e 2 ao sul, Parque Trianon e estacionamento ao sul, MASP na calçada norte, 38 prédios (cremes, brancos, ocre, vidro, torre escura, casas de telhado vermelho/cinza).
- O layout é escrito no espaço da foto (`R()` em `city.ts`, X espelhado). Em desenvolvimento, `validate()` avisa no console se algum prédio cair em rua, avenida, calçada, estacionamento ou sobre outro prédio. Carros e ônibus do fundo (`updateCity`) são só decoração, sem colisão. Árvores têm tronco sólido e a câmera não entra nas copas.
- `src/game/tower.ts`: torre de concreto cinza modelada peça por peça a partir da foto de referência (pilares, vãos de janelas, cornija, parapeito, hall com marquise, casa de máquinas, venezianas, ventiladores, ar-condicionado e antenas treliçadas). Fica no lugar da antiga torre escura (centro -44, -33).
- Árvores: `src/game/trees.ts`. 4 espécies + arbusto, com altura real (carvalho 5,5–8 m, pinheiro 7–10 m, bordo 4–6 m, bétula 3,5–5 m, arbusto 1–2 m). Tronco afunilado com raízes e galhos curvos, copa de tufos com folhas recortadas (textura com transparência), cascas diferentes. Instanciadas por espécie; tronco sólido; a câmera não entra nas copas. No parque há distância mínima entre árvores grandes.
- Inspeção: `?cam=x,y,z,alvoX,alvoY,alvoZ` (câmera fixa), `?vista=aerea` (câmera de cima, como a foto da maquete) e `?pos=x,z` (ponto de partida).
