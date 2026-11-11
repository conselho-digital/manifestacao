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
- `src/ui/` — menu inicial (`lobby.ts`), HUD
- `src/net/auth.ts` (login Google), `src/net/voice.ts` (voz por proximidade)

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
3. ✅ Tela de entrada: nome + login Google; personagem escolhido numa tela de carrosséis por categoria (foto do rosto)
4. ✅ Multiplayer Supabase: presence + broadcast + interpolação
5. ✅ Animação (ped.ifp: parado, andar, correr; Shift anda). Carlos e Law1-9 animados. Falta: modelos sem esqueleto (Helena, Stewart, Bennyse, Amanda, Garota1, Gordao, Cesar, Akiyama)
6. ✅ Motos: Harley, Triumph, BMW S1000 e Suzuki GSX-R600 (piloto sentado: clipe bike_ride do bikes.ifp + mãos no guidão por IK) em public/models/bikes (nós body, wheel_F, wheel_R); V ou botão ↑ empina. Carros: Blista, Buffalo, Clover e Chevrolet Spin PMESP (viatura) (GLB convertidos de DFF GTA SA em `public/models/vehicles/`; nós `body` + `wheel_FL/FR/BL/BR`, material `paint` recebe a cor do carro). Conversor: `exp3.js`/`build3.py` (ver CREDITS)
7. Deploy Vercel
8. Chat, ranking, roupas

## Regras para o Claude
- Uma etapa por vez, testar no navegador.
- Perguntar antes de serviço pago ou dependência pesada.
- Explicar alterações em frases curtas.

## Menu, login e voz
- Menu (`src/ui/lobby.ts`): ao fundo a cidade inteira vista de cima girando devagar (o `main.ts` desenha com `menuCamera`; sem neblina). Cartão com a foto do rosto do personagem, nome e **login obrigatório com Google** (botão "Continuar com o Google"; depois "Entrar no jogo"). Tocar na foto abre a seleção: carrosséis por categoria (`CATEGORIES` em `characters.ts`: Rua, Civis, Polícia, Forças especiais; todo personagem em exatamente uma). Fotos em `public/faces/*.webp`, geradas dos modelos por `dev/face-shots.html` (+ script que lê `window.FACES`); refazer se mudar um modelo.
- Login: botão oficial do Google (Google Identity Services, `renderGoogleButton` em `auth.ts`) + `supabase.auth.signInWithIdToken` — o popup mostra o endereço do SITE, não o do Supabase. Exige `https://gameprotesto.com.br` (sem www) em "Origens JavaScript autorizadas" do cliente OAuth no Google Cloud (Client ID `992845805301-…`, público; o Supabase já usa o mesmo). Não há método alternativo de login (o redirecionamento do Supabase mostraria `jifhdgmgcfzkpnlpuuzm.supabase.co`). O endereço oficial é **https://gameprotesto.com.br** (sem www): `www.` e `manifestacao-ten.vercel.app` redirecionam para ele (permanente, no servidor: `vercel.json`; `main.ts` repete no navegador por garantia; `index.html` tem o canonical). Provedor Google já ligado no projeto; as 5 contas existentes são Google — não apagar. O site publicado exige login; no `npm run dev`, `?dev=1` pula (nunca no build). O gate é só do cliente: o canal Realtime continua público (para exigir login no servidor, usar canais privados + RLS em `realtime.messages`).
- Voz por proximidade (`voice.ts`): o botão do microfone (ou T) liga a voz no 1º toque (pede o microfone) e depois alterna falar/mudo. WebRTC direto entre navegadores só com quem está a menos de 45 m (desliga a 60 m, máx. 8); sinalização (`rtc`: offer/answer/ice) pelo canal do Supabase; volume e lado pela distância (40 m). STUN público do Google, sem TURN (algumas redes não conectam). Quem não ligou a voz não abre conexão. Chat de texto removido; mensagens do sistema continuam. Sala de teste: `?room=nome`.
- Áudio (`audio.ts`): tudo por proximidade (`setListener` no main, `proximity()`): motor por modelo (`PROFILES`: Blista, Buffalo, Clover, Spin, Harley, Triumph, BMW, Suzuki), chiado de pneu ao derrapar (ângulo entre a trajetória e a direção, vale para outros jogadores), tiros (`playShotAt`: fuzil grave/longo, pistola seca; longe perde agudos).

