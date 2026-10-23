# CLAUDE.md — Manifestação Online (jogo web multiplayer 3D)

> Jogo **próprio**, inspirado no conceito do Paulista Livre (manifestacao.com):
> uma manifestação online e satírica numa avenida, no navegador (celular e PC).
> **Não copiar** nome, marca, logotipo, arte, textos nem código do original —
> identidade e conteúdo são próprios. O site original serve só de referência
> (cópia estática guardada em `reference/`, não reutilizar).

---

## 0. Fluxo de git (regra fixa)

- **Sem pull requests.** Commit e push **direto na `main`**.
- Não criar branches de trabalho.
- Mensagens de commit em pt-BR, curtas e descritivas.

---

## 1. Decisões de arquitetura (fechadas)

| Camada | Escolha | Observações |
|---|---|---|
| **Front-end** | **Vercel** | Vite + React + **React Three Fiber (Three.js)** para a cena 3D. PWA, mobile-first. |
| **Back-end / dados** | **Supabase** | Postgres, Auth, Storage, Realtime e Edge Functions. |
| **Multiplayer em tempo real** | **Supabase Realtime** (presence + broadcast) no MVP | Ver §4 — a Vercel não hospeda WebSocket persistente; servidor autoritativo dedicado é o caminho de escala. |
| **Pagamentos** | **Mercado Pago (Pix)** | Cobrança + webhook em Edge Function. Idempotente. Sem guardar CPF/cartão. |
| **Contas / login** | **Google OAuth apenas**, via Supabase Auth | Sem e-mail+senha → sem confirmação/recuperação de e-mail. |
| **E-mail transacional** | **Resend** | Recibos e avisos (via Edge Function). Não é usado para login. |
| **Personagens / 3D** | Modelos **glTF/GLB gratuitos** (CC0 de preferência) | Ver §6 e o relatório do agente de pesquisa. |

### Stack concreta
- **Cliente**: `apps/client` — Vite + React + TypeScript + `@react-three/fiber` + `@react-three/drei`. Deploy na Vercel (`vercel.json` já builda só o cliente).
- **Supabase**: `supabase/` — migrations SQL, Edge Functions (`functions/`), políticas RLS.
- **Compartilhado**: `packages/shared` — tipos de protocolo, times, constantes do mundo.
- **Servidor de jogo** (`apps/server`): opcional/escala — servidor autoritativo Node quando Supabase Realtime não bastar (ver §4).

> Nota de migração: a Fase 0 foi prototipada em Phaser (2D). Como os personagens
> agora são **modelos 3D**, o cliente migra para React Three Fiber. O protótipo
> Phaser serve de referência de movimento e pode ser removido quando o cliente 3D
> cobrir a mesma função.

---

## 2. Princípios

- **Conta obrigatória para jogar** (decisão de produto — revisado): entrar no mapa exige login Google quando o modo online está disponível. Em modo offline (sem Supabase configurado) o acesso segue liberado, já que não há como autenticar.
- **Mobile-first**: rodar bem em celular médio (viewport 380px, GPU/CPU modestas).
- **Efêmero**: chat, posições e pixações vivem só em memória/Realtime; nunca em banco.
- **Servidor autoritativo**: nunca confiar em posição, saldo ou item vindos do cliente.
- **Monetização por itens avulsos** via Pix, pagamento único, sem assinatura.
- **Textos de interface em pt-BR.**

---

## 3. Funcionalidades (escopo-alvo)

- **Entrada/personagem**: escolher lado/time, apelido público, visual do avatar 3D.
- **Mundo/movimento**: avenida 3D com prédios e calçadas; andar livre; outros jogadores sincronizados; placar de presença por time; emotes (dançar, acenar, comemorar).
- **Comunicação**: chat global e de proximidade; (fases avançadas) palanque com voz ao vivo; som ambiente por proximidade.
- **Itens**: bandeiras, cartazes personalizados (com moderação), spray/pixação efêmera.
- **Veículos**: moto, carro, carro de som.
- **Telões**: leilão — quem paga mais exibe; lance superado vira crédito.
- **Superchat**: nome + mensagem + valor, exibido em destaque.
- **Moderação**: painel de equipe; silenciar, remover, banir por hash de IP; verificação de conteúdo antes de cobrar/exibir.

---

## 4. Multiplayer: Supabase Realtime vs. servidor dedicado

