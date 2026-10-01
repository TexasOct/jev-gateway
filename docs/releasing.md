# Publishing a GitHub Release

Each Release publishes four assets:

- `install.sh`
- `install.sh.sha256`
- `jev_gateway-X.Y.Z-py3-none-any.whl`
- `jev_gateway-X.Y.Z-py3-none-any.whl.sha256`

The public installer URL is
`https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh`.
A pinned URL, such as
`https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/install.sh`,
selects one published tag. These URLs require published assets; adding the
workflow or running local validation does not publish a Release.

## Build and validate locally

Use a clean checkout of the intended release commit. Keep `frontend/` source and
its lockfile tracked. Generated `jev_gateway/static/` output is ignored by Git
and must be built before Python tests or wheel packaging. Installed Release
wheels include those assets and do not need Node.js. Docker builds its own
frontend in a Node stage before creating the wheel.

For release validation, use Python 3.12+, uv, and Node.js with npm.
The workflow uses Python 3.12 and Node.js 22. From a fresh
checkout, run:

```sh
git clone https://github.com/TexasOct/jev-gateway.git
cd jev-gateway
# Check out the intended release commit before building.
uv sync --all-groups
npm --prefix frontend install
npm --prefix frontend run lint
npm --prefix frontend run test
scripts/build-frontend.sh
scripts/build-frontend.sh --check
uv run pytest -q
uvx pyright
uv build
python3 scripts/validate-release.py v0.1.0 dist
```

Replace `v0.1.0` with `v<project.version>` from `pyproject.toml`. Supported versions
are `X.Y.Z`, `X.Y.ZaN`, `X.Y.ZbN`, and `X.Y.ZrcN`. The validator requires exactly
one wheel in `dist/`, with a filename and metadata matching that version. Use a
fresh output directory when changing versions; do not publish an old local
artifact left in a dirty checkout.

`scripts/build-frontend.sh` installs npm dependencies and builds the frontend;
its `--check` mode only checks for missing or stale output. Tests that need the
dashboard use the session-scoped `dashboard_bundle` fixture, which runs
`npm --prefix frontend run build` once and requires npm dependencies to be
installed already. Tests cannot rely on generated files being present in Git.

Validation checks the wheel metadata, both CLI entry points, templates, dashboard
shell and referenced JS/CSS, license, and exact packaged-file parity with the
built source tree. It then replaces the single `RELEASE_TAG=__JEV_RELEASE_TAG__`
assignment in `scripts/install.sh` with the tag, checks shell syntax, writes
`dist/install.sh`, and creates both SHA256 sidecars. The unstamped source
template cannot perform a Release install, even with `--version`; use the
generated or published artifact to test Release behavior. The template's
`--ref REF` path is only an explicit developer Git install.

## Publish from the release commit

An installed-wheel smoke on macOS is a release prerequisite. Run the same
validated wheel that will be uploaded, with Python 3.12 and uv available:

```sh
python3 scripts/smoke-installed-release.py \
  --wheel /absolute/path/dist/jev_gateway-0.1.0-py3-none-any.whl \
  --version 0.1.0 \
  --work-dir '/absolute/path/jev installed smoke'
```

The script installs managed Python 3.12 into isolated uv tool, binary, and state
directories. It initializes packaged templates in a runtime home containing
spaces, uses dummy credentials, and launches installed commands from an unrelated
directory. Checks cover file create/read/update/rename/delete, CLI lifecycle,
readiness with invalid proxy settings, dashboard assets, SQLite integrity and
schema, authenticated provider and routing
configuration writes, repeat installation, direct foreground startup, and
uninstall preservation. It makes no upstream requests. Services are stopped on
exit; sanitized command logs and `checks.json` remain under `work-dir/evidence`.
The evidence includes a `success` boolean, which is true only after all checks pass.
Each invocation creates a unique installation directory and preserves its runtime
files for inspection. The script never uses the operator's default installation.

1. Protect tags matching `v*` in repository rules so only authorized maintainers
   can publish. `.github/workflows/release.yml` uses `GITHUB_TOKEN` with
   `contents: write` and runs on tag pushes; it does not depend on a second
   Release event.
2. Set `project.version` in `pyproject.toml`, complete the local checks above,
   and review the release commit before creating and pushing its matching tag.
   Pushing that tag starts publication.
3. The workflow checks out the tag, installs Python 3.12 and Node.js 22, and
   validates the tag/version match. It installs frontend dependencies, runs
   frontend lint/tests, builds the dashboard, and checks freshness before the
   Python tests, Pyright, and `uv build --out-dir dist`. The validator creates
   the stamped installer and both sidecars after checking the wheel.
4. The build job uploads the four assets as one artifact. Ubuntu and macOS smoke
   jobs download that same artifact and run the installed-wheel check from the
   tagged checkout, without Node.js. Publication depends on both smoke jobs.
   Only after those checks pass does the workflow publish the four explicit
   asset paths listed above with generated release notes. Stable versions are
   marked latest. Prereleases are marked prerelease with `--latest=false` and
   require an explicit version or tagged URL to install. The local sdist is not
   included in this upload list.
5. After publication, test the published installer with a throwaway runtime
   home and isolated uv tool directories. Check `jev --version`, `jev doctor`,
   dashboard serving, repeat-install preservation, and normal uninstall. A
   runtime `--home` alone does not isolate the installed CLI; also set
   `UV_TOOL_DIR` and `UV_TOOL_BIN_DIR` for the smoke test.

The workflow refuses to publish if a draft or published Release already exists
for the tag. It also stops if it cannot confirm that the Release is absent.
If publication fails after a Release or draft is created, inspect its state and
assets before deciding whether to remove it and retry. Never overwrite an
existing Release's assets as an automatic retry.

## Version selection and trust

The latest URL selects the initial installer. Each installer embeds its own tag
and verifies a wheel downloaded directly from that tag's asset URL. It does not
resolve latest again or query an API to locate the wheel. Passing `--version`
for a different tag downloads that tag's installer and sidecar, verifies its
SHA256 and exact embedded identity, then invokes it once with the supported
flags forwarded. A delegated installer requires matching requested and embedded
tags and cannot delegate again. Roll back with a previously published tag's URL
or `--version`; existing runtime configuration and records remain in place.

Missing assets, invalid checksum files, tag mismatches, and digest failures stop
before unverified child execution or CLI replacement. There is no raw-main
bootstrap or fallback to `main`. If no stable Release exists, the public latest
download is unavailable.

The initial `curl | sh` command cannot verify the downloaded script before
executing it. Use the [pinned download, review, and checksum example](local-install.md#verify-installer)
when that check is required. Fetching both files from one pinned tag avoids a
latest-version race. A sidecar from the same publisher detects transfer errors
and inconsistent assets; it does not provide an independent signature against
a compromised publisher. The installer verifies its downloaded wheel and any
cross-version child, not its own initially executed bytes.
