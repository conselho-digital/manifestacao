# Manifestação Online

Jogo de manifestação online multiplayer no navegador (celular e PC). Projeto
**próprio**, inspirado no Paulista Livre (manifestacao.com), **sem** reutilizar
marca, arte ou código do original. Visão completa e plano de fases em
[`CLAUDE.md`](./CLAUDE.md).

## Estrutura (monorepo pnpm)

```
apps/
  client/   Cliente web (Phaser 3 + Vite, TypeScript)
  server/   Servidor de jogo autoritativo (Node) — stub na Fase 0
  api/      API de contas/loja/moderação (Node) — stub na Fase 0
packages/
  shared/   Tipos e constantes compartilhados (protocolo, times, mundo)
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

### Fase 0 (atual)

Fundação do monorepo, tipos compartilhados e um protótipo jogável **local**:
avenida desenhada por código, um personagem controlável por teclado
(WASD/setas) e por joystick de toque no celular, com escolha de time e
apelido. Ainda **sem rede** — a sincronização multiplayer entra na Fase 1.

## Convenções

- TypeScript estrito; tipos de protocolo em `packages/shared`.
- Servidor sempre autoritativo (nunca confiar no cliente).
- Textos de interface em pt-BR; mobile-first.
- Git: sem pull requests; commits direto na `main` (ver `CLAUDE.md §0`).
