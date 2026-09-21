#!/bin/sh
set -eu

if ! command -v uv >/dev/null 2>&1; then
    echo "error: uv is required (https://docs.astral.sh/uv/)" >&2
    exit 1
fi

bin_dir=${UV_TOOL_BIN_DIR:-"$HOME/.local/bin"}
uv tool uninstall jev-gateway || true
rm -f "$bin_dir/jev-gateway-local"

cat <<EOF
JEV Gateway command removed.
Runtime configuration was preserved at:
  ${JEV_GATEWAY_HOME:-"$HOME/.jev-gateway"}
Remove that directory manually if its models.json, .env, and database are no longer needed.
EOF
