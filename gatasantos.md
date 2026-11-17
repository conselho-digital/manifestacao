# Gata Santos — especificação completa do jogo

> Arquivo para o Claude ler **inteiro** e construir o jogo sozinho, do zero, num repositório novo.
> É a descrição do jogo "Arena Online 3D" (nosso jogo atual), reescrita como pedido de construção.
> "Gata Santos" é o nome do projeto; o tema dos mapas (cidade brasileira com avenida, prédios, lojas) pode ser ajustado com o dono.

---

## 0. Como usar este arquivo (leia primeiro)

1. Leia o arquivo todo antes de escrever código. Depois crie um `CLAUDE.md` no repositório com o resumo das seções 2, 3 e 10.
2. Trabalhe **uma etapa por vez** (seção 5). Ao fim de cada etapa: rode `npm run check`, teste no navegador (seção 9), documente em `CLAUDE.md` uma seção "Rodada: ..." com o que fez, os números medidos e os limites, e só então commite.
3. **Crie tudo sozinho**: texturas, modelos, sons, animações e câmera são gerados por código (seção 7). Não baixe nem copie arquivos de jogos de terceiros (GTA etc.): as licenças não são livres. Se faltar um arquivo que só o dono pode dar (foto, som, modelo), peça.
4. Pergunte antes de: serviço pago (ex. Meshy, Mercado Pago), dependência pesada, qualquer coisa que gaste dinheiro, e antes de publicar chaves.
5. Explique alterações em frases curtas. O dono prefere respostas curtas, em português.
6. Nunca ponha chave secreta no código nem no chat. Só a chave **anon** do Supabase vai no front (`VITE_SUPABASE_ANON_KEY`); `.env.local` fica fora do git.
7. Faça `git push` só na branch que o dono indicar (no nosso caso, sempre `main`).

---

## 1. Visão do jogo

Jogo **multiplayer 3D no navegador** (PC e celular), estilo "mundo aberto casual" com tiro, veículos, voz por proximidade e loja.

- Vários jogadores no mesmo mapa (até 30 por sessão; novas sessões abrem sozinhas).
- Mapa 1: cidade com **avenida central**, quadras com prédios (térreo com lojas e cartazes), parque com árvores, museu/monumento no centro, calçadas largas.
- Mapa 2: um mapa **aberto e plano** (praça gramada central, duas avenidas, ministérios dos dois lados, prédio monumental com rampa, lagos rasos, relevo rebaixado).
- Personagens low-poly com **animação completa** (parado, andar, correr, agachar, pular, escalar, rolar, lutar, tomar dano, cair e levantar, entrar e sair de veículos, segurar armas).
- Armas de fogo (fuzis e pistola), armas brancas, lata de spray (pichação), veículos (carros e motos) com física simples, buzina, sirene, luzes.
- Pedestres (NPCs) que andam, se assustam, se escondem, caem e morrem.
- Equipes com duas cores, loja, inventário, ranking global, administrador.
- Tudo **grátis para hospedar**: site estático na Vercel + Supabase (plano grátis). **Sem servidor próprio** e sem servidor autoritativo (jogo casual; dano calculado no cliente, com validações de plausibilidade).

Público: jogadores casuais em celular e PC. Meta de desempenho: 60 FPS no PC médio e 30+ no celular médio.

---

## 2. Regras de trabalho

- TypeScript **estrito**, funções pequenas, poucas dependências. Dependências permitidas: `three`, `@supabase/supabase-js` (e as de desenvolvimento: vite, typescript, eslint). Qualquer outra: perguntar.
- Código e comentários em português.
- Antes de otimizar: **meça** (`renderer.info`, contador de FPS, amostragem de heap). Depois de otimizar: meça de novo e anote o antes/depois.
- Teste no navegador de verdade (Chromium sem tela com Playwright, GPU por software). Lembre: nesse ambiente os números de **tempo** não valem, só as contagens (chamadas de desenho, triângulos).
- Cada sistema novo deve ter um jeito de ser inspecionado no `npm run dev` (parâmetros de URL `?dev=1`, `?admin=1`, `?pos=x,z`, `?cam=...`, `?mapa=`, `?room=`, `?intro=0`) e um objeto `window.__game` **só no modo dev** com `camera`, `scene`, `renderer`, `combat()`, `player()`, `remotes()`, `npcs()`, `pickups()`, `look`.
- Documente cada rodada no `CLAUDE.md` (o que, números medidos, limites, o que ficou sem testar).
- Segurança básica: `npm run check` inclui lint, typecheck, build, relatório de tamanho, varredura de segredos e `npm audit --omit=dev`.
- O jogo todo (build) deve ficar **abaixo de ~15 MB**. Um script `scripts/size-report.mjs` lista os maiores arquivos e falha se passar.

---

## 3. Stack e estrutura

**Stack:** Vite + TypeScript + Three.js (r187) no front; Vercel (estático); Supabase (Auth Google, Realtime Broadcast + Presence, Postgres com RLS, Storage).

```
index.html            entrada do jogo (viewport sem zoom, meta canonical)
vercel.json           redireciona www -> domínio sem www; cabeçalhos de cache
public/
  models/             GLB (personagens, veículos, armas, mapa)
  anims/              clipes de animação em JSON
  sounds/             mp3 curtos (opcional; tudo precisa ter versão sintetizada)
  hud/                ícones (armas, veículos) .png
  faces/              fotos de rosto dos personagens (.webp, com ?v=N na URL)
  loading/            foto aérea de cada mapa (tela de carregamento)
src/
  main.ts             entrada, laço principal, ligação dos sistemas
  game/               cena, mapa, câmera, input, física, combate, veículos, NPCs, áudio...
  net/                supabase, sync (presence + broadcast), voz, login, ranking
  ui/                 menu inicial, pausa, HUD (PC e celular), carregamento, avisos
  editor/             (opcional) ferramentas: armas nas mãos, personagens
dev/                  páginas de ferramentas (só no npm run dev): visualizador de animação,
                      fotos de rosto, ícones de arma e de veículo
scripts/              check de segredos, relatório de tamanho, geradores de modelo/animação
supabase/             arquivos .sql das migrações (cópia do que foi aplicado)
assets-src/           originais de alta qualidade (fora do build)
```

Arquivos principais de `src/game/` (nomes sugeridos): `scene.ts`, `city.ts`, `esplanada.ts`, `trees.ts`, `shops.ts`, `map.ts` (limites, terreno, água), `player.ts`, `anim.ts`, `input.ts`, `combat.ts`, `weapons.ts`, `rifles.ts`, `vehicle.ts`, `npcs.ts`, `audio.ts`, `noise.ts`, `pickups.ts`, `graffiti.ts`, `billboard.ts`, `inventory.ts`, `teams.ts`, `settings.ts`, `characters.ts`, `autoRig.ts`, `culling.ts`, `preload.ts`.

