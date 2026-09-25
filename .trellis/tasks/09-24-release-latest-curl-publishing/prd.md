# Curl installation from latest GitHub Release

## Goal

Make the documented curl installation use the latest published stable GitHub Release instead of installing mutable `main`, and establish a repeatable way to publish releases that the installer can consume.

## Confirmed background

- The current documented curl command fetches `scripts/install.sh` from raw `main`; the script defaults to `uv tool install` from Git `main` and records that ref in install state.
- `pyproject.toml` builds a universal wheel and defines `jev` and `jev-gateway` entry points. The CLI displays a hard-coded `0.1.0` version.
- There is no tracked GitHub Actions workflow, remote tag, or GitHub Release. The current `releases/latest` API returns 404.
- The earlier curl/CLI task explicitly deferred release tags and published wheels. Its preservation and uninstall contracts remain relevant.

## Requirements

- The default documented curl installation resolves the latest published stable Release wheel; it must not silently install `main` if no release exists.
- Users can pass `--version X.Y.Z` to install a specific published release. The default remains latest stable; an explicit version may select a prerelease.
- The documented one-line command fetches a stable bootstrap script from raw `main`; that script resolves and installs the selected Release wheel.
- A version tag triggers GitHub Actions to build and validate the package, then publish the wheel and its SHA256 checksum as a GitHub Release. The workflow must not rely on a release event caused by `GITHUB_TOKEN` to start another workflow.
- The publishing workflow uses only the minimum required `contents: write` permission and `GITHUB_TOKEN`; repository tag protection controls who may publish.
- The installer downloads the checksum from the same Release and verifies the wheel before installation. Missing checksum files or mismatches stop installation.
- Provide a repeatable release publication process with validation of package version and distributable contents before publication.
- Preserve macOS/Linux support, isolated CLI installation, existing runtime configuration and records on reinstall, and the current uninstall preservation behavior.
- Ensure installation state identifies the source actually installed and update the relevant installation documentation in both README languages.
- Do not create the first public Release as part of this task; repository changes establish the publishing mechanism only.

## Acceptance criteria

- [ ] After a stable release exists, the documented one-line command installs its published wheel without cloning the repository.
- [ ] Users can pass `--version X.Y.Z` to install the corresponding published wheel; explicit prerelease versions are allowed while the default remains latest stable.
- [ ] Without a qualifying release, installation fails with a clear actionable error rather than falling back to `main`.
- [ ] A tagged release can be validated and published reproducibly with an installable artifact and consistent version information.
- [ ] Tests cover release resolution, installation/provenance, and missing or invalid release cases without relying on the live GitHub API.
- [ ] Reinstallation preserves existing configuration and records; documentation describes release pinning and rollback behavior.

## Out of scope

- Windows installation.
- Homebrew tap, PyPI, and container image publication.
- Private Release authentication.
- Creating the first public Release.
