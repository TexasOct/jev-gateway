# Curl installation from latest GitHub Release

## Goal

Make the documented curl installation use the latest published stable GitHub Release instead of installing mutable `main`, and establish a repeatable way to publish releases that the installer can consume.

## Confirmed background

- The public curl installer comes from the selected GitHub Release asset, not raw `main`, and installs that release's checksummed wheel by default. Source/ref installs are only explicit developer escape hatches and are not the public one-line install path.
- Generated frontend output under `jev_gateway/static/` is excluded from Git; release packaging builds it from tracked frontend source before creating the wheel.
- `pyproject.toml` builds a universal wheel and defines `jev` and `jev-gateway` entry points. The CLI displays a hard-coded `0.1.0` version.
- There is no tracked GitHub Actions workflow, remote tag, or GitHub Release. The current `releases/latest` API returns 404.
- The earlier curl/CLI task explicitly deferred release tags and published wheels. Its preservation and uninstall contracts remain relevant.

## Requirements

- The default documented curl installation resolves the latest published stable Release wheel; it must not silently install `main` if no release exists.
- Users can pass `--version X.Y.Z` to install a specific published release. The default remains latest stable; an explicit version may select a prerelease.
- The documented one-line command fetches the standalone installer asset from the selected Release, verifies its checksum, then runs only that Release version's installation logic. It does not fetch install behavior from mutable `main`.
- A version tag triggers GitHub Actions to build the frontend from source, build and validate the package, then publish the installer and checksum plus wheel and checksum as a GitHub Release. The workflow must not rely on a release event caused by `GITHUB_TOKEN` to start another workflow.
- The publishing workflow uses only the minimum required `contents: write` permission and `GITHUB_TOKEN`; repository tag protection controls who may publish.
- Each Release contains the versioned standalone installer asset `install.sh`, the wheel, and matching SHA256 sidecars for both executable installer and wheel. The bootstrap resolves latest stable or the explicit tag, verifies the installer checksum before executing that downloaded installer, and the installer verifies the wheel checksum before installation. Missing/mismatched assets stop installation without falling back.
- Provide a repeatable release publication process with validation of package version and distributable contents before publication.
- Preserve macOS/Linux support, isolated CLI installation, existing runtime configuration and records on reinstall, and the current uninstall preservation behavior.
- Ensure install state identifies the wheel version/source. Installer assets remain immutable within each Release. Update installation documentation in both README languages.
- The Release workflow builds generated dashboard bundles from tracked frontend source before wheel packaging and verifies the wheel contains them.
- Do not create the first public Release as part of this task; repository changes establish the publishing mechanism only.

## Acceptance criteria

- [ ] After a stable release exists, the documented one-line command installs its published wheel without cloning the repository.
- [ ] Users can pass `--version X.Y.Z` to install the corresponding published wheel; explicit prerelease versions are allowed while the default remains latest stable.
- [ ] Without a qualifying release, installation fails with a clear actionable error rather than falling back to `main`.
- [ ] A tagged release can be validated and published reproducibly with a standalone installer, installable wheel, SHA256 sidecars for both assets, and consistent version information.
- [ ] Generated frontend bundles are no longer tracked; the Release workflow builds them from source before packaging and verifies they are included in the wheel.
- [ ] Tests cover release resolution, installation/provenance, and missing or invalid release cases without relying on the live GitHub API.
- [ ] Reinstallation preserves existing configuration and records; documentation describes release pinning and rollback behavior.

## Out of scope

- Changing dashboard behavior or design; only generated-bundle tracking and release-build ownership are in scope.
- Windows installation.
- Homebrew tap, PyPI, and container image publication.
- Private Release authentication.
- Creating the first public Release.