---

## 4. Skills para instalar no repositório novo

As skills ficam em `.claude/skills/` (e o sub agente em `.claude/agents/`). Instale **antes** de começar.

**Origens (links do GitHub):**

| O que | Link |
|---|---|
| Nosso repositório (skills já escolhidas e copiadas em `.claude/skills/`, sub agente `.claude/agents/revisor-bugs-seguranca.md`, este arquivo) | https://github.com/conselho-digital/manifestacao |
| Skills de desenvolvimento de jogos (router, three.js, performance, câmera, entrada, UI, game feel, áudio, física, fps-shooter). Apache-2.0 | https://github.com/gamedev-skills/awesome-gamedev-agent-skills |
| Skills do Blender (câmeras, `blender-toolkit`, `threejs-export`, `image-to-3d` e `multi-image-to-3d`, `polyhaven-*`) | https://github.com/kevinbadi/blender-skills |

**Como instalar (o jeito mais simples — copiar do nosso repositório):**

```bash
# na pasta do repositório novo
git clone --depth 1 https://github.com/conselho-digital/manifestacao /tmp/manifestacao-skills
mkdir -p .claude
cp -r /tmp/manifestacao-skills/.claude/skills .claude/skills
cp -r /tmp/manifestacao-skills/.claude/agents .claude/agents
rm -rf /tmp/manifestacao-skills
```

Se o nosso repositório for privado, use `gh auth login` ou o MCP do GitHub, ou instale direto das origens (os dois últimos links).

**Skills que o jogo usa e quando abrir cada uma:**

- `router`: abra primeiro quando não souber qual skill vale.
- `threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting`: base do three.js (renderizador, GLB, SkeletonUtils, luzes, sombras, materiais sem luz).
- `performance-optimization`: método de medir antes de otimizar (orçamento de quadro, chamadas de desenho, alocações, engasgo da 1ª vez).
- `camera-systems`: câmera orbital em 3ª pessoa, colisão da câmera, suavização.
- `input-systems`: ações nomeadas, joystick, teclas, mouse preso.
- `game-ui-ux`: HUD por eventos, menus, margens de tela (notch), acessibilidade.
- `game-feel`: sensação de golpe/tiro (tremor, recuo, hit-stop).
- `audio-design`: barramentos, volumes, variação de sons.
- `physics-tuning`: passo de física, colisão rápida atravessando parede.
- `fps-shooter`: modelo de tiro, tempo para matar, recuo, cadência em relógio fixo, sensibilidade ao mirar.
- Blender (só numa sessão ligada ao computador do dono, com o Blender 5.x aberto e o addon `blender-mcp`): `blender-toolkit`, `threejs-export`; `image-to-3d` e `multi-image-to-3d` usam a API **paga** da Meshy (pedir antes).
- Sub agente `revisor-bugs-seguranca`: só lê e relata bugs e problemas de segurança (rede, Supabase/RLS, XSS, admin, vazamentos). Chame depois de mexer em rede, login, banco, loja ou admin.

---

## 5. Plano em etapas (uma por vez)

Cada etapa só termina quando o critério de aceitação passa **no navegador**.

1. **Esqueleto**: Vite + TS + Three.js, cena, luz, chão, `npm run check` verde, deploy na Vercel. *Aceite:* abre o site, cubo girando, `check` passa.
2. **Mapa 1 simples**: avenida + quadras + 6 prédios (caixas com textura de janelas gerada em canvas), colisão em caixas, muro em volta. *Aceite:* anda sem atravessar prédio.
3. **Personagem + câmera**: boneco low-poly gerado por código, WASD + mouse, câmera orbital 3ª pessoa que não atravessa prédios. *Aceite:* medir distância mínima câmera–parede ≥ 0,9 m em 64 posições.
4. **Animação**: parado, andar, correr, agachar, pular. *Aceite:* sem patinar (velocidade do passo = velocidade do jogo, seção 6.4).
5. **Menu inicial + login Google** (Supabase Auth) + escolha de personagem (carrosséis com foto do rosto) + escolha de equipe. *Aceite:* só entra quem fez login (no dev `?dev=1` pula).
6. **Multiplayer**: presence + broadcast `move`, interpolação, nome e equipe sobre a cabeça, sessões de 30 jogadores. *Aceite:* duas abas se veem, a 3ª cai em outra sessão com `?max=2`.
7. **Combate**: fuzil, pistola, vida/colete, morrer e renascer, placar, dano pela rede com validação, armas brancas, soco. *Aceite:* tabela de tempo para matar impressa, cadência correta a 15/30/60/144 FPS.
8. **Veículos**: carros e motos, entrar/sair em etapas, física simples, buzina, sirene, luzes, garagem. *Aceite:* entrar e sair, bater sem travar, moto cai a mais de 40 km/h.
9. **Áudio**: tudo sintetizado por código (motor, tiro, buzina, sirene, pneu, batida) com alcance por proximidade. *Aceite:* nada fica tocando depois de guardar o veículo (sem vazamento).
10. **Voz por proximidade** (WebRTC, aperte para falar). *Aceite:* duas abas conversam só perto.
11. **Pausa, loja, inventário, admin, equipes, ranking.** *Aceite:* as tabelas e as regras RLS (seção 6.14) testadas por SQL.
12. **Extras de mundo**: pedestres, pickups, pichação, outdoor, cartazes, lojas nos prédios, 2º mapa, relevo/água. *Aceite:* medições da seção 8 dentro do orçamento.
13. **Celular**: HUD de toque (joystick, botões), tela cheia, paisagem, FPS reduzido. *Aceite:* emulação de celular 844x390 joga tudo.
14. **Revisão final** com as skills (`router` → `performance-optimization`, `fps-shooter`, `game-ui-ux`) e com o sub agente de segurança; corrigir o que achar e documentar.

---

## 6. Especificação por sistema

### 6.1 Renderização e cena

