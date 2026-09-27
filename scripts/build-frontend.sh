#!/bin/sh
# Build the dashboard bundle into jev_gateway/static, or check that the
# generated bundle is not older than the frontend sources it was built from.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
frontend="$root/frontend"
output="$root/jev_gateway/static"

if [ "${1:-}" != "--check" ]; then
    # Install platform-specific optional bindings for Vite/rolldown.
    npm --prefix "$frontend" install
    npm --prefix "$frontend" run build
    echo "dashboard bundle written to $output"
    exit 0
fi

if [ ! -f "$output/index.html" ]; then
    echo "dashboard bundle is missing; run scripts/build-frontend.sh" >&2
    exit 1
fi

stale=$(find "$frontend/src" "$frontend/index.html" "$frontend/package.json" \
    "$frontend/package-lock.json" "$frontend/vite.config.ts" "$frontend"/tsconfig*.json \
    -type f -newer "$output/index.html" -print -quit)

if [ -n "$stale" ]; then
    echo "dashboard bundle is stale: $stale" >&2
    echo "newer than $output/index.html; run scripts/build-frontend.sh" >&2
    exit 1
fi

echo "dashboard bundle is current"