- **MVP (Supabase Realtime)**: usar *Presence* (quem está online, por time) e *Broadcast* (posição/emote/chat). Simples, sem servidor próprio, cabe na Vercel + Supabase. Limitação: não é autoritativo — validar o que der no cliente e no banco (RLS), e aceitar que posição é "best effort".
- **Escala (servidor autoritativo)**: quando precisar de anti-cheat, interest management e salas (200–300 jogadores), subir um servidor Node (ex.: Fly.io) com WebSocket, mantendo o Supabase para dados/auth/pagamentos. **A Vercel não serve WebSocket persistente** — por isso o servidor de jogo fica fora dela.

---

## 5. Contas, pagamentos e e-mail

### Login (Google apenas, Supabase Auth)
- Provider Google habilitado no Supabase; redirect para a Vercel.
- Guardar só `sub` (id Google) + e-mail verificado; nome vira sugestão de apelido editável.
- Sem e-mail/senha → nada de "confirmar e-mail" nem "recuperar conta".

### Pagamentos (Mercado Pago, Pix)
1. Cliente autenticado + captcha escolhe item → Edge Function cria pagamento Pix no Mercado Pago → retorna QR Code / copia-e-cola.
2. **Webhook** do Mercado Pago (Edge Function) confirma → marca `orders.status = paid` → cria `entitlement` → notifica cliente via Realtime.
3. **Idempotência** pela referência do pagamento (`external_reference` / id MP). Nunca liberar item sem webhook confirmado.
4. Guardar segredos (`MP_ACCESS_TOKEN`, webhook secret) só no Supabase/Vercel (env), nunca no cliente nem no repo.

### E-mail (Resend)
- Recibos de compra e avisos via Edge Function chamando a API da Resend.
- Chave `RESEND_API_KEY` só no servidor.

### Modelo de dados (mínimo, Postgres/Supabase)
- `profiles` (id = auth.uid, google_sub, nickname, team, created_at)
- `avatars` (user_id, model_id, team, shirt, appearance)
- `catalog_items` (id, kind, price_cents, team_restriction)
- `orders` (id, user_id, item_id, amount_cents, mp_payment_id, external_reference, status, created_at)
- `entitlements` (user_id, item_id, source, granted_by, created_at)
- `user_credits` (user_id, balance_cents)
- `custom_signs` (id, user_id, image_url, text, status, credit_used)
- `billboard_bids` (id, billboard_id, user_id, media_url, link, amount_cents, status)
- `superchats` (id, name, message, amount_cents, status)
- `moderation_log` (actor, target, action, reason, created_at)

**Não persistir**: chat, posições, pixações, IP cru. **RLS ligada** em todas as tabelas; nunca expor `service_role` ao cliente.

---

## 6. Personagens e assets 3D

- Formato **glTF/GLB**, low-poly estilizado, otimizado para web/mobile.
- Preferir **CC0 / domínio público**; se CC-BY, registrar a atribuição em `CREDITS.md` e numa tela de créditos no jogo.
- Fontes confirmadas (licenças verificadas — ver `CREDITS.md`):
  - **Personagem que anda (melhor opção)**: **KayKit** (CC0, GLTF nativo, rig humanoide + 133 animações incluindo caminhada) ou **Quaternius** (CC0, base + animation library). Tudo do mesmo autor evita retarget entre fornecedores.
  - **Veículos / cenário urbano**: **Kenney.nl** (CC0, City Kit/Car Kit), **Quaternius** (Cars/Public Transport).
  - **Iluminação / texturas**: **Poly Haven** (CC0, HDRIs e PBR).
  - **Agregador**: **Poly Pizza** (GLB; CC0 e CC-BY — checar por modelo). **Sketchfab** (filtrar CC0/CC-BY, **excluir NC/ND**).
  - **Mixamo** (Adobe): ok para rig/animação, mas **não redistribuir** arquivos crus (só embutidos, convertidos para GLB) e exporta só FBX/DAE.
  - **Não usar**: Ready Player Me (serviço público encerrado em jan/2026); CC-BY-NC e CC-BY-ND num jogo pago.
- **Otimização**: Draco/meshopt na geometria, KTX2/Basis nas texturas, compartilhar um esqueleto entre avatares, `InstancedMesh` para prédios/postes, LOD e lazy-load por área.
- **Regra**: nenhum asset entra sem licença compatível com **uso comercial** (o jogo cobra via Pix). Avatares não representam **pessoas reais** (ver §9).

> Estado atual: os avatares da Fase 1 são **geométricos (gerados por código)**,
> placeholder até entrarem os modelos glTF CC0 na Fase 2.

---

## 7. Processo por etapa (agentes obrigatórios)

A cada etapa de desenvolvimento (cada fase/feature entregue), rodar **três** revisões por subagente antes de considerar a etapa concluída:

