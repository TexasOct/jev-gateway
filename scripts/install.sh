#!/bin/sh
set -eu

version=
ref=
home=${JEV_GATEWAY_HOME:-${HOME:?HOME must be set}/.jev-gateway}
no_init=0
dry_run=0
yes=0
no_uv=0
fail() { echo "jev installer: $*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version|--ref|--home)
      [ "$#" -ge 2 ] || { echo "missing value for $1" >&2; exit 2; }
      [ -n "$2" ] || { echo "missing value for $1" >&2; exit 2; }
      case "$1" in --version) version=$2 ;; --ref) ref=$2 ;; --home) home=$2 ;; esac
      shift 2 ;;
    --no-init) no_init=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    --yes) yes=1; shift ;;
    --no-uv) no_uv=1; shift ;;
    -h|--help) echo "Usage: install.sh [--version X.Y.Z | --ref REF] [--home DIR] [--no-init] [--dry-run] [--yes] [--no-uv]"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -z "$ref" ] || [ -z "$version" ] || { echo "--ref and --version cannot be combined" >&2; exit 2; }
case "$(uname -s)" in Darwin|Linux) ;; *) echo "jev installer supports macOS and Linux only" >&2; exit 2 ;; esac
if [ -n "$ref" ]; then
  case "$ref" in *[!a-zA-Z0-9._/-]*|-*|/*|*..*|*//*|*.lock|refs/*|HEAD|head) echo "invalid Git ref: $ref" >&2; exit 2 ;; esac
else
  # Tags are v<version>; PEP 440 prerelease suffixes are supported for explicit installs.
  if [ -n "$version" ]; then
    version=${version#v}
    if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$'; then
      echo "invalid version (expected X.Y.Z or X.Y.ZrcN): $version" >&2
      exit 2
    fi
  fi
fi
ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    uv_bin=$(command -v uv)
    return
  fi
  [ "$no_uv" -eq 0 ] || { echo "uv is required but --no-uv was set" >&2; exit 2; }
  if [ "$dry_run" -eq 1 ]; then
    uv_bin=uv
    echo "Would install uv from https://astral.sh/uv/install.sh"
    return
  fi
  if [ "$yes" -ne 1 ] && [ -r /dev/tty ] && [ -t 0 ]; then
    printf 'Install uv from astral.sh? [y/N] ' > /dev/tty
    read answer < /dev/tty
    [ "$answer" = y ] || [ "$answer" = Y ] || { echo "uv installation cancelled" >&2; exit 1; }
  elif [ "$yes" -ne 1 ]; then
    echo "uv is missing; install uv first or rerun with --yes" >&2
    exit 2
  fi
  temp_script=$(mktemp "${TMPDIR:-/tmp}/jev-install-uv.XXXXXX")
  # An existing release workspace also needs cleanup if the bootstrap fails.
  if [ -n "${work:-}" ]; then
    trap 'rm -rf "$work"; rm -f "$temp_script"' EXIT
  else
    trap 'rm -f "$temp_script"' EXIT
  fi
  curl -fsSL --proto '=https' --proto-redir '=https' https://astral.sh/uv/install.sh -o "$temp_script" || fail "could not download uv bootstrap"
  sh "$temp_script" --no-modify-path
  rm -f "$temp_script"
  if [ -n "${work:-}" ]; then
    trap 'rm -rf "$work"' EXIT
  else
    trap - EXIT
  fi
  uv_bin="$HOME/.local/bin/uv"
  [ -x "$uv_bin" ] || fail "uv bootstrap did not create $uv_bin"
}
if [ "$dry_run" -eq 1 ]; then
  ensure_uv
  if [ -n "$ref" ]; then
    echo "Git ref: $ref (explicit developer install; no release checksum)"
    echo "$uv_bin tool install --force git+https://github.com/TexasOct/jev-gateway@$ref"
    [ "$no_init" -eq 1 ] || echo "jev install init --home $home --ref $ref --method isolated"
  else
    echo "Release selector: ${version:-latest stable}"
    echo "Would resolve the GitHub Release, download its wheel and SHA256, and verify before installing. Dry-run does not query GitHub or verify the checksum."
    echo "$uv_bin tool install --force <verified release wheel>"
    [ "$no_init" -eq 1 ] || echo "jev install init --home $home --version <resolved version> --source <release wheel URL> --method isolated"
  fi
  exit 0
fi
if [ -n "$ref" ]; then
  source="git+https://github.com/TexasOct/jev-gateway@$ref"
  ensure_uv
  "$uv_bin" tool install --force "$source"
  init_args=ref
else
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to inspect and verify release assets"
  command -v curl >/dev/null 2>&1 || fail "curl is required to download release assets"
  work=$(mktemp -d "${TMPDIR:-/tmp}/jev-release.XXXXXX")
  trap 'rm -rf "$work"' EXIT
  api="https://api.github.com/repos/TexasOct/jev-gateway/releases/latest"
  [ -z "$version" ] || api="https://api.github.com/repos/TexasOct/jev-gateway/releases/tags/v$version"
  if ! curl -fsSL --retry 2 --proto '=https' --proto-redir '=https' -H 'Accept: application/vnd.github+json' "$api" -o "$work/release.json"; then
    fail "release lookup failed for ${version:-latest stable}; check published GitHub Releases or use --version X.Y.Z"
  fi
  # Parse untrusted API data into constrained filenames and fixed-origin URLs.
  if ! python3 - "$work/release.json" "$version" > "$work/assets" <<'PY'
import json
import re
import sys
from pathlib import Path

try:
    release = json.loads(Path(sys.argv[1]).read_text())
    tag = release['tag_name']
    match = re.fullmatch(r'v([0-9]+\.[0-9]+\.[0-9]+(?:(?:a|b|rc)[0-9]+)?)', tag)
    if not match or (sys.argv[2] and match.group(1) != sys.argv[2]):
        raise ValueError('unexpected release tag')
    if not isinstance(release['draft'], bool) or not isinstance(release['prerelease'], bool) or not isinstance(release['assets'], list):
        raise ValueError('invalid release flags or assets')
    if release['draft'] or (not sys.argv[2] and (release['prerelease'] or re.search(r'(?:a|b|rc)[0-9]+$', tag))):
        raise ValueError('release is not a published stable release')
    version = match.group(1)
    wheel = f'jev_gateway-{version}-py3-none-any.whl'
    prefix = f'https://github.com/TexasOct/jev-gateway/releases/download/{tag}/'
    def asset(name):
        matches = [item for item in release['assets'] if isinstance(item, dict) and item.get('name') == name]
        if len(matches) != 1 or matches[0].get('browser_download_url') != prefix + name:
            raise ValueError(f'missing or invalid release asset: {name}')
        return matches[0]['browser_download_url']
    print(version)
    print(asset(wheel))
    print(asset(wheel + '.sha256'))
except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
    print(f'jev installer: invalid release metadata: {exc}', file=sys.stderr)
    sys.exit(1)
PY
  then
    fail "cannot install release ${version:-latest stable}; check its wheel and checksum assets"
  fi
  resolved_version=$(awk 'NR==1 {print}' "$work/assets")
  wheel_url=$(awk 'NR==2 {print}' "$work/assets")
  checksum_url=$(awk 'NR==3 {print}' "$work/assets")
  wheel="$work/jev_gateway-$resolved_version-py3-none-any.whl"
  curl -fsSL --retry 2 --proto '=https' --proto-redir '=https' "$wheel_url" -o "$wheel" || fail "could not download release wheel"
  curl -fsSL --retry 2 --proto '=https' --proto-redir '=https' "$checksum_url" -o "$work/checksum" || fail "could not download release checksum"
  python3 - "$wheel" "$work/checksum" <<'PY' || fail "release wheel SHA256 verification failed; CLI was not replaced"
import hashlib
import re
import sys
from pathlib import Path

wheel = Path(sys.argv[1])
checksum = Path(sys.argv[2]).read_bytes()
expected = re.fullmatch(rb'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)\n?', checksum)
if not expected or expected.group(2).decode() != wheel.name:
    sys.exit('invalid SHA256 sidecar format or filename')
if hashlib.sha256(wheel.read_bytes()).hexdigest() != expected.group(1).decode():
    sys.exit('SHA256 mismatch')
PY
  ensure_uv
  "$uv_bin" tool install --force "$wheel"
  init_args=wheel
fi
bin_dir=${UV_TOOL_BIN_DIR:-"$HOME/.local/bin"}
if [ "$no_init" -eq 0 ]; then
  if [ "$init_args" = wheel ]; then
    "$bin_dir/jev" --home "$home" install init --version "$resolved_version" --source "$wheel_url" --method isolated
  else
    "$bin_dir/jev" --home "$home" install init --ref "$ref" --method isolated
  fi
fi
case ":$PATH:" in *":$bin_dir:"*) ;; *) echo "Add $bin_dir to PATH to run jev and jev-gateway." ;; esac
