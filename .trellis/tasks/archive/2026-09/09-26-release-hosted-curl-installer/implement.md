# Implementation plan

## 1. Release-hosted installer contract

- Add a stable public launcher at a GitHub Release asset URL and a version-pinned installer URL shape.
- Publish a standalone versioned `install.sh` and SHA256 sidecar with each wheel and wheel checksum.
- Embed the release's own tag in the full installer. When `--version` selects a different tag, download/checksum-verify that tag's installer and delegate once with flags forwarded; install its wheel using the embedded tag.
- Keep the initial curl-to-shell trust limitation explicit and document a manual download, review, and checksum-verification flow. Preserve no-network dry-run semantics.

## 2. Installer, packaging, and frontend build

- Refactor installer behavior into the self-contained versioned Release asset and preserve compatible flags, isolated uv installation, CLI initialization, accurate provenance, reinstall preservation, and safe `--ref` developer use.
- Update release validation to check installer identity and checksum outputs as well as wheel metadata/content. Configure the tag workflow to upload each expected file explicitly rather than relying on wildcard checksum matches.
- Remove generated `jev_gateway/static/` assets from Git tracking and ignore generated outputs while retaining tracked frontend source.
- Update dashboard/package specs that currently require the generated bundle to be committed, replacing that requirement with release-build generation and package validation.
- Ensure the Release workflow runs the frontend build before `uv build`, then validate that the wheel includes non-empty current dashboard assets and expected package files.
- Preserve local development/test/build behavior by generating frontend assets when needed; avoid accidentally breaking source installs or tests that depend on static resources.

## 3. Release workflow and documentation

- Update the tag-triggered workflow to build frontend, package, validate, and publish installer + installer checksum + wheel + wheel checksum from the tag in one job.
- Document the build and release process, latest and pinned curl URLs, explicit prerelease selection, checksum behavior, failures, rollback, and trust boundary.
- Keep `README.md` and `README.zh-CN.md` in matching structure and update `docs/local-install.md`, `docs/cli.md`, and `docs/releasing.md` where relevant.

## 4. Tests and verification

- Add offline tests for latest/pinned paths, stable tag handoff, explicit prerelease, missing assets, malformed/mismatched checksums, no fallback, dry-run, flags, and CLI install provenance compatibility.
- Test release validation for installer and wheel artifacts, and prove the frontend build precedes packaging and is present in the wheel.
- Add cross-version delegation tests that prove checksum verification precedes child execution, the child runs once, and installer/wheel versions match.
- Run installer shell syntax checks, focused tests, `uv run pytest -q`, `uvx pyright`, frontend lint/tests, frontend build freshness checks as adapted to untracked output, and `uv build` plus wheel-content inspection.
- Update `.trellis/spec/backend/dashboard-routing-config.md` and `quality-guidelines.md` so future changes follow the untracked-bundle/release-build contract.
- Preserve existing uncommitted frontend source changes. Do not include unrelated UI edits in commits. Do not push tags, publish releases, or install into live user directories.

## Rollback points

- Keep launcher, versioned installer, workflow, and frontend tracking changes separable for review/revert.
- If frontend build or package validation fails, stop before Release publication; do not ship a wheel without dashboard assets.
- If the selected Release or any required checksum/artifact is missing or invalid, abort without falling back to `main`.