- `WebGLRenderer` com `powerPreference: 'high-performance'`; `setPixelRatio(Math.min(devicePixelRatio, 2))` no PC e **até 1,5 no celular/tablet** (`pointer: coarse`), **sem antialias no celular**, sombra 2048 no PC e 1024 no celular.
- Relógio: `THREE.Timer` (não `Clock`); `dt` limitado a 50 ms; movimento sempre por `dt` real.
- Luz: hemisfério + uma direcional com sombra que segue o jogador. **Materiais sem luz** (`KHR_materials_unlit`/`MeshBasicMaterial`) nos personagens; sombra projetada por uma malha simples.
- Neblina branca e fraca: de 49 m a 161 m; câmera `far` = fim da neblina + 30 m; no menu/vista aérea o `far` é maior.
- **Descarte por distância** a cada 0,25 s: árvores além de 154 m, veículos além de 133 m; **sombras por distância**: árvores além de 55 m, veículos além de 40 m, pedestres além de 40 m; arbustos nunca projetam sombra.
- Malhas com esqueleto (`SkinnedMesh`) precisam de `frustumCulled` correto (esfera da pose atual + 1,2 m).
- Perda e volta do contexto WebGL devem recuperar a cena (testar com `forceContextLoss/Restore`).
- `warmUp` (pré-compilação de shaders) **com e sem neblina**, incluindo todo material com `onBeforeCompile`. Sem isso há engasgo na 1ª vez que algo aparece.
- Tela de carregamento: foto aérea do mapa em preto e branco que ganha cor conforme os passos terminam (cidade 8%, modelos 30%, shaders 50%, personagem 62%, conta 78%, arena 88%); no celular espera um toque (entra em tela cheia e paisagem). O menu inicial tem fundo liso; **nenhum mapa é montado antes do "Entrar"**.
- Voo de entrada: a câmera desce da vista aérea até atrás do personagem em ~3,4 s; o jogador espera sem comandos (`?intro=0` desliga).

### 6.2 Mapa 1 (cidade) — gerado por código

- Tamanho: quadras e prédios 220 x 168 m, mais **rua perimetral de 12 m** em volta, mais muro preto de 4 m (limite jogável 244 x 192 m).
- **Avenida** no eixo X (z de −12 a 12, 4 faixas, linha tracejada na textura), 3 ruas transversais ao norte e 2 ao sul, parque com árvores e estacionamento ao sul, monumento/museu na calçada norte. ~38 prédios de tipos: creme, branco, ocre, vidro, torre cinza de concreto, torre de cobre, casas de telhado vermelho/cinza.
- **Calçadas largas**; prédios com **metade da altura** do "natural" (mínimo 10 m; 18 m com térreo).
- Prédios: geometria **fundida** por material (poucas malhas, ~35 mil triângulos no total). Fachada = textura de canvas em metros (fileiras de 3 m, laje de 0,2 m no pé de cada fileira, pilares, janelas). Telhados sem detalhes caros (antenas ficam).
- Torre cinza modelada peça por peça (pilares, vãos, cornija, parapeito, hall com marquise, venezianas, antenas treliçadas).
- Escultura de letras 3D (cada letra: canvas → contorno por marching squares → `ExtrudeGeometry`, 1 malha por letra), pilar de latão, em frente a uma torre.
- Totem azul com semáforo (de veículos e de pedestres) e placa com o nome da avenida, em cada ponta da faixa de pedestres.
- **Árvores instanciadas por espécie** (carvalho 5,5–8 m, pinheiro 7–10 m, bordo 4–6 m, bétula 3,5–5 m, arbusto 1–2 m), tronco afunilado com raízes e galhos, copa de tufos com textura recortada; blocos de 40 m cada um como objeto próprio (corte por tela); troncos colidem, arbustos não; a câmera não entra nas copas.
- **Colisão**: lista `COLLIDERS` de caixas (prédios, troncos, postes, bancos, jardineiras, abrigos de ônibus, veículos parados) valendo para jogador, veículos, balas e câmera (engordada em 0,9 m). Em desenvolvimento, `validate()` avisa se algum prédio/poste cair em rua, avenida ou sobre outro.
- **Lojas nos prédios** (`shops.ts`): uma loja = 2 "células" da grade de colunas da parede (fachadas calculadas igual à textura): pilastras, vitrine de vidro com **interior pintado** (8 tipos: moda, tecnologia, café, mercado, livraria, farmácia, pizzaria, calçados), porta dupla, toldo colorido, letreiro com nome, **cartaz 3 x 2 m** na vitrine. Sem colisão; sem usar o gerador aleatório da cidade; cartazes em **atlas de canvas** (1 chamada de desenho por página); tudo que sai da parede multiplicado por 0,5 (loja fina). ~250 vagas numeradas ("Cartaz 01"...).
- Spawn: ponto aleatório na frente do monumento, olhando para ele.
- Dev: `?cam=x,y,z,ax,ay,az` (câmera fixa), `?vista=aerea`, `?pos=x,z`.

### 6.3 Mapa 2 (esplanada)

- 324 x 404 m com rua perimetral de 10 m e 2 m de grama até o muro. Duas avenidas (x ±55..±85), gramado central com fileiras de árvores (só fora dos caminhos), rua transversal, ministérios (blocos iguais, 24 m) dos dois lados, palácio com colunata, galpões, estacionamentos com vagas de 2,6 x 5 m (textura `lotBays` com corredor no meio), pontes, postes instanciados, cancelas (poste + braço vermelho/branco com colisão).
- **Prédio monumental** (laje de 89 x 35 m, teto a ~5 m, rampa que sobe andando, duas torres de ~30 m, cúpula e tigela): modelado por código ou modelo próprio. **Terreno rebaixado** em volta dele (−5,3 m) com taludes e rampas suaves (`pitHeight`/`terrainHeight`), **lagos rasos** (jogador anda a 60% da velocidade na água; veículos freiam) com margem de pedra em anel e pontes secas por cima. O terreno vale para jogador, veículos (4 pontos de apoio, inclinam com a ladeira, decolam em crista rápida; gravidade de veículo 22 m/s²) e tiros.
- Camadas de chão com `polygonOffset` (ruas −2, calçadas −1) para não brigar em vista distante.
- Cada mapa tem **sala própria** (`arena:<mapa>`, `-2`, `-3`...). Trocar de mapa no menu **não recarrega a página** nem muda o endereço; o mapa só é montado ao clicar em Entrar.

### 6.4 Personagens e animação

