# Manifestação Online

Jogo de manifestação online multiplayer no navegador (celular e PC). Projeto
**próprio**, inspirado no Paulista Livre (manifestacao.com), **sem** reutilizar
marca, arte ou código do original. Visão completa e plano de fases em
[`CLAUDE.md`](./CLAUDE.md).

## Estrutura (monorepo pnpm)

```
apps/
  client/   Cliente web 3D (Vite + React + React Three Fiber, TypeScript)
  server/   Servidor de jogo autoritativo (Node) — reservado p/ escala (§4 do CLAUDE)
  api/      Stub HTTP (a lógica de contas/loja vai p/ Supabase Edge Functions)
packages/
  shared/   Tipos e constantes compartilhados (protocolo, times, mundo, realtime)
supabase/
  migrations/   Schema + RLS (Postgres)
  functions/    Edge Functions (Mercado Pago Pix, webhook, Resend)
reference/  Cópia estática do site original, só como referência (não reutilizar)
```

## Requisitos

- Node >= 20 (testado com 22)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)

## Como rodar

```bash
pnpm install
pnpm dev          # cliente em http://localhost:5173
pnpm dev:server   # servidor de jogo (stub) em :2567
pnpm dev:api      # api (stub) em :3000
```

Para multiplayer, copie `apps/client/.env.example` para `apps/client/.env.local`
e preencha `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Sem isso, o cliente
roda em modo offline (só o jogador local).

### Fase 1 (atual)

Cliente **3D** (React Three Fiber): avenida, avatar controlável por teclado
(WASD/setas) e joystick de toque, câmera que segue, escolha de time/apelido.
Multiplayer MVP via **Supabase Realtime** (presence + broadcast de posição e
chat) — ativa quando as credenciais do Supabase estão configuradas. Schema,
RLS e Edge Functions de pagamento/e-mail já versionados em `supabase/`
(dependem das suas chaves para funcionar).

## Convenções

- TypeScript estrito; tipos de protocolo em `packages/shared`.
- Servidor sempre autoritativo (nunca confiar no cliente).
- Textos de interface em pt-BR; mobile-first.
- Git: sem pull requests; commits direto na `main` (ver `CLAUDE.md §0`).
