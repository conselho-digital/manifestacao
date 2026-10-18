# CLAUDE.md — Jogo de manifestação online multiplayer (navegador)

> Projeto inspirado no **Paulista Livre** (manifestacao.com). Este arquivo descreve o que o produto de referência faz, como reconstruir algo equivalente e em que ordem.
> **Não copie** nome, marca, logotipo, arte, textos ou código do original. Construa identidade própria.

---

## 0. Fluxo de git

- Não abrir pull requests neste repositório.
- Sempre fazer commit e push direto na branch `main`.
- Não criar branches de trabalho.

---

## 1. Visão do produto

Um jogo **multijogador em tempo real, no navegador** (celular e PC), que recria uma avenida famosa como palco de uma **manifestação virtual satírica**. O jogador escolhe um **lado/time**, monta o **visual**, caminha pela avenida com outras pessoas ao vivo, conversa, leva bandeira/cartaz, dirige veículos, picha paredes e compra destaque (telões, superchats).

Princípios:
- **Entrar em 1 clique**: jogar grátis, sem login (o original passou a cobrar R$10 de contas novas — decisão de negócio, ver §8).
- **Mobile-first**: precisa rodar bem em celular médio.
- **Tudo efêmero**: chat, pixações e posições vivem só na memória do servidor.
- **Monetização por itens avulsos** via Pix, sem assinatura.

---

## 2. Inventário de funcionalidades (referência)

### 2.1 Entrada e personagem
- Escolher **lado/time** (o original tem 3: PT, PL e Missão, com placar por partido).
- Escolher **personagem** (básicos grátis; especiais/caricaturas pagos, a partir de ~R$29,90).
- Personalizar **visual**: camisa, aparência.
- **Apelido** público (sugerido pelo login, editável).
- Visual salvo no `localStorage` e na conta.

### 2.2 Mundo e movimento
- Mapa da avenida com prédios, calçadas, **telões** e **palanques**.
- Andar livremente; outros jogadores sincronizados em tempo real.
- **Emotes**: dançar, acenar, comemorar.
- **Placar ao vivo** de presença por time.

### 2.3 Comunicação
- **Chat global** da avenida.
- **Chat de proximidade** (só quem está perto).
- **Palanque com microfone**: equipe libera o jogador; voz **ao vivo**, não gravada.
- **Som ambiente**: caixa/carro de som toca música para quem está perto, mostrando o nome.

### 2.4 Itens e objetos
- **Bandeiras** (catálogo) e **bandeiras personalizadas**.
- **Cartazes personalizados** (imagem/texto do jogador, com aprovação).
- **Spray / pixação**: pintar e apagar paredes; cartuchos de tinta (grátis + comprados); tinta some em algumas horas; **zonas proibidas** para pixar.
- Objetos divertidos: **dinossauro, calango** etc.

### 2.5 Veículos
- Moto, carro comum, **carro de som**, **carreta/caminhão de som**, **dirigível**.
- Subir no carro de som = fazer campanha para o time.

### 2.6 Telões (leilão)
- Telões exibem **vídeo/imagem** enviados por jogadores.
- **Quem paga mais fica com o telão**; lance superado vira **crédito** na conta.
- Anúncio pode ter **link** (abre em nova aba).
- Conteúdo verificado **antes** do pagamento.

### 2.7 Superchat
- Não exige conta: nome + mensagem + valor.
- Aparece em destaque e é **lido em voz alta** (TTS).

### 2.8 Conta
- Login opcional para jogar, obrigatório para comprar.
- Métodos: **e-mail + senha**, **Google OAuth**, **Kick OAuth**.
- Idade mínima 13; menores de 18 com autorização dos responsáveis.
- Conta compartilhada com outro jogo da mesma equipe (Brasil TD) — padrão "um SSO para vários jogos".

### 2.9 Monetização (preços de referência)
| Item | Preço |
|---|---|
| Premium (permanente) | R$10 — personagem fica conectado após sair, moto, carro, caixa de som, spray ilimitado, 5 cartazes |
| Cartaz extra | R$2 (crédito só gasto se aprovado) |
| Passe Personagens | R$350 — todos os personagens atuais e futuros |
| Passe Garagem & Objetos | R$300 — veículos, objetos, cartazes ilimitados |
| Passe Total | R$500 — tudo + bandeiras + recursos novos |
| Itens avulsos | até ~R$200 (carro de som etc.) |
| Telões / superchat / doações | valor livre, à parte |