**Personagens (gerados por código ou por modelos próprios sob licença livre).**
- Altura 1,8 m, origem nos pés, olhando para **+Z**, material sem luz, **máx. ~3000 triângulos** (rosto pode ter mais, até ~10 mil, se for textura detalhada), texturas até 512 (atlas de 1024 só para rosto).
- Pelo menos **9 personagens** em categorias (Famosos, Polícia, Gangue, Meninas...), cada um com **foto do rosto** `public/faces/<Nome>.webp` gerada pelo próprio jogo (página `dev/face-shots.html`).
- **Esqueleto único** (nomes de ossos estilo GTA: Pelvis, Spine, Spine1, Neck, Head, R/L Clavicle, UpperArm, ForeArm, Hand, Finger, Thigh, Calf, Foot, Toe0). Qualquer malha sem esqueleto ganha esse esqueleto **em tempo de execução** (`autoRig.ts`): cada vértice recebe os 4 ossos mais próximos com peso `1/(distância além do raio do osso)³` usando cápsulas (pélvis, coluna, pescoço, cabeça, clavículas, braços, mãos, coxas, canelas, pés), mantendo materiais. Detecta pose em T e gira os braços até a direção do esqueleto; para personagens com pose A mais aberta, `ARM_IN` gira os braços alguns graus para dentro antes dos pesos.
- Pipeline para modelos **sem esqueleto**: GLB limpo (altura 1,8 m, eixo certo, atlas de textura único, dilatação das ilhas de UV, malha opaca de uma face e malha de recorte para cabelo). Rosto com muitos detalhes pequenos (sobrancelhas, olhos) deve ficar numa **malha de cabeça separada** simplificada com bordas travadas.
- Cuidado ao pintar rosto de foto em atlas: projete a foto de frente por coordenadas do modelo, misture pelo ângulo da superfície, nunca deixe o fundo branco da foto entrar, e pinte a íris das esferas dos olhos.

**Animação (tudo por código — não use arquivos IFP/FBX de terceiros).**
- Clipes necessários: `idle`, `walk`, `run`, `sprint`, `crouch_idle`, `crouch_walk`, `jump`, `fall`, `land`, `climb_pull`, `climb_jump`, `roll_f/b/l/r` (+diagonais), `punch_1..3`, `kick_1/2`, reações `hit_front/back/l/r`, `ko_back/ko_front`, `getup/getup_front`, `dive` (queda de moto), entrar/sair de carro e moto (`car_open_l`, `car_getin_l`, `car_closedoor_l`, `car_getout_l`, `car_close_l`, `bike_mount_l/r`, `bike_pickup_l/r`), `car_sit`, `bike_ride`, golpes com arma branca (`bat_idle`, `bat_swing`, `knife_1..3`), pistola (`arrestgun`, recarga), fuzil (`gun_idle`, `run_armed`, andar de frente/trás/lado), spray.
- Gere cada clipe por **funções** (ciclos senoidais de coxa/canela/braço/tronco, curvas de pose-a-pose com suavização, `slerp` de quaternions) e grave em `public/anims/*.json` (`tracks [{id, t, q}]`, `move` = deslocamento do osso Root `f/l/u` em metros, `drop`).
- **Passo × velocidade**: o clipe deve avançar exatamente o que o jogo anda. Medida usada: andar 2,1 m/s, correr 6,2 m/s, agachado 1 m/s; guarde `TIME_SCALE` por clipe (velocidade do clipe × escala = velocidade do jogo) e **meça pelo pé de apoio** com um script antes de fechar.
- **Braços por IK** (2 ossos, cotovelo pelo lado certo) para: fuzil (mãos na empunhadura e no guarda-mão), pistola (duas mãos), arma branca (mão direita na frente do peito, esquerda acima no cabo), volante, guidão, escalada (mãos na borda), spray (uma mão, palma para a frente).
- Arma branca presa ao **centro dos dedos fechados** da mão direita. Orientação calibrada no `bat_idle` (para cima e um pouco à frente).
- Socos e tacada: pernas e quadril **parados** na pose do 1º quadro (o giro vai para a coluna) para não patinar; chutes mantêm as pernas.
- Levantar e nocaute: corpo **apoiado pelo osso mais baixo** (`LIE_CONTACT` 0,08 m, nunca sobe).
- Roll/tombo exigem o osso Root: aplique a rotação do Root no eixo próprio (`Root_local = stand⁻¹ · d · repouso`) e **confira comparando a trajetória pélvis→pescoço** com um personagem de referência.
- Entrar em veículos em **etapas** (`approach → open → getin → close` e `getout → close`; moto: `mount` ou, se caída, `pickup → mount`). O corpo anda até a porta (contorna o veículo se a reta passaria por dentro), `seatBlend` leva o corpo da porta ao banco. O clipe é nomeado para que o **jogador remoto repita tudo pelo nome do clipe**.
- Ferramenta de revisão: página `dev/anim-viewer.html?char=Nome` com `V.sheet(clip, n, armed, pitch, views)` (quadros lado a lado), `V.bones(clip, t)`, `V.strip`, `V.track`. Use para conferir quadro a quadro.

### 6.5 Câmera

- Orbital em 3ª pessoa: arrastar (dedo ou mouse preso) gira para os lados e inclina; pitch de −34° a +69°; pitch inicial 0,28 rad.
- A pé: **2,7 m atrás e 0,7 m à direita** do personagem, olhando na altura da cabeça (a mira do centro não cai sobre ele). Tecla **G** alterna "perto" (metade da distância e do ombro). Mirando: cola no ombro direito (1,35 m atrás, 0,55 m à direita), FOV × 0,7 com transição suave.
- **Não atravessa prédios**: plano próximo 0,4 m; recuo mínimo 0,3 m; `pushOutOfBoxes` empurra a câmera para fora de toda caixa de colisão engordada em 0,9 m, no ponto desejado e **de novo depois do suavizado**. Medir: ≥ 0,9 m em 64 posições (16 giros × 4 inclinações).
- Dirigindo: atrás do veículo quando em movimento (> 0,8 m/s); parado, olha para todos os lados.
- **Sensibilidade**: padrão 0,6x (ajustável 0,2x–3x nas configurações); ao mirar, multiplicar o giro por `tan(fov atual/2)/tan(fov normal/2)`. Mouse e toque usam a mesma conta.
- Sem 1ª pessoa (foi removida a pedido do dono).

### 6.6 Entrada (PC e celular)

**PC:** WASD move (andar devagar por padrão), Shift/Q corre (para na hora que solta), Espaço pula, E escala (e liga luzes da viatura dentro do carro), Ctrl/C agacha (andando + agachar = rolar), F entra/sai de veículo, clique atira, botão direito mira, R recarrega, roda do mouse troca de arma, teclas 1/2/X próxima arma, B loja, V garagem, G câmera, P menu, M mapa grande, T voz (apertar para falar), H buzina, L esconde/mostra legenda das teclas, Alt (segurando) solta o mouse, Esc solta o mouse. Legenda das teclas no canto inferior esquerdo.
**Dirigindo:** W acelera, S freia/dá ré, A/D esterça, Espaço freio de mão, Shift empina a moto, H ou clique esquerdo buzina (segurar 0,5 s liga a sirene da viatura).
**Celular:** joystick à esquerda (sempre anda devagar), botões: Sprint (continua correndo 0,5 s depois de soltar), tiro (dois botões), mira (dois botões, ligados entre si), pular (grande, escala sozinho perto de obstáculos altos), agachar, arma (toque abre menu de seleção com mais de 3 armas; arrastar para cima/baixo passa), recarregar, porta (só perto de veículo), microfone, garagem, pedais (acelerar, freio, freio de mão), buzina, luzes. Vibração curta ao tocar botões dirigindo (Android). Tela cheia + paisagem travada com botão. HUD estilo GTA: minimapa, vida/colete, arma e munição, contador de FPS (cores relativas ao limite).
- Opção de limite de FPS (30/45/60/90/120; **desligado por padrão**); o limite apenas **demora para pedir o próximo quadro** numa grade fixa, nunca descarta quadros.

