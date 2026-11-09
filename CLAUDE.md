# Arena Online 3D

Arena multiplayer no navegador. Mapa pequeno, personagens low-poly. Plano **grátis** (Vercel + Supabase).

## Stack
- Vite + TypeScript + Three.js (front-end)
- Vercel (site estático, sem backend próprio; sem WebSocket server)
- Supabase Realtime (Broadcast + Presence)
- Modelos GLB em `public/models/`

## Estrutura
- `public/models/characters/` — Helena, Stewart, Bennyse, Amanda, Garota1, Carlos, Gordao, Cesar (.glb)
- `public/models/vehicles/` — carros e motos (a criar)
- `src/main.ts` — entrada, loop
- `src/game/` — cena, mapa, câmera, input, física simples
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
2. Personagem com WASD, câmera 3ª pessoa
3. Tela de entrada: nome + 8 personagens
4. Multiplayer Supabase: presence + broadcast + interpolação
5. Animação simples (balanço)
6. Veículos
7. Deploy Vercel
8. Chat, ranking, roupas

## Regras para o Claude
- Uma etapa por vez, testar no navegador.
- Perguntar antes de serviço pago ou dependência pesada.
- Explicar alterações em frases curtas.
