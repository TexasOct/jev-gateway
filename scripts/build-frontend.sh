#!/bin/sh
# Build the dashboard bundle into jev_gateway/static, or check that the
# committed bundle is not older than the frontend sources it was built from.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
frontend="$root/frontend"
output="$root/jev_gateway/static"

if [ "${1:-}" != "--check" ]; then
    # `npm ci` refuses a lockfile whose platform-conditional native bindings
    # were pruned by the platform that generated it (Vite's rolldown ships an
    # optional binding per OS/libc). Try the strict path, then install.
    if [ -f "$frontend/package-lock.json" ] && npm --prefix "$frontend" ci; then
        :
    else
        echo "npm ci unavailable for this lockfile; falling back to npm install" >&2
        npm --prefix "$frontend" install
    fi
    npm --prefix "$frontend" run build
    echo "dashboard bundle written to $output"
    exit 0
fi

if [ ! -f "$output/index.html" ]; then
    echo "dashboard bundle is missing; run scripts/build-frontend.sh" >&2
    exit 1
fi

stale=$(find "$frontend/src" "$frontend/index.html" "$frontend/package.json" \
    "$frontend/vite.config.ts" -type f -newer "$output/index.html" -print -quit 2>/dev/null || true)

if [ -n "$stale" ]; then
    echo "dashboard bundle is stale: $stale" >&2
    echo "newer than $output/index.html; run scripts/build-frontend.sh" >&2
    exit 1
fi

echo "dashboard bundle is current"