### 6.7 Combate

- **Vida 400** (HUD e rede em porcentagem), colete até 100 (absorve 60% do dano). Morrer: renasce em 3,5 s num ponto seguro; **proteção de 60 s** depois de renascer; a pausa também dá imunidade (só no seu jogo).
- Tiro: **hitscan a partir da câmera**, depois do cano até o ponto de mira (cobertura em frente à arma bloqueia). A bala para em prédios, carros, motos e pedestres. Cabeça × 2.
- **Cadência em relógio fixo**: `cd = gap + cd` (a sobra do quadro entra no próximo intervalo; parado mais de 1 intervalo recomeça do zero) e, se o quadro foi maior que o intervalo, saem até 3 tiros. Testar a 15/20/30/60/144 FPS: 10 s de fogo = `10/gap` ± 1 tiros.
- Dispersão: 0,003 mirando e 0,012 sem mirar, disco (não quadrado). Depois de atirar, a arma de fogo fica levantada **0,6 s** e baixa suave; segurar Correr cancela na hora.
- **Dano pela rede (sem servidor)**: o atirador calcula o acerto e manda; quem leva aplica dano em si **só se for plausível** (`plausible`): atirador vivo e a pé, a menos de 8 m de onde diz que disparou, raio passa pelo meu corpo (margem), sem parede no caminho, dentro do alcance + 5 m, na cadência da arma × 0,6. Abates: 1 por vítima a cada 3 s; só contam para ranking/dinheiro se eu acertei a vítima nos últimos 15 s.
- **Armas** (dados em tabela; gere uma **tabela de tempo para matar** por arma e por vida do alvo):

| Arma | Dano (corpo) | Cadência | Pente/reserva | Obs. |
|---|---|---|---|---|
| Fuzil A | 20 | 0,11 s | 30/120 | cabeça 40 |
| Fuzil B | 18 | 0,09 s | 30/120 | |
| Fuzil C | 22 | 0,12 s | 30/120 | tiro mais lento e grave com eco |
| Fuzil silenciado | 16 | 0,10 s | 30/120 | tiro baixo (ouvido a ~9 m) |
| Pistola (revólver) | 15 | gap próprio | 12/60 | duas mãos |
| Armas brancas (taco, bandeira, placa, cano, foice, machado, garrafa, cutelo, faca) | 7,5 | 0,3 s de atraso até acertar (duas mãos) | — | só 1 clipe de golpe; faca/garrafa/cutelo em sequência de 3 |
| Punho | 12 (chute com mais alcance) | combo de 3 socos + chute | — | |
| Lata de spray | 0 | — | — | pinta parede (6.17) |

- Munição **de graça**, mas só **enche a cada 15 min** (guardado por conta no navegador, conta o tempo com o jogo fechado; admin não tem limite). Aviso na 1ª recarga e quando acaba.
- Recarga 1,6 s com animação (a mão esquerda vai buscar o carregador) e som; os outros jogadores veem a recarga (`rl` no `move`).
- Pickups: 30 de vida (+25%) e 30 de colete (+50), em posições fixas por mapa (sorteio com semente), a ≥ 14 m uma da outra, só em chão livre; pegam a 1,3 m e voltam após 90 s (estado local). 3 chamadas de desenho (InstancedMesh).
- Dano ao bater moto acima de 40 km/h: `min(380, (v − 8) × 9)`.
- Atropelado por veículo a > 16 km/h: tombo e levanta.

### 6.8 Veículos

- Modelos: **3 carros** (`Gol`, `Buffalo`, `Opala` — nomes livres), **4 motos** (cruiser, esportiva ×2, naked) e **1 viatura**. Nós: `body`, `wheel_FL/FR/BL/BR` (moto `wheel_F/R`), portas `door_L/door_R`. Gere-os por código ou com modelos de licença livre; **máx. ~5000 triângulos** e ~16 chamadas por veículo (cores lisas viram cor de vértice, malhas do mesmo material fundidas dentro de cada nó). Só a carroceria projeta sombra.
- Cores: 5 opções iguais para todos (azul escuro, vinho, branco fosco, cinza, amarelo); cor inicial por modelo; escolhida na garagem com **pré-visualização** (foto desenhada do modelo real) e só chama o veículo no botão Chamar. A viatura mantém a pintura própria. A equipe aparece só como **adesivo redondo** nas portas da frente dos carros.
- Física simples: carro máx. 120 km/h (33,3 m/s), moto 130 km/h (36,1 m/s); aceleração cai perto do topo; direção firme em alta (`max(0,4, 1 − v/45)`); freio de mão trava as rodas traseiras e a traseira derrapa (`slip`); empinar a moto (Shift) acima de 3 m/s.
- Batida em parede: **não trava nem quica**; tira só a parte da velocidade que entra na superfície, desliza pela tangente, alinha com a parede e solta **faíscas** (Points aditivo, 160 partículas) com som de lata raspando; de frente > 2,5 m/s soma um estalo de metal. Contra outro veículo: quique. Moto: batida > 11 m/s joga o piloto para a frente (`dive` + queda falsa de boneco), a moto fica caída até alguém subir.
- Colisão entre veículos e pessoas por círculos; veículo parado só é empurrado se o lugar novo estiver livre.
- **Garagem**: cada jogador chama o seu veículo (aparece à frente em lugar livre a 5,4 m de outros). Quem entra: o dono e a equipe do dono. Vai pela presence (`veh {m,c1,c2,t,x,z,h,k}`) e quem dirige manda `v = 8` + dono no `move`.
- Partida do motor só 0,2 s depois de fechar a porta (moto: ao acabar a subida); `Car.dispose()` para sons e solta materiais.
- **Viatura**: sirene (lamento 600–1400 Hz, segurar buzina 0,5 s liga/desliga, desliga ao sair), luzes (vermelha/azul piscando 2×/2×, ciclo 0,8 s) na tecla E, buzina de caminhão de bombeiros com a sirene ligada. Os outros veem por avisos a cada 1 s.
- Os mapas **não têm carros soltos**: só os da garagem.

### 6.9 Pedestres (NPCs)

