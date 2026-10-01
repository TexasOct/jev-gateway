# Release-hosted curl installer and frontend packaging

## Goal

Serve curl installation logic from immutable GitHub Release assets and make each Release wheel self-contained, including dashboard assets built from tracked frontend source.

## Requirements

- Each GitHub Release publishes `install.sh`, `install.sh.sha256`, the versioned Python wheel, and that wheel's SHA256 sidecar.
- Each Release's `install.sh` is a full installer with its release tag embedded. It verifies and installs the wheel for that tag. If `--version` selects another tag, it downloads that release's installer and checksum, verifies them, and delegates once with the requested tag and supported options forwarded. The target installer must verify the requested tag matches its embedded tag and must not delegate again.
- The public curl entry point retrieves the installer from GitHub Release assets, not raw `main`. The latest URL selects the latest stable Release; an explicit version selects a corresponding Release, including explicitly requested prereleases.
- Missing/malformed installer or wheel assets and checksum failures stop before executing an unverified child installer or replacing the installed CLI. There is no Git `main` fallback.
- Preserve macOS/Linux support, supported flags including dry-run and consent behavior, isolated uv tool installation, accurate wheel provenance, legacy Git state readability, runtime files and records on reinstall, and default uninstall preservation.
- Generated `jev_gateway/static/` build output is excluded from Git. The Release workflow builds it from tracked `frontend/` source before wheel packaging and validates that the wheel contains a working dashboard. Local commands/tests that require generated output must build it first or use explicit fixtures.
- Document latest/pinned selection, prereleases and rollback, checksum behavior, failure handling, the `curl | sh` trust limitation and a manual download/review/verification path. Keep English and Chinese README structure aligned.
- Do not push tags, publish a Release, or install into live user data during this task. Preserve unrelated uncommitted frontend source edits.

## Acceptance criteria

- [ ] Each Release publishes the installer and wheel with their matching SHA256 sidecars after successful validation.
- [ ] Installer assets embed the correct tag. Explicit cross-version selection verifies and invokes the requested tag's installer once, and that installer installs only its own wheel.
- [ ] Public installation docs use Release assets and do not fetch install logic from raw `main`.
- [ ] Invalid/missing assets or checksums fail closed before child execution or tool installation; no fallback to `main` occurs.
- [ ] Offline tests cover latest and pinned selection, prerelease, one-time delegation, tag identity, checksum failure ordering, no-fallback, dry-run and flag forwarding. A Release dry-run with an unstamped template fails clearly; the explicit `--ref` developer dry-run remains available.
- [ ] Reinstallation preserves runtime files and records; Release wheel provenance is accurate and legacy Git state remains readable.
- [ ] `jev_gateway/static/` is not Git-tracked; Release builds generate it from frontend source before wheel creation and validation confirms the wheel contains it.
- [ ] README.md and README.zh-CN.md stay structurally aligned; CLI, local install, and release docs explain checksums, rollback, and trust boundaries.
- [ ] No unrelated dirty files are included.

## Out of scope

- Publishing the first public Release or pushing tags.
- Dashboard feature/design changes; only generated-asset tracking and build ownership are in scope.
- Windows, PyPI, Homebrew, containers, and private Release authentication.