## Equipes, pausa, loja e admin
- Equipes (`src/game/teams.ts`): tabela `public.teams` (id, name, color1, color2, sort) no Supabase; leitura pública, escrita só do admin (RLS + `is_admin()`, que compara o e-mail verificado do login Google com a tabela `admins`, que o navegador não lê). Iniciais: Verde e Amarela, Vermelha e Branca, Amarela e Preta, Branca (branca e branca). Sem Supabase valem as `DEFAULT_TEAMS`. Admin atual: `felipepmoraes1a@gmail.com` (para trocar/adicionar: `insert into public.admins(email) values ('...')`, em minúsculas). Migrações: `teams_and_admins` e `teams_grants`.
- A equipe aparece como anel de duas cores sob os pés (`makeTeamRing`) e faixa de duas cores no nome (remotos). Vai pela presence (`team: {name,c1,c2}`, validado por `cleanLook`); trocar de equipe ou personagem usa `net.updateMe` e os outros atualizam ao vivo (`onUpdate` em main.ts).
- Menu inicial: sem créditos no rodapé; escolhe a equipe (não existe "sem equipe": sempre há uma marcada, a primeira por padrão; `validTeamId`). Os créditos CC-BY ficam no rodapé do menu de pausa.
- Engrenagem (HUD, topo ao centro) ou tecla P: menu de pausa (`src/ui/pause.ts`) com abas Equipe, Personagem, Armas (só as que o jogador tem), Loja e, só para o admin, Gerenciar equipes (nome, dois `<input type=color>`, Salvar/Criar/Apagar). A Loja é uma aba do menu de pausa (sem botão próprio no HUD). Pausar congela só o jogo local (jogador, trânsito, motores) e dá imunidade; os outros continuam jogando.
- Inventário (`src/game/inventory.ts`): começa com punho e $1000; compra de pistola $300, AK-47 $800, bandeira $150, placa $100, taco de críquete $250, taco de beisebol $200, munição, kit médico $100, colete $200 (`SHOP`); cada abate rende $100. Salvo no navegador por conta (`arena-inv:<id>`), não no servidor. O botão Arma cicla só entre as armas que o jogador tem. Trocar de personagem: `makePlayer`/`setMyCharacter` em main.ts (não vale dirigindo).

