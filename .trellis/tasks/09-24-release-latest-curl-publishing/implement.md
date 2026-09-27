# Implementation plan

## 1. Inventory current bootstrap and release contract

- Inspect current `scripts/install.sh`, `scripts/validate-release.py`, `.github/workflows/release.yml`, versioned CLI/install-state behavior, tests and docs.
- Freeze artifact names and trusted origins: each Release publishes `install.sh`, `jev_gateway-X.Y.Z-py3-none-any.whl`, and a SHA256 sidecar for each.
- Publish the public install command as a GitHub Release asset URL. The selected Release supplies the executable installer, its checksum, wheel and wheel checksum; no install behavior is fetched from raw `main`.

## 2. Build the stable bootstrap

- Resolve latest stable or an explicit validated version through GitHub Releases API.
- Validate exact asset names/HTTPS URLs and download the selected Release's installer plus installer checksum.
- Verify installer SHA256 before executing. Invoke it as an argument vector with validated release tag and home/consent settings; never shell-interpolate API output.
- Fail if Release, installer asset, checksum or digest is absent/invalid. Never fall back to main source.
- Keep bootstrap minimal and independent of Python/uv installation unless required to execute the versioned installer.

## 3. Build the versioned standalone installer

- Add a release-packaged installer source/template that owns uv bootstrap, wheel/checksum download, SHA256 verification, `uv tool install`, initialization and provenance.
- The release workflow packages the same versioned installer file without rewriting behavior at runtime. A new install behavior ships only when a new Release contains it.
- Ensure reinstall preserves models, environment file and records. Keep uninstall preservation contract.
- Keep explicit developer/ref installation out of the public bootstrap unless required for backward compatibility; do not leave undocumented dual modes.

## 4. Release validation and publishing

- Build frontend assets from source, then validate tag and `pyproject` version, wheel metadata and contents, entry points, license, templates, dashboard assets and bundled installer presence.
- Remove generated `jev_gateway/static/` bundles from Git tracking and update project specs to document release-time frontend generation.
- Generate SHA256 files for installer and wheel with strict filenames.
- Update tag-triggered workflow to publish all three artifacts in one release job with `contents: write`; no workflow chaining from a GITHUB_TOKEN-created release event.
- Test missing/invalid artifacts and preexisting-release behavior offline.

## 5. Documentation and install state

- Clarify that curl fetches the installer from the selected Release asset, while the actual package and install behavior are pinned to that release.
- Explain how latest and pinned release installer URLs work, including that changing install behavior requires publishing a new release.
- Document asset/checksum verification, missing release behavior, version pinning/rollback, and preserved runtime data in both READMEs and release/install docs.
- Store provenance for both bootstrap-selected tag and wheel source/version; continue parsing old Git-ref install state.

## 6. Verification

- Unit-test release resolution and exact asset allowlist, installer checksum and wheel checksum validation, argument handling, no fallback, no mutation before verification, dry-run, reinstall preservation and old state compatibility.
- Run shell syntax checks, focused installer/release tests, complete `uv run pytest -q`, `uvx pyright`, `uv build`, and wheel contents/metadata inspection.
- Do not push a tag, publish a Release, install to the user's actual home or modify live runtime data.

## Rollback points

- Revert bootstrap separately from versioned installer and release workflow.
- If a release lacks the versioned installer/checksum, fail closed; never execute main or an unverified downloaded script as fallback.
- Keep the prior published release assets immutable so users can roll back by selecting an earlier version.
