#!/bin/sh
set -eu

usage() {
    cat <<'EOF'
Usage: scripts/install-with-brew.sh [--editable]

Install uv through Homebrew, then install JEV Gateway with the shared local
installer. The runtime directory is $HOME/.jev-gateway by default.
EOF
}

case "${1:-}" in
    ""|--editable) ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac

if ! command -v brew >/dev/null 2>&1; then
    echo "error: Homebrew is required (https://brew.sh/)" >&2
    exit 1
fi

brew install uv
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$script_dir/install-local.sh" "$@"