1. **Agente de bugs** — lê o código novo/alterado e procura defeitos nas funções (regressões, casos de borda, erros de estado, tipos). Pode usar `/code-review`. Entrega lista de achados priorizada.
2. **Agente de segurança (strix)** — usa a skill `strix-pentest` **somente contra o nosso próprio app** (local ou nosso deploy na Vercel/Supabase) e/ou revisão do nosso código. **NUNCA** mirar `manifestacao.com` nem qualquer alvo de terceiros — isso seria ataque não autorizado. Requer Docker/alvo próprio no ar; enquanto não houver, usar `/security-review` sobre o nosso código. Foco: RLS, webhooks de pagamento, segredos, injeção, autorização.
3. **Agente de visual (taste)** — usa a skill `taste-skill` (e `impeccable`/`web-design-guidelines` quando couber) para manter a página com bom acabamento: hierarquia, tipografia, espaçamento, consistência, responsivo.

Regras dos agentes:
- Rodar em paralelo quando não houver dependência entre eles.
- Achados viram tarefas; corrigir e revalidar antes de seguir.
- Segredos e chaves nunca aparecem em logs, prompts ou commits.

---

## 8. Plano por fases

- **Fase 0 — Fundação** ✅ monorepo, tipos compartilhados, protótipo de movimento, deploy base na Vercel.
- **Fase 1 — Cliente 3D + multiplayer MVP**: cena 3D (avenida + avatar glTF), controle mobile/teclado, Supabase Realtime (presence/broadcast), apelido, time, placar, chat. Rodar os 3 agentes (§7).
- **Fase 2 — Conteúdo e identidade**: catálogo de personagens/camisas/bandeiras, veículos (moto, carro, carro de som), som por proximidade.
- **Fase 3 — Contas e pagamentos**: Google OAuth (Supabase), Mercado Pago Pix + webhook, inventário/entitlements, Premium, recibos via Resend.
- **Fase 4 — Conteúdo do usuário**: spray efêmero, cartazes com moderação, telões com leilão/créditos, superchat.
- **Fase 5 — Moderação e voz** ✅: painel admin (silenciar/banir por conta), palanque com voz (WebRTC). "Personagem sempre conectado" foi **removido do escopo**.
- **Mapas**: `MapId` em `packages/shared/src/maps.ts` (avenida original e `paulista`, trecho real do OpenStreetMap em `apps/client/src/game/paulista`). Cada mapa tem o seu canal Realtime (`avenue` e `avenue:paulista`, com policies em `realtime.messages`); escolha na entrada e em Opções.
- **Fase 6 — Lançamento**: Sobre/Termos/Privacidade (LGPD), teste de carga, anti-cheat básico, rate limits, PWA/SEO.

Em cada fase: entregar → rodar agentes de bugs/segurança/visual (§7) → corrigir → commit/push na `main`.

---

## 9. Riscos e pontos legais

- **Conteúdo é do operador**: nomes de equipes, bandeiras (cor e imagem), produtos e textos são definidos pelo dono do jogo no painel de admin; a plataforma não impõe nomes nem temas. A responsabilidade legal sobre esse conteúdo (direito de imagem, legislação eleitoral/TSE, marcas) é do operador. O código não deve trazer nomes/bandeiras de partidos ou pessoas reais como padrão — o padrão é neutro e o admin sobrescreve.
- **Marca/arte/código do original**: não reutilizar.
- **Licença de assets 3D**: só compatível com uso comercial; atribuição em `CREDITS.md`.
- **LGPD**: controlador/DPO definidos, exclusão de conta, retenção mínima, só dados necessários do Google.
- **CDC**: direito de arrependimento em compras digitais.
- **Pagamentos**: idempotência, webhook confirmado, segredos fora do cliente.
- **Conteúdo do usuário**: moderar antes de cobrar e de exibir; permitir remoção e denúncia.

---

## 10. Regras para o Claude neste projeto

- **A plataforma é nossa, o conteúdo é do operador**: construir ferramentas (admin, upload, moderação) sem decidir nomes de equipe, bandeiras ou temas; não alterar conteúdo já configurado no banco sem pedido.

- TypeScript estrito em tudo; tipos de protocolo em `packages/shared`.
- Servidor/RLS sempre autoritativos; nunca confiar no cliente.
- Nada de chat/posição/pixação em banco.
- Pagamentos idempotentes; item só após webhook confirmado.
- Segredos só em env do Supabase/Vercel; nunca no repo.
- Mobile-first; pt-BR na interface.
- Seguir o §0 (git) e o §7 (agentes por etapa) sempre.
