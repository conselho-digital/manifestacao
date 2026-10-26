#!/usr/bin/env bash
# Gera um modelo 3D (.obj/.glb) a partir de UMA imagem (pessoa/objeto de frente, fundo liso ou PNG sem fundo).
# Uso: tools/triposr/run.sh foto.png [saida]    — baixa os pesos (stabilityai/TripoSR) na primeira vez.
set -euo pipefail
cd "$(dirname "$0")"
[ $# -ge 1 ] || { echo "uso: $0 <imagem> [pasta-de-saída]"; exit 1; }
IMG="$(realpath "$1")"
OUT="$(realpath -m "${2:-out}")"
# shellcheck disable=SC1091
source .venv/bin/activate
mkdir -p "$OUT/0"   # o run.py do TripoSR não cria a subpasta por imagem
cd TripoSR
python run.py "$IMG" --output-dir "$OUT" --model-save-format glb "${@:3}"
echo "Modelo em: $OUT"
