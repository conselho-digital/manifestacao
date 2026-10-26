#!/usr/bin/env bash
# Instala o TripoSR (imagem → modelo 3D, licença MIT) para uso LOCAL como ferramenta de desenvolvimento.
# Não faz parte do jogo: o resultado (.glb) é revisado e só então entra em apps/client/public/models.
#
# Usa Python 3.10 (o do TripoSR, com os pinos originais: os pesos só carregam com transformers 4.35) baixado pelo `uv`,
# num ambiente isolado em tools/triposr/.venv — não mexe no Python do sistema.
set -euo pipefail
cd "$(dirname "$0")"
REPO="https://github.com/VAST-AI-Research/TripoSR.git"
COMMIT="${TRIPOSR_COMMIT:-107cefdc244c39106fa830359024f6a2f1c78871}"   # versão testada

command -v uv >/dev/null 2>&1 || python3 -m pip install --user uv
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

[ -d TripoSR ] || git clone "$REPO" TripoSR
git -C TripoSR fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C TripoSR checkout -q "$COMMIT"

"$UV" python install 3.10
[ -d .venv ] || "$UV" venv --python 3.10 .venv
PIP=("$UV" pip install --python .venv/bin/python)

# PyTorch: sem GPU, a versão de CPU (leve). Com GPU NVIDIA: TORCH_INDEX=https://download.pytorch.org/whl/cu121
TORCH_INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cpu}"
"${PIP[@]}" torch torchvision --index-url "$TORCH_INDEX"

# Dependências do TripoSR (o gradio, a interface web, não é necessário; torchmcubes compila contra o torch instalado).
grep -v -E '^(torch|torchvision|gradio|git\+.*torchmcubes)' TripoSR/requirements.txt > .req.txt
"${PIP[@]}" -r .req.txt "rembg[${REMBG_EXTRA:-cpu}]" "numpy<2" setuptools wheel pybind11 scikit-build-core cmake ninja
"${PIP[@]}" --no-build-isolation "git+https://github.com/tatsy/torchmcubes.git"
rm -f .req.txt
echo "TripoSR instalado. Use: tools/triposr/run.sh <imagem.png> [pasta-de-saída]"