- 26 no PC e 18 no celular, sorteados entre personagens civis leves (as meninas de 11–14 mil triângulos e o personagem famoso ficam só para jogadores). **Locais** (cada jogador vê os seus; nada vai pela rede).
- Andam em linha reta (2,1 m/s) até um ponto livre a 8–30 m, esperam 2–7 s e escolhem outro; seguem o terreno; param além de 75 m e somem além de 110 m. Nascem 8 perto de quem entrou (10–45 m).
- Vida 60. Tiro, golpe, **susto por barulho** de tiro (35 m; 10 m se silenciado) e atropelo (> 4,5 m/s, dano `20 + v × 5`): reagem pelo lado do golpe, são empurrados, **fogem e se escondem** atrás de algo fora da linha de visão (agachados 10–18 s), morrem caindo de costas/bruços e ficam 9 s no chão, depois outro nasce a ≥ 40 m. Atropelados voam (≤ 1,2× a velocidade, máx. 20 m/s), rolam e levantam. Colidem com todos os veículos. Matar pedestre não rende dinheiro nem ranking.

### 6.10 Áudio (tudo sintetizado por código; mp3 curtos só se o dono mandar)

- **Alcance por proximidade** para tudo (tiro, motor, pneu, buzina, batida, raspão, sirene): volume e lado pela distância até o ouvinte; **fator de escala `RING_SCALE` = 0,21** (o som some perto de onde o círculo do chão mostra).
- Motor por modelo (`PROFILES`): osciladores + ruído, tom e filtro sobem **contínuos de 0% a 100% da velocidade**, sem marchas; soltar o acelerador volta ao motor parado; partida sintetizada (`crank`); chiado de pneu pelo ângulo entre trajetória e direção (vale para outros jogadores).
- Tiros: fuzil grave e longo, pistola seca, silenciado só estalo; longe perde agudos (passa-baixa que fecha com a distância); eco de 3 repetições para o fuzil lento. Recarga em 4 cliques espaçados (0, 0,42, 0,92, 1,36 s). Buzina (carro 2 notas graves, moto mais aguda), sirene, estalo de batida, lata raspando (ruído com trepidação de 38 Hz), pegar item.
- **Círculo do som no chão** (opção): mostra em volta de cada fonte até onde o som chega (tiro ~22 m, buzina ~13 m, motor ~11 m, sirene ~24 m). `noiseBurst` (som curto) e `noiseHold` (contínuo).
- Vazamento: todo oscilador criado precisa ser parado ao remover o veículo ou o jogador.

### 6.11 Voz por proximidade

- **Aperte para falar** (botão do microfone ou T; transmite só enquanto apertado, 0,25 s de folga; solta ao perder o foco). Ouvir não depende disso; quem não ligou a voz não abre conexão.
- WebRTC direto entre navegadores, sinalização (`rtc`: offer/answer/ice) pelo canal do Supabase; STUN público do Google, sem TURN (avisar que algumas redes não conectam). Conecta a 3,4 m, desliga a 4,5 m, **máx. 8 conversas**; volume cheio até 0,75 m e cai com a distância; lado pela posição.
- **Alcance pelo volume da voz**: `Meter` (RMS suavizado) no microfone (sem ganho automático) e em cada áudio recebido; nível de −58 dB (0) a −18 dB (1); alcance = `3 m × (0,1 + 0,9 × nível)`. Círculo no chão do tamanho do volume, só quando há som.
- Chat de texto **não existe** (só mensagens do sistema).

### 6.12 Multiplayer (Supabase Realtime)

- Canal `arena:<mapa>` (`-2`, `-3`... até 12 sessões; cada uma é um canal separado: presence, movimento, tiros, voz, buzina). **Máx. 30 por sessão**, checado ao entrar (espera a 1ª lista de presença, até 2 s); `?max=2` baixa o limite no dev; aviso "Sessão N" no feed.
- **Registrar o ouvinte de presence ANTES de `subscribe()`** (depois o Supabase recusa: erro "cannot add presence callbacks"). Só vira jogador remoto depois de aceito.
- Presence: `id, nome, personagem, equipe {name,c1,c2}, veh {...}`; validar tudo com funções `clean*`. Trocar equipe/personagem usa `updateMe` e os outros atualizam ao vivo.
- Broadcast `move` a 10–15/s: posição, rotação, nome do clipe, veículo (`v`, dono), arma (código 0–22), `pitch`, `hp %`, proteção, recarregando. Interpolar no cliente (buffer de ~100 ms). Outros eventos: tiro, golpe, kill, spray, buzina (`kind` 0 carro, 1 moto, 2 sirene, 3 luzes, 4 caminhão, 5 batida; 1 por 250 ms), `rtc`.
- Remoto: `RemotePlayer` com animador próprio, nome em textura de canvas, anel da equipe no chão (duas cores) e faixa de duas cores no nome; **liberar texturas e geometrias** ao sair.

### 6.13 Login, equipes, loja, ranking e admin (Supabase)

- **Login obrigatório com Google** (botão oficial GSI + `signInWithIdToken`, FedCM no Chrome; o popup mostra o endereço do SITE). Pedir ao dono: criar projeto Supabase novo, ligar o provedor Google, pôr o domínio final (sem www) em "Origens JavaScript autorizadas" do cliente OAuth. O site publicado exige login; `?dev=1` pula só no `npm run dev`. Desligar cadastro por e-mail/senha.
- Tabelas (todas com **RLS ligada**; `is_admin()` confere o e-mail verificado do login Google contra a tabela `admins`, que o navegador não lê):
  - `teams (id, name, color1, color2, sort, graffiti_url)`: leitura pública, escrita só admin. Iniciais: 4 equipes (ex. verde-amarela, vermelha-branca, amarela-preta, branca).
  - `admins (email)`.
  - `shop_prices (item, price, link)` (leitura pública, escrita admin) e `purchases (user_id, item)` (cada um lê só as suas; o navegador **não** grava).
  - `ranking (user_id, name, kills, deaths, updated_at)`: select público só de `name, kills, deaths, updated_at`; **sem escrita direta**; função `report_score(nome, abates, mortes)` (security definer: exige login, soma no máximo 10 de cada por chamada e 1 chamada a cada 4 s de forma atômica, teto de 300/h; nome limpo e cortado em 20) e `my_ranking()`.
  - `posters (slot_id, url, price, owner, expires_at)`, `poster_slots` e função `claim_poster(p_slot, p_path, p_price)` (6.17).
  - `billboard` (estado do telão, gatilho para `updated_at`) e função `server_time()`.
  - Buckets públicos: `graffiti`, `posters`, `chars` (e fotos); escrita só admin, exceto `posters` (qualquer login, `<vaga>/<número>.webp`, no máx. 6 por conta).
