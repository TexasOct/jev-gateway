#!/bin/sh
set -eu

# RELEASE_TAG is substituted for each published installer.
RELEASE_TAG=__JEV_RELEASE_TAG__

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
    case "$version" in *[!0-9.abrc]*) echo "invalid version: $version" >&2; exit 2 ;; esac
    if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$'; then
      echo "invalid version (expected X.Y.Z or X.Y.ZrcN): $version" >&2
      exit 2
    fi
  fi
fi
# A delegated installer must match the requested identity and cannot hand off again.
if [ -n "${JEV_INSTALL_DELEGATED_TAG:-}" ]; then
  [ -z "$ref" ] && [ -n "$version" ] && [ "v$version" = "$RELEASE_TAG" ] && [ "$JEV_INSTALL_DELEGATED_TAG" = "$RELEASE_TAG" ] || fail "delegated installer tag identity mismatch"
fi
if [ -z "$ref" ]; then
  case "$RELEASE_TAG" in
    *[!v0-9.abrc]*) fail "installer has no valid embedded release identity" ;;
    *) printf '%s\n' "$RELEASE_TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$' || fail "invalid embedded release tag" ;;
  esac
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
    echo "Release selector: ${version:-$RELEASE_TAG} (latest stable is selected by the public download URL)"
    if [ -n "$version" ] && [ "v$version" != "$RELEASE_TAG" ]; then
      echo "Would download and verify release v$version installer, then delegate once."
    fi
    echo "Would download the selected tag's wheel and SHA256 and verify before installing. Dry-run does not query GitHub or verify the checksum."
    echo "$uv_bin tool install --force <verified release wheel>"
    [ "$no_init" -eq 1 ] || echo "jev install init --home $home --version <resolved version> --source <release wheel URL> --method isolated"
  fi
  exit 0
fi
if [ -n "$version" ] && [ "v$version" != "$RELEASE_TAG" ]; then
  command -v curl >/dev/null 2>&1 || fail "curl is required to download selected release installer"
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to verify selected release installer"
  work=$(mktemp -d "${TMPDIR:-/tmp}/jev-delegate.XXXXXX")
  trap 'rm -rf "$work"' EXIT
  tag="v$version"
  base="https://github.com/TexasOct/jev-gateway/releases/download/$tag"
  child="$work/install.sh"
  curl -fsSL --proto '=https' --proto-redir '=https' "$base/install.sh" -o "$child" || fail "could not download installer for $tag"
  curl -fsSL --proto '=https' --proto-redir '=https' "$base/install.sh.sha256" -o "$work/install.sha256" || fail "could not download installer checksum for $tag"
  python3 - "$child" "$work/install.sha256" "$tag" <<'PYCODE' || fail "installer SHA256 verification failed"
import hashlib, re, sys
from pathlib import Path
script, sidecar, tag = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
match = re.fullmatch(rb'([0-9a-f]{64})  install\.sh\n?', sidecar.read_bytes())
if not match or hashlib.sha256(script.read_bytes()).hexdigest().encode() != match.group(1):
    raise SystemExit("invalid installer checksum")
identities = re.findall(r'^RELEASE_TAG=(.*)$', script.read_text(), re.MULTILINE)
if identities != [tag]:
    raise SystemExit("selected installer tag identity mismatch")
PYCODE
  set -- --version "$version" --home "$home"
  [ "$no_init" -eq 0 ] || set -- "$@" --no-init
  [ "$yes" -eq 0 ] || set -- "$@" --yes
  [ "$no_uv" -eq 0 ] || set -- "$@" --no-uv
  export JEV_INSTALL_DELEGATED_TAG="$tag"
  # Keep cleanup in a supervising shell: exec discards this shell's EXIT trap.
  exec sh -c 'work=$1; shift; trap '\''rm -rf "$work"'\'' EXIT; sh "$@"' sh "$work" "$child" "$@"
fi
if [ -n "$ref" ]; then
  source="git+https://github.com/TexasOct/jev-gateway@$ref"
  ensure_uv
  "$uv_bin" tool install --force "$source"
  init_args=ref
else
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to verify release assets"
  command -v curl >/dev/null 2>&1 || fail "curl is required to download release assets"
  work=$(mktemp -d "${TMPDIR:-/tmp}/jev-release.XXXXXX")
  trap 'rm -rf "$work"' EXIT
  resolved_version=${RELEASE_TAG#v}
  wheel_url="https://github.com/TexasOct/jev-gateway/releases/download/$RELEASE_TAG/jev_gateway-$resolved_version-py3-none-any.whl"
  checksum_url="$wheel_url.sha256"
  wheel="$work/jev_gateway-$resolved_version-py3-none-any.whl"
  curl -fsSL --retry 2 --proto '=https' --proto-redir '=https' "$wheel_url" -o "$wheel" || fail "could not download release wheel"
  curl -fsSL --retry 2 --proto '=https' --proto-redir '=https' "$checksum_url" -o "$work/checksum" || fail "could not download release checksum"
  python3 - "$wheel" "$work/checksum" "$resolved_version" <<'PY' || fail "release wheel verification failed; CLI was not replaced"
import hashlib
import re
import sys
import zipfile
from email import policy
from email.errors import MessageDefect, MessageError
from email.parser import Parser
from pathlib import Path

wheel = Path(sys.argv[1])
checksum = Path(sys.argv[2]).read_bytes()
version = sys.argv[3]
expected = re.fullmatch(rb'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)\n?', checksum)
if not expected or expected.group(2).decode() != wheel.name:
    sys.exit('invalid SHA256 sidecar format or filename')
if hashlib.sha256(wheel.read_bytes()).hexdigest() != expected.group(1).decode():
    sys.exit('SHA256 mismatch')
# The asset name and checksum do not establish the installed distribution identity.
metadata_path = f'jev_gateway-{version}.dist-info/METADATA'
try:
    with zipfile.ZipFile(wheel) as archive:
        metadata_paths = [name for name in archive.namelist()
                          if name == 'METADATA' or name.endswith('/METADATA')]
        if metadata_paths != [metadata_path]:
            sys.exit('invalid wheel METADATA path: expected exactly one release metadata entry')
        metadata_text = archive.read(metadata_path).decode('utf-8')
except (OSError, ValueError, RuntimeError, zipfile.BadZipFile):
    sys.exit('invalid wheel archive or METADATA encoding')
try:
    metadata = Parser(policy=policy.compat32.clone(raise_on_defect=True)).parsestr(metadata_text)
except (MessageDefect, MessageError):
    sys.exit('malformed wheel METADATA headers')
metadata_versions = metadata.get_all('Metadata-Version', [])
if len(metadata_versions) != 1 or not re.fullmatch(r'[1-9][0-9]*\.[0-9]+', metadata_versions[0]):
    sys.exit('invalid wheel METADATA format version')
if metadata.get_all('Name') != ['jev-gateway'] or metadata.get_all('Version') != [version]:
    sys.exit('wheel METADATA name/version mismatch (missing or duplicate fields are not allowed)')
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