## Controles
- PC: WASD move · Shift anda · Q sprint · Espaço pula · E (ou C) escala · arrastar o mouse gira a câmera · G abre o menu de animações.
- Trânsito da avenida (TRAFFIC em vehicle.ts, pistas z = ±4): para diante de jogador, veículo em uso ou outro carro do trânsito (fila, nunca passa por dentro), contorna pelo lado do centro os veículos parados na pista (`parked`, desvio `off`), bate e atropela. Veículo parado só é empurrado se o lugar novo estiver livre (`Car.fits`); vaga de veículo pessoal exige 5,4 m de outros carros. Tiros e golpes (soco, taco, bandeira, placa) acertam carros, motos e trânsito: a bala para neles e eles balançam (parados deslizam).
- Atropelado por veículo a mais de 16 km/h: tombo (clipes ko e getup) e levanta. Veículos e personagens a pé colidem entre si (círculos). Carros e motos: o personagem caminha até a porta do motorista (ou o lado esquerdo da moto), abre e senta em 1,5 s (car_getin_l esticado, `SEQ_DUR`/`seatBlend` em player.ts; o remoto repete a mesma sequência pelo progresso do clipe), sai pelo mesmo lado. Só a porta do motorista (`door_L`) abre ao entrar e sair, girando na dobradiça da ponta da frente da porta (`buildCarVisual` calcula pelo Box3 da porta); a da direita fica fechada. Ele aparece sentado (clipe car_sit, mãos no volante por IK). F entra/sai (botão da porta no celular). PC: W acelera, S freia/dá ré, Espaço = freio de mão (em velocidade trava as rodas traseiras e a traseira derrapa: `slip` em vehicle.ts), A/D esterça. Aceleração baixa (carro 9 m/s², moto 8); empinar: segurar ↑/V acima de 3 m/s, sem precisar acelerar. Moto: batida acima de 11 m/s (~40 km/h, `CRASH_SPEED`) joga o piloto para a frente (clipe dive + ragdoll falso `setFlail`, depois getup_front) e a moto fica caída (`fallen`) até alguém subir. Dirigindo, o botão de sair fica acima do acelerar, um pouco afastado; a pé, o de entrar (só perto de um carro) fica à esquerda do Sprint, sem substituí-lo. Celular: joystick só esterça; pedais Acelerar, Freio e Freio de mão na direita.
- Fuzis (`src/game/rifles.ts`): AK-47 (id 0), M4A1 (12), M16 (13) e Honey Badger (14, silenciada, tiro baixo). Todos seguram igual: o modelo é medido (ponta do cano, empunhadura, guarda-mão; `dev/gun-grid.html` ajuda) e as mãos por IK vão nesses pontos; `Player.setRifleKind`. Rede: códigos de arma 14–19. Dano: AK 20, M4A1 18, M16 22, HB 16 (cabeça ×2).
- Armas (botão Arma alterna): fuzil, pistola, placa de trânsito (traffic-sign.glb, usa as animações do taco), armas brancas de duas mãos (bandeira flag-turkey.glb, placa, taco de críquete cricket-bat.glb do Bully taco de beisebol baseball-bat.glb e, do pacote de armas, garrafa quebrada, cano, cutelo, foice e machado (`EXTRA_MELEE` em weapons.ts, ponto do cabo por arma; ids 7–11); todos usam os clipes do `baseball.ifp` do usuário: Bat_1 → Bat_2 → Bat_3 em sequência, volta ao 1 depois de 2,5 s; quem apanha de arma branca reage com Bat_Hit_1-3; a arma fica presa à mão direita, orientação calibrada no bat_idle — `batLocal` em anim.ts; `isBatLike`), punho (combo: 3 socos FightA_1/2/3 do ped.ifp — jab, direto e gancho, acelerados 2x — e um chute FightKick/_B do fight_e.ifp do usuário; reações knife_hit_1-3 e Hit_fightkick). Pistola 12/60 (15 de dano), taco 30. Joystick e WASD sempre andam devagar; Sprint (ou Shift/Q) corre. Depois de atirar a mira fica levantada por 3 s. A mira do HUD fica no centro da tela (o tiro sai por ela).
- Armas brancas andando/correndo (`carryBat` em anim.ts): braços por IK (mão direita na frente do peito, esquerda acima no cabo) e a arma inclinada para cima/frente, nunca para o chão; nos clipes `bat_*` (parado e golpes) valem os clipes do baseball.ifp. Garrafa, cano e machado vêm sem textura: `tintExtra` (weapons.ts) pinta vidro verde, aço e cabo de madeira.
- Ícones das armas (`public/hud/w-*.png`, 512x256 recortados no objeto): `dev/weapon-icons.html` (a pistola do ícone é um perfil extrudado, não o modelo da mão) + scratchpad icons.js. M16: modelo próprio gerado por `dev/m16-build.html` (peças com materiais, exporta GLB para `public/models/weapons/m16-new.glb`; mesmos limites do modelo antigo `m16.glb`, que não é mais usado).
- Combate (PC): clique no jogo trava o mouse (gira a câmera); botão esquerdo atira, direito mira, R recarrega, 1/2/X troca arma, T/Enter abre o chat, M abre o mapa grande. Celular: botões de tiro, mira, recarga e arma; o Pular é o botão grande e escala sozinho perto de obstáculos altos (a tecla E também escala); o botão da porta só aparece perto de um carro (à esquerda do Sprint); toque no minimapa abre o mapa; botão Chat.
- Câmera orbital: arrastar (dedo ou mouse) gira para os lados e inclina (dedo para cima = olhar para cima). Pitch de -34° a +69°. A pé a câmera fica atrás e à direita do personagem (2,7 m atrás, 0,7 m à direita, olhando na altura da cabeça, pitch inicial 0,28 rad) para a mira do centro não cair sobre ele. Mirando (`aimK`) ela cola no ombro direito (1,35 m atrás, 0,55 m à direita); a coronha do fuzil fica no ombro. Ao entrar no jogo o deslocamento da câmera do menu é desligado (`inMenu`). Não atravessa prédios. O tiro vai para onde a câmera olha (cima/baixo incluído), saindo do cano. O atirador calcula o acerto, quem leva o tiro aplica o dano em si (casual, sem servidor). AK-47: 20 de dano, 40 na cabeça; colete absorve 60%. Morreu: renasce em 3,5 s.
- Celular: ao entrar o jogo vai para tela cheia e paisagem (onde o navegador não trava, aparece "Gire o celular"). HUD estilo GTA: minimapa, vida/colete, arma (imagens em public/hud/w-*.png renderizadas dos modelos por dev/weapon-icons.html + scratchpad icons.js) e munição, joystick, Sprint, tiro, mira, pular, porta (carro), escalar, chat e placar. Combate (dano, vida, kills) ainda não existe: munição e contadores são locais.
- Agachar: Z ou Ctrl (botão Agachar no celular). Com a arma baixa (fuzil/pistola na mão) a câmera olha livremente e o corpo segue o movimento; só ao mirar ou atirar (`facesAim`: aim/pistol_aim, mira fica levantada 3 s depois do tiro) o corpo gira para onde a câmera aponta; anda de frente, de costas e de lado com clipes próprios (gun_*), corre com run_armed.
- Animação (refeita): o IFP é usado SEM inverter os quaternions (só a pélvis tira a rotação do osso Root). Carlos é recalculado a partir do Law (pernas/tronco por rotação de mundo, braços por direção). Com o fuzil, braços por IK nas empunhaduras, fuzil preso ao peito, tronco/cabeça acompanham a mira. Agachado (`crouchW`) ou mirando, a arma segue só o giro do peito (não a curvatura do tronco) mais `crouchLow`/`crouchAim` do CFG, senão ia parar entre os joelhos. Revisão por quadros: `npm run dev` e abrir `/dev/anim-viewer.html?char=Carlos`, depois `V.sheet('walk', 8)` no console.
- Dados de animação: `public/anims/ped*.json` (esqueleto GTA SA, Law1-9) e `carlos*.json` (baked). Os `-extra` carregam em segundo plano.