- Guarde **cada migração** em `supabase/*.sql`. Teste regras por SQL numa transação desfeita.
- Inventário no navegador por conta (`arena-inv:<id>`), começa com punho e $1000, **todas as armas de graça**. Só **veículos** (R$) dependem de `purchases`; munição/vida/colete em dinheiro do jogo ($). Preço e link ficam na tabela. A liberação da compra é por registro em `purchases` (admin pelo SQL ou, no futuro, webhook do Mercado Pago em função de borda — **nunca** chaves no código nem no chat). Admin tem tudo.
- **Equipes**: anel de duas cores sob os pés; admin edita nome e cores (seletor) e envia a imagem de grafite (`toLightImage`: 512 px, webp < 300 KB). Equipe padrão sempre marcada (não existe "sem equipe").

### 6.14 Segurança e limites do jogo casual

- O canal Realtime é público: dizer isso no `CLAUDE.md`. Para anti-cheat de verdade seriam necessários canais privados com RLS em `realtime.messages` e validação no servidor (ficou como melhoria).
- Todo dado vindo da rede passa por `clean*` (tipos, limites, cadência). Imagens de cartaz: ignore > 4096 px de lado ou 3 milhões de pixels. Nomes: limpar quebras de linha e caracteres de controle.
- Funções SQL `security definer` com `set search_path`; nada de `select *` público em tabelas com `user_id`.
- Rode o sub agente `revisor-bugs-seguranca` ao fim de cada rodada que mexa em rede, banco, login, loja ou admin.

### 6.15 Menus e HUD

- **Menu inicial**: fundo liso (gradiente escuro). Cartão com a **foto do rosto** do personagem, nome (máx. 16), botão "Continuar com o Google" e depois "Entrar no jogo", escolha da equipe e do mapa (botões). Tocar na foto abre a seleção: **carrosséis por categoria** (setas no PC, arrasto no celular). Fotos sem `loading="lazy"`; URL com `?v=N` para furar o cache.
- **Pausa** (P/engrenagem): abas Equipe, Personagem, Armas, Loja, Garagem, Ranking, Configurações e (só admin) Gerenciar equipes, Preços, Outdoor, Ferramentas. Pausar congela só o jogo local (os outros continuam). Rodapé com créditos.
- **Configurações**: sensibilidade da câmera, limite de FPS, círculo do som, "Voltar ao menu" (2 toques).
- HUD: minimapa (alcance `max(halfX, halfZ)`), vida e colete, arma e munição, dinheiro, placar (Tab), feed de mensagens do sistema, avisos no topo, nome e equipe, botão do microfone, mapa grande (M).
- Margens de tela do celular (`env(safe-area-inset-*)`) em tudo que encosta na borda; textos mínimos de 18 px.

### 6.16 Equipes, grafite, outdoor e cartazes (extras)

- **Lata de spray**: toque em atirar com parede lisa à frente (`findWall`: raios horizontais em várias alturas de 0,2 a 2,6 m, precisa ser reta numa área de ~2 m e quase vertical; muretas e jardineiras geram pintura menor, mín. 0,7 m) — o braço estica, solta névoa na cor da equipe por 1,4 s e aparece a imagem da equipe (decalque, máx. 40, os mais velhos somem). Evento `spray` validado (1 por 0,9 s). Não é salvo.
- **Outdoor** (telão 12 × 6,75 m): estado numa linha da tabela `billboard` (video_id, live, playing, position), todos leem, só admin altera; Realtime + conferência a cada 20 s; todos tocam na **mesma posição** (hora do servidor). Vídeo do YouTube num quadro flutuante (IFrame API) quando o jogador está a menos de 58 m, volume cai com a distância. Painel admin com link, verificar, colocar/tirar, ±10 s, tocar/pausar.
- **Cartazes pagos**: qualquer jogador com login, 1ª imagem $2 (dinheiro do jogo), 24 h no ar; só sai se alguém pagar **mais** (mínimo = pago + 1, máx. + 100); no máx. 3 ativos por conta; só vagas da tabela `poster_slots`; o admin não paga. A imagem é cortada em 3:2, 1200 × 800 webp ≤ 450 KB; botão redondo "Ad" aparece só a menos de 1,05 m de um cartaz; prévia só para quem edita; "Pagar e salvar" confere saldo e mínimo, publica e só então cobra.

### 6.17 Configurações padrão

Sensibilidade 0,6x; limite de FPS desligado; círculo do som ligado; câmera "longe"; personagem padrão o 1º da lista; equipe a 1ª.

---

## 7. Texturas, modelos e sons gerados por código

Nada precisa ser baixado. Regras:

- **Texturas de canvas** (`document.createElement('canvas')`, `CanvasTexture`, `colorSpace = SRGBColorSpace`): grama (ruído), asfalto (ruído + faixas + linha tracejada + faixa de pedestres), calçada de pedra, fachadas em metros (fileiras de 3 m, janelas com reflexo, pilares, laje de 0,2 m), telhado nervurado, vagas de estacionamento (2,6 m × 5 m), interior de lojas (8 tipos), letreiros, cartaz de exemplo numerado, folhas recortadas (alpha), cascas de árvore, desenho de reserva do grafite (faixas nas duas cores + nome).
- Prédios: geometria fundida por material e **UV em metros** (a textura repete por metro, não esticada).
- **Modelos**: personagens low-poly, armas e veículos montados por código (caixas, cilindros, `ExtrudeGeometry`, `LatheGeometry`) ou exportados do Blender (skills do Blender, só com o computador do dono ligado). Fundir geometrias por material; cores lisas viram cor de vértice. Escreva pequenos scripts em `scripts/models/` para gerar e salvar os GLB (`GLTFExporter`).
- **Ícones** das armas e dos veículos: renderize o próprio modelo num canvas (páginas `dev/weapon-icons.html`, `dev/vehicle-icons.html`) e salve `public/hud/*.png` (512 × 256). Fotos dos rostos: `dev/face-shots.html` (câmera a 20° de FOV, 1,25 m, centrada no rosto).
- **Sons**: WebAudio (osciladores, ruído filtrado, envelopes). Faça uma função por som e uma tabela de perfis por motor.
- **Foto aérea da tela de carregamento**: screenshot da vista de cima do próprio mapa (1400 × 900, neblina e sombras desligadas, webp ~72).
- Peça ao dono só o que não dá para gerar: **foto do rosto** de personagens reais e logotipos. Avise que fotos enviadas ficam públicas para todos os jogadores.
- **Licenças**: tudo que for de terceiros entra em `CREDITS.md` com autoria e licença verificada. Modelos e animações de jogos comerciais/mods **não** podem entrar.

---

## 8. Orçamentos de desempenho (medir com `renderer.info`)

