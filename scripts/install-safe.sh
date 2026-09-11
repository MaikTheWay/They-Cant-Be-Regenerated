#!/usr/bin/env bash
set -Eeuo pipefail

# Resolve o projeto a partir do próprio script, não do diretório em que o shell
# estava quando foi invocado. Isso permite recuperar uma sessão cujo cwd foi
# removido ou renomeado antes de iniciar o Node/pnpm.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  printf 'Erro: package.json não encontrado em %s\n' "$PROJECT_ROOT" >&2
  exit 1
fi

cd -- "$PROJECT_ROOT"
printf 'Instalando dependências em: %s\n' "$PWD"
exec pnpm install --no-frozen-lockfile "$@"
