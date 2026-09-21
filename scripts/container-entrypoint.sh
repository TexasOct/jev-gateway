#!/bin/sh
set -eu

runtime_dir=${JEV_GATEWAY_HOME:-"$HOME/.jev-gateway"}
mkdir -p "$runtime_dir"

if [ ! -f "$runtime_dir/models.json" ]; then
    python - "$runtime_dir/models.json" <<'PY'
import json
import sys
from pathlib import Path

source = Path("/opt/jev-gateway/models.example.json")
target = Path(sys.argv[1])
document = json.loads(source.read_text(encoding="utf-8"))
document.setdefault("gateway", {})["host"] = "0.0.0.0"
target.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
fi

if [ ! -f "$runtime_dir/.env" ]; then
    cp /opt/jev-gateway/.env.example "$runtime_dir/.env"
fi

export JEV_GATEWAY_HOME="$runtime_dir"
exec jev-gateway "$@"
