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
| `city.glb` | cenário (visual e, por padrão, colisão `trimesh`) |
| `city_collision.glb` (opcional) | malha simplificada só para colisão — defina em `FILES.cityCollision` |
| `character.glb` | personagem com esqueleto e animações |

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