## Mapa (cidade)
- Gerado por código em `src/game/city.ts` (prédios com janelas em geometria fundida, árvores instanciadas). MASP é o modelo `public/models/map/masp.glb` (CC-BY, ver CREDITS.md).
- Colisão (`COLLIDERS`, vale para jogador, veículos e balas): prédios, torre, MASP, jardineiras, bancos, troncos de árvore (arbustos NÃO colidem), postes de luz (z = ±13,4, deslocados para fora das ruas laterais por `poleX`), abrigos de ônibus, carros parados nas ruas e no estacionamento; carros do trânsito e dirigíveis são círculos (`hittables`). Em desenvolvimento `validate()` avisa se poste/abrigo cair em avenida ou rua lateral. Boca da arma: AK (-0,017; 0,019; 0,75) e pistola (0; 0; 0,185) no espaço da arma (medida nos modelos; `dev/anim-viewer.ts` `V.muzzle` mostra).
- Limites em `MAP` (`src/game/map.ts`): 220 x 168 m. Avenida no eixo X (z de -12 a 12), 3 ruas transversais ao norte e 2 ao sul, Parque Trianon e estacionamento ao sul, MASP na calçada norte, 38 prédios (cremes, brancos, ocre, vidro, torre escura, casas de telhado vermelho/cinza).
- O layout é escrito no espaço da foto (`R()` em `city.ts`, X espelhado). Em desenvolvimento, `validate()` avisa no console se algum prédio cair em rua, avenida, calçada, estacionamento ou sobre outro prédio. Carros e ônibus do fundo (`updateCity`) são só decoração, sem colisão. Telhados sem casa de máquinas/caixa d'água/ventiladores/chaminé/heliponto (`ROOF_DETAILS = false` em city.ts; antenas ficam; o gerador aleatório continua consumindo os mesmos números). No menu a cidade é desenhada sem recalcular sombras e com pixel ratio 1 (volta ao normal ao entrar). Árvores têm tronco sólido e a câmera não entra nas copas.
- `src/game/tower.ts`: torre de concreto cinza modelada peça por peça a partir da foto de referência (pilares, vãos de janelas, cornija, parapeito, hall com marquise, casa de máquinas, venezianas, ventiladores, ar-condicionado e antenas treliçadas). Fica no lugar da antiga torre escura (centro -44, -33).
- Árvores: `src/game/trees.ts`. 4 espécies + arbusto, com altura real (carvalho 5,5–8 m, pinheiro 7–10 m, bordo 4–6 m, bétula 3,5–5 m, arbusto 1–2 m). Tronco afunilado com raízes e galhos curvos, copa de tufos com folhas recortadas (textura com transparência), cascas diferentes. Instanciadas por espécie; tronco sólido; a câmera não entra nas copas. No parque há distância mínima entre árvores grandes.
- Ao entrar no mapa o jogador nasce num ponto aleatório na frente do MASP (`museumSpawn` em `map.ts`: x 0–46, z 16,5–23, longe de obstáculos), olhando para o museu. `?pos=x,z` força o ponto.
- Inspeção: `?cam=x,y,z,alvoX,alvoY,alvoZ` (câmera fixa), `?vista=aerea` (câmera de cima, como a foto da maquete) e `?pos=x,z` (ponto de partida).

