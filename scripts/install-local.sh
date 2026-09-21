#!/bin/sh
set -eu

usage() {
    cat <<'EOF'
Usage: scripts/install-local.sh [--editable]

Install JEV Gateway as an isolated uv tool and create a local runtime directory.

  --editable  Link the installed command to this checkout for development.
EOF
}

editable=false
case "${1:-}" in
    "") ;;
    --editable) editable=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
esac

if ! command -v uv >/dev/null 2>&1; then
    echo "error: uv is required (https://docs.astral.sh/uv/)" >&2
    exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(dirname "$script_dir")
config_dir=${JEV_GATEWAY_HOME:-"$HOME/.jev-gateway"}
bin_dir=${UV_TOOL_BIN_DIR:-"$HOME/.local/bin"}

if [ "$editable" = true ]; then
    uv tool install --force --editable "$repo_dir"
else
    uv tool install --force "$repo_dir"
fi

mkdir -p "$config_dir" "$bin_dir"
if [ ! -f "$config_dir/models.json" ]; then
    cp "$repo_dir/models.example.json" "$config_dir/models.json"
fi
if [ ! -f "$config_dir/.env" ]; then
    cp "$repo_dir/.env.example" "$config_dir/.env"
fi

launcher="$bin_dir/jev-gateway-local"
cat >"$launcher" <<EOF
#!/bin/sh
set -eu
export JEV_GATEWAY_HOME='$config_dir'
exec '$bin_dir/jev-gateway' "\$@"
EOF
chmod +x "$launcher"

cat <<EOF
JEV Gateway installed.

Runtime directory: $config_dir
Launcher:          $launcher
Install mode:      $(if [ "$editable" = true ]; then printf editable; else printf isolated; fi)

Next steps:
  1. Edit $config_dir/models.json
  2. Edit $config_dir/.env
  3. Run $launcher

The installer preserves existing models.json and .env files on repeat runs.
EOF