| Item | Meta |
|---|---|
| Build total | < 15 MB |
| Mapa 1 renderizado | ≤ ~200 mil triângulos, ≤ ~370 chamadas |
| Mapa 2 renderizado | ≤ ~260 mil triângulos, ≤ ~270 chamadas |
| Prédios | poucas malhas fundidas (~35 mil triângulos) |
| Árvores | ~85 mil triângulos instanciados no máx. |
| Veículo | ≤ ~5000 triângulos e ≤ ~16 chamadas |
| Personagem | 1–2 malhas e 1 atlas (2,7–5,3 MB de GPU) |
| Pedestres desenhados | ≤ 26 malhas com esqueleto, ~14 com sombra |
| Laço principal | ~1 KB/quadro de alocação (sem lixo) |
| Pixel ratio | PC ≤ 2, celular ≤ 1,5 |

Medir sempre antes e depois de cada otimização e escrever os números no `CLAUDE.md`.

---

## 9. Como testar

- `npm run dev` (porta fixa, ex. 5199) e **Playwright com Chromium sem tela** (`--use-gl=swiftshader --enable-unsafe-swiftshader --no-sandbox`). Scripts de teste ficam na pasta de rascunho, não no repositório.
- Sempre `?dev=1&admin=1&room=<nome>&intro=0&pos=x,z`; aguardar `__game.ready()`; no PC a tela de carregamento some sozinha.
- Verificações automáticas mínimas por sistema:
  - cadência de tiro a 15/20/30/60/144 FPS (simulação) e no navegador;
  - câmera × parede (64 posições);
  - passo × velocidade (pé de apoio);
  - entrar/sair de carro e moto (`mode`: approach → enter → drive);
  - sem vazamento de som ao guardar veículo;
  - duas abas na mesma `?room=` se veem; a 3ª cai na sessão 2 com `?max=2`;
  - `renderer.info` antes/depois;
  - página sem erros (`pageerror` vazio).
- Para animações: visualizador `dev/anim-viewer.html` e `V.sheet`. Ao medir com `mixer.update(0)`, pare as outras ações.
- Para banco: SQL em transação desfeita.
- No fim: `npm run check` verde, depois commit com mensagem curta e push na branch combinada.

---

## 10. Lições aprendidas (armadilhas reais que já custaram tempo)

1. **Presence do Supabase**: ouvinte antes de `subscribe()`.
2. **Matrizes do mundo** só existem depois do 1º desenho (`getWorldPosition` força) — importa em testes.
3. **Shaders**: `warmUp` com e sem neblina; incluir toda pintura com `onBeforeCompile`; nó de roda com 1 só primitivo vira o próprio Mesh (clonar materiais pulando `wheel*`).
4. **Sons**: todo oscilador precisa de parada; `dispose()` ao guardar veículo ou sair da sessão.
5. **Texturas de canvas** sem `colorSpace` sRGB ficam lavadas.
6. **Cache do navegador**: modelos/fotos têm cache de 1 dia (+7 de revalidação). Ao trocar um arquivo que o jogador já viu, ponha `?v=N` na URL (fotos de rosto, ícones dos veículos).
7. **Atlas de textura**: UV com repetição (V em 1..2) precisa de deslocamento inteiro por triângulo; ilhas precisam de dilatação (senão riscos pretos nas pernas por causa do mipmap).
8. **Simplificar rosto**: sobrancelhas, olhos e brincos são cascas soltas que a simplificação apaga primeiro; mantenha a cabeça numa malha própria com bordas travadas.
9. **Auto-rig**: cuidado com o fator de mistura em y (1 nos braços que pendem; o do T-pose é o inverso). Não tente acertar cotovelo e antebraço separados (mexe em outros personagens).
10. **Rotação do Root** em clipes de tombo: use `stand⁻¹ · d · repouso` e compare com a referência; a ordem errada faz rolar de lado.
11. **Corpo a corpo**: o dano só vale ~0,3 s depois do clique, senão a arma "bate com as costas".
12. **Armas brancas** oscilavam entre dois sinais porque a orientação vinha da reta entre mãos coladas; calibre no `bat_idle`.
13. **Limite de FPS** nunca descarta quadros; usa grade fixa. Contador de FPS com ±1 do limite = limite.
14. **Tempo de quadro no navegador de teste** é de software: só valem as contagens.
15. **Dano da rede** sempre com `plausible` (distância, linha de visão, cadência).
16. **Clipes remotos pelo nome**: o jogador remoto repete etapas de entrar/sair pelo nome do clipe.
17. **Mapas**: nada pode ler o mapa atual em tempo de importação (valores `export let`, objetos alterados no lugar), senão trocar de mapa sem recarregar quebra.
18. **Terreno**: tudo que fica no chão (postes, cancelas, torres) precisa de `pitHeight`; veículos medem 4 pontos.
19. **Lojas**: não dá para afundar a loja dentro da parede (o interior pintado some): diminua o que sai (`DEPTH`).
20. **Câmera**: o recuo mínimo antigo (1,6 m) deixava a câmera atrás da parede; use `pushOutOfBoxes` duas vezes (antes e depois do suavizado).
21. **Entrar no mapa**: só depois do clique (PC) ou toque (celular), para permitir tela cheia e mouse preso.
22. **Mouse preso**: depois de menus (garagem, loja) prenda de novo (2 tentativas, tirar o foco do botão).
23. **Sensibilidade**: sempre multiplicada por `tan(fov)/tan(fov base)` ao mirar; mouse delta não leva `dt`.
24. **Fotos de rosto por foto real**: o fundo branco vaza nas orelhas; troque por cor de pele; pinte a íris das esferas dos olhos; compare de frente, 3/4, lado e costas.
25. **Nunca** commite chaves; `npm run check:secrets` na rotina.

---

## 11. Definição de pronto

O jogo está pronto quando:

1. As 14 etapas da seção 5 passam nos critérios de aceitação.
2. `npm run check` está verde e o build tem menos de 15 MB.
3. Duas pessoas em navegadores diferentes entram, se veem, conversam por voz perto, atiram, dirigem e compram um veículo.
4. O `CLAUDE.md` tem uma seção por rodada com os números medidos e os limites conhecidos.
5. `CREDITS.md` lista toda fonte de terceiros com licença.
6. O sub agente de segurança rodou depois da última mudança de rede/banco e as pendências altas foram corrigidas.

> Itens deixados como melhoria futura (não são obrigatórios): canais Realtime privados, queda de dano por distância, recuo fixo de arma, opção de campo de visão nas configurações, modos para daltônicos e escala de texto, opção de resolução, controle (gamepad), compressão Draco/meshopt nos modelos se passar de 15 MB.