Pagamento **só Pix** (Woovi/OpenPix), pagamento único, sem guardar CPF/cartão.

### 2.10 Moderação
- Painel da equipe: apelido, lado, chat, denúncias e IP de quem está online (só em memória).
- Ações: **silenciar**, **banir IP temporariamente**, **remover conteúdo**, **recolher a lata de spray**.
- **Denúncias** de pixação guardam trecho, denunciante e autor.
- Verificação automática de imagens/vídeos (Google Cloud Vision + LLM via OpenRouter) **antes** do Pix.
- Rate limit por **hash do IP** (não o IP cru).

### 2.11 "Personagem sempre conectado" (Premium)
- Após o jogador sair, o avatar continua na avenida (NPC parado), inflando presença do time.

---

## 3. Arquitetura sugerida

O back-end do original não é público; a stack abaixo é **inferida** da política de privacidade e escolhida para reproduzir o comportamento.

```
[Cliente Web (PWA)] ──WebSocket──> [Servidor de jogo (estado em memória)]
        │                                   │
        ├──HTTPS──> [API (auth, loja, moderação)] ──> [Postgres]
        │                                   │
        └──WebRTC (voz palanque)            ├──> Woovi/OpenPix (Pix + webhook)
                                            ├──> Google Cloud Vision / LLM (moderação)
[Cloudflare: CDN, WAF, DDoS] na frente      └──> Google TTS (superchat)
```

### Stack recomendada
- **Cliente**: TypeScript + **Phaser 3** ou **PixiJS** (2D top-down/isométrico) — leve no celular. Vite.
- **Servidor de jogo**: Node.js + **Colyseus** (salas, sync de estado, interpolação) ou `uWebSockets.js` puro.
- **API**: Node (Fastify/Hono) ou Supabase (Auth + Postgres + Edge Functions).
- **Banco**: Postgres (contas, compras, inventário, créditos, aprovações).
- **Cache/pub-sub**: Redis (se houver mais de uma instância de sala).
- **Voz**: LiveKit (SFU WebRTC) para o palanque.
- **Mídia**: Cloudflare R2 / Supabase Storage para cartazes e vídeos de telão.
- **Infra**: Cloudflare na frente; servidor de jogo em VPS (Fly.io, Hetzner).

### Modelo de dados (mínimo)
- `users` (id, email, password_hash, google_id, kick_id, nickname, birth_ack, created_at, access_type)
- `sessions` (token_hash, user_id, ip_hash, expires_at)
- `avatars` (user_id, team, character_id, shirt, appearance)
- `catalog_items` (id, kind[flag|vehicle|object|sound|character|pass], price_cents, team_restriction)
- `orders` (id, user_id, item_id, amount_cents, pix_ref, status, created_at)
- `entitlements` (user_id, item_id, source[purchase|grant|pass], granted_by, created_at)
- `custom_signs` (id, user_id, image_url, text, status[pending|approved|rejected], credit_used)
- `billboard_bids` (id, billboard_id, user_id, media_url, link, amount_cents, status)
- `user_credits` (user_id, balance_cents)
- `superchats` (id, name, message, amount_cents, voice, status)
- `spray_cartridges` (user_id, opened_count, remaining_in_current)
- `moderation_log` (actor, target, action, reason, created_at)
- `stage_sessions` (user_id, stage_id, started_at, duration)

**Não persistir**: chat, posições, pixações, IP cru.

### Protocolo em tempo real (mensagens)
- `join {team, avatar}` / `leave`
- `move {x, y, dir}` (cliente envia input; servidor autoritativo; ~10–20 ticks/s)
- `emote {type}`
- `chat {scope: global|near, text}`
- `equip {item}` / `vehicle_enter|exit`
- `spray_paint {cells}` / `spray_erase`
- `music_play {track}`
- `billboard_update` (broadcast quando leilão muda)
- `superchat` (broadcast + URL do áudio TTS)
- `team_score` (broadcast periódico)
- Mod: `mute`, `ban_ip`, `remove`, `confiscate_spray`

