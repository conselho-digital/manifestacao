# TripoSR (imagem → modelo 3D) — ferramenta de desenvolvimento

[TripoSR](https://github.com/VAST-AI-Research/TripoSR) (VAST AI + Stability AI, licença **MIT**; pesos `stabilityai/TripoSR`, também MIT)
gera um modelo 3D a partir de **uma imagem**. Roda **local**, sem conta e sem créditos. Não faz parte do jogo: o `.glb`
gerado é revisado (e passa pelo rig/escala, ver `apps/client/src/config/rigs.ts`) antes de entrar em
`apps/client/public/models/`.

## Instalar (uma vez)

```bash
tools/triposr/setup.sh
```

Baixa o TripoSR (commit fixado), um Python 3.10 isolado (via `uv`) e as dependências em `tools/triposr/.venv`.
Sem GPU instala o PyTorch de CPU; com GPU NVIDIA: `TORCH_INDEX=https://download.pytorch.org/whl/cu121 REMBG_EXTRA=gpu tools/triposr/setup.sh`.
Nada disso vai para o git (ver `.gitignore` desta pasta).

## Usar

```bash
tools/triposr/run.sh foto.png saida             # tira o fundo sozinho (rembg) e gera saida/0/mesh.glb
tools/triposr/run.sh foto.png saida --no-remove-bg --mc-resolution 256   # PNG já sem fundo; mais detalhe
```

- A imagem deve mostrar a pessoa/objeto inteiro, de frente, com fundo liso (ou PNG recortado).
- Na primeira execução baixa os pesos (~1,7 GB) do Hugging Face.
- Em CPU leva de dezenas de segundos a poucos minutos por imagem.

## Observações

- A malha sai com **cor por vértice** (sem textura) e pode vir deitada (eixos do TripoSR): ajuste a orientação/escala
  e simplifique (meshopt/gltf-transform) antes de usar no jogo; o modelo final precisa de esqueleto (o jogo monta um a
  partir das marcações em `rigs.ts`).
- **Licença do conteúdo gerado**: o código e os pesos são MIT, mas a imagem de entrada continua sendo do operador —
  direitos de imagem e de terceiros são dele (CLAUDE.md §9).