## Veículos pessoais, garagem e loja em reais
- Veículos do mundo (`createCars`): só 8 viaturas PMESP (Spin), sem equipe, paradas e abertas a todos: 4 nas pistas da avenida e 4 nas calçadas das saídas (x = ±98, z = ±16). Mantêm a pintura original. Spin não entra na garagem nem na loja.
- Veículos pessoais (`spawnPersonal` em vehicle.ts, `PERSONAL` por id do dono, ids ≥ 100): cada jogador tem um, chamado pela aba **Garagem** do menu de pausa (`callVehicle`/`parkVehicle` em main.ts, aparece à frente do jogador em `findVehicleSpot`). Pintura da equipe (`applyTeamPaint`): pintura = cor 1; carros levam a cor 2 na faixa de baixo e no teto (shader por altura); pneus pretos com aro cinza; o resto em preto/cinza/branco sem textura; vidros e faróis intactos. Sem equipe: prata e preto. Trocar de equipe recolore o veículo.
- Quem entra: só o dono e membros da equipe do dono (`Player.enterRule`; `Car.ownerId`/`teamId`). O veículo vai pela presence (`veh: {m,c1,c2,t,x,z,h}`, validado por `cleanVeh`) e quem dirige manda `v = 8` + `vo` (dono) no `move`.
- Loja em reais (`src/game/shop.ts`): armas brancas R$ 5, armas de fogo R$ 15, veículos R$ 30 (padrões em `SHOP`, `inventory.ts`). Preço e link de pagamento ficam na tabela `shop_prices` (leitura pública, escrita só do admin); compras da conta em `purchases` (cada um lê só as suas; o navegador não grava). `Inventory.has` = comprado ou admin; o admin tem todas as armas e veículos. Munição, vida e colete continuam em dinheiro do jogo ($).
- Admin: aba **Preços** edita preço (R$) e link https de cada item. "Comprar" abre o link; a liberação é por registro em `purchases` (admin pelo SQL, ou no futuro um webhook do Mercado Pago). Chaves do Mercado Pago nunca no código nem no chat: só como segredo no servidor (função de borda/Vercel). Migração: `shop_prices_and_purchases`.
- Dev: `?admin=1` (só no `npm run dev`) liga o modo admin local. Ícones dos veículos: `dev/vehicle-icons.html` (script lê `window.ICONS` e salva `public/hud/v-<modelo>.png`).