### Escala
- **Interest management** por grade/área: só enviar entidades próximas.
- **Sharding** da avenida em salas/instâncias quando lotar (ex.: 200–300 jogadores por sala).
- Delta compression; snapshots binários (MessagePack).

---

## 4. Fluxos críticos

**Compra via Pix**
1. Usuário logado + captcha escolhe item → API cria cobrança Woovi → retorna QR Code/copia-e-cola.
2. Webhook Woovi confirma → `orders.status = paid` → cria `entitlement` → notifica cliente via WS.
3. Idempotência pelo `pix_ref`.

**Cartaz / telão personalizado**
1. Upload → Cloud Vision (SafeSearch) + LLM (texto/contexto) → `pending`.
2. Se aprovado automaticamente ou por humano → libera Pix (ou consome crédito).
3. Rejeitado não gasta crédito.

**Leilão de telão**
- Lance > lance atual → vence; anterior recebe valor como `user_credits`.
- Definir duração mínima de exibição por lance.

**Superchat**
- Moderação de texto → Pix → TTS → broadcast.

---

## 5. Plano por fases

**Fase 0 — Fundação (1 semana)**
- Repo monorepo (cliente, servidor de jogo, API, shared types).
- Mapa simples da avenida, 1 personagem, movimento local.

**Fase 1 — MVP multiplayer (2–3 semanas)**
- Servidor autoritativo, sync de jogadores, apelido, escolha de time.
- Chat global e de proximidade; emotes; placar por time.
- Deploy com Cloudflare. Teste com 100 bots.

**Fase 2 — Conteúdo e identidade (2 semanas)**
- Personagens, camisas, bandeiras do catálogo.
- Veículos (moto, carro, carro de som).
- Som ambiente por proximidade.

**Fase 3 — Contas e pagamentos (2 semanas)**
- Auth e-mail/Google (+ Kick opcional), sessões em cookie.
- Integração Woovi/OpenPix + webhook; inventário; Premium; passes.

**Fase 4 — Conteúdo gerado por usuários (2–3 semanas)**
- Spray com cartuchos, expiração e zonas proibidas.
- Cartazes personalizados com moderação automática.
- Telões com leilão e créditos; superchat com TTS.

**Fase 5 — Moderação e voz (2 semanas)**
- Painel admin (online, chat, denúncias, mute/ban).
- Palanque com LiveKit, liberação por moderador.
- "Personagem sempre conectado" do Premium.

**Fase 6 — Lançamento**
- Páginas Sobre, Termos, Privacidade (LGPD: DPO, direitos art. 18).
- Teste de carga, anti-cheat básico, rate limits.
- PWA, OG image, SEO.

---

## 6. Regras para o Claude neste projeto
- TypeScript estrito em tudo; tipos de mensagem em `shared/`.
- Servidor **sempre autoritativo**: nunca confiar em posição, saldo ou item enviado pelo cliente.
- Nada de chat/posição/pixação em banco.
- Todo conteúdo enviado por usuário passa por moderação **antes** de cobrar e de exibir.
- Pagamentos idempotentes; nunca liberar item sem webhook confirmado.
- Mobile-first: testar em viewport 380px e em CPU limitada.
- Textos de interface em pt-BR.

---

## 7. Riscos e pontos legais
- **Políticos reais como personagens**: risco de direito de imagem e de **legislação eleitoral** (TSE) em período de campanha. Avaliar com advogado; preferir caricaturas fictícias.
- **Marca/arte do original**: não reutilizar.
- **LGPD**: controlador definido, DPO, exclusão de conta, retenção mínima.
- **Menores**: idade mínima e consentimento dos responsáveis para compras.
- **CDC**: direito de arrependimento em compras digitais.
- **Anúncios com link**: risco de golpe — moderar e permitir remoção.

---

## 8. Decisões em aberto
- Gratuito sem login ou acesso pago (o original mudou para R$10 em contas novas)?
- Quais times/lados e se haverá personagens de pessoas reais.
- Avenida/cidade escolhida e estilo visual (pixel art, isométrico, low-poly 2D).
- Phaser vs PixiJS; Colyseus vs servidor próprio.
- Supabase vs API própria.
