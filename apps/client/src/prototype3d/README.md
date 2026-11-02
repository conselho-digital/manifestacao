# prototype3d — cenário urbano + personagem em 3ª pessoa (React Three Fiber + Rapier)

Base técnica isolada: **não é importada pelo jogo atual** (nada muda em produção). Usa `@react-three/rapier` ^1.5 (compatível com R3F 8).

## Como usar
```tsx
import { Prototype3D } from "./prototype3d/index.js";
<div style={{ width: "100vw", height: "100vh" }}><Prototype3D onAttack={() => {}} /></div>
```

## Arquivos 3D
Coloque em `public/models/` (veja `ASSET_BASE` em `config.ts`; em um projeto Next.js use `public/assets` e `ASSET_BASE = "/assets"`):

| Arquivo | Uso |
|---|---|
| `mapa.glb` | cenário (visual e, por padrão, colisão `trimesh`) |
| `mapa_colisao.glb` (opcional) | malha simplificada só para colisão — defina em `FILES.cityCollision` |
| `player.glb` | personagem com esqueleto e animações |

`.fbx` também carrega (pela extensão). FBX costuma vir em centímetros: ajuste a `scale` do `AssetModel`.
Nomes dos clipes de animação: `CLIPS` em `config.ts` (idle, walk, run, aim, attack). Clipe ausente cai em `idle` e avisa no console.

## Controles
WASD/setas · Shift corre · Espaço pula · mouse olha (clique para travar o ponteiro, Esc solta) · botão direito mira · clique esquerdo ataca.

## O que tem
- `AssetModel`: carga dinâmica com Suspense, clone por instância e tratamento de erro (arquivo ausente não derruba a cena).
- `UrbanScene`: colisão estática + chão de segurança + grade de referência (`showGrid`).
- `ThirdPersonController`: cápsula de física movida por velocidade, câmera sobre o ombro com "braço de mola" (não atravessa parede), estados de animação.

## Cuidados
- `trimesh` do cenário inteiro pesa em celular: prefira `cityCollision` simplificado.
- `onAttack` só avisa que o golpe começou. Dano e acerto devem ser decididos no **servidor** (CLAUDE.md §2/§4).
- O Rapier carrega um WASM (~1–2 MB): importe este módulo só na tela que o usa (`React.lazy`).

## Em um projeto Next.js (App Router)
1. Copie a pasta `prototype3d/` para `src/` e instale: `three @react-three/fiber @react-three/drei @react-three/rapier` (R3F 8 + rapier 1.x; com R3F 9 use rapier 2.x).
2. Em `config.ts`: `ASSET_BASE = "/assets"` e coloque `mapa.glb` e `player.glb` em `public/assets/`.
3. Componente de cliente, sem SSR:
```tsx
"use client";
import dynamic from "next/dynamic";
const Prototype3D = dynamic(() => import("@/prototype3d").then((m) => m.Prototype3D), { ssr: false });
export default function Page() { return <div style={{ width: "100vw", height: "100vh" }}><Prototype3D /></div>; }
```

## Referências de arquitetura
- `pmndrs/react-three-rapier` (`@react-three/rapier`): é o pacote usado aqui (não existe `pmndrs/use-rapier`).
- `pmndrs/ecctrl` (MIT): controlador de personagem com cápsula dinâmica + raios; mesma ideia deste controlador, mas v2 exige R3F 9.
- Rede (futuro): Colyseus para o servidor autoritativo do deathmatch (CLAUDE.md §4).

## Versão single-player offline (sem servidor, login nem rede)
- Página separada, só no desenvolvimento: `/offline.html` (não entra no build do site).
- Rodar: `pnpm --filter @manifestacao/client dev:offline` (abre `http://localhost:5173/offline.html`).
- Seus arquivos 3D: `apps/client/public/offline/mapa.glb` e `player.glb` (nomes em `config.ts`).
  **O git ignora tudo dessa pasta** (exceto `.gitkeep` e `LEIAME.txt`): nada vai para o repositório nem para o site.
- Não faz nenhuma requisição externa (sem CDN, sem Supabase). Sem os arquivos, aparece a cápsula vermelha e a grade.
- Modelo sem esqueleto (malha estática) também funciona: altura ajustada para 1,75 m e movimento feito por código.
