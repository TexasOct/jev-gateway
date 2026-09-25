# Release-based installation and publication design

## Boundaries

`scripts/install.sh` remains the public bootstrap entry point and supports macOS and Linux. It resolves the selected GitHub Release, verifies its wheel, and installs the wheel with `uv tool install`. The Python CLI continues to initialize runtime files and record installation provenance. GitHub Actions owns tagged source validation, wheel construction, checksum generation, and Release creation.

The first public Release is not part of this change. The installer and workflow can be tested with mocked GitHub responses and local artifacts before maintainers create a real Release.

## Install selection and acquisition

- No version argument selects GitHub's latest stable Release. Use the Releases API's `latest` endpoint, which excludes prereleases; treat 404 or an absent matching asset as a clear failure.
- `--version X.Y.Z` selects an explicitly named Release, including a prerelease. Normalize an optional leading `v` consistently or reject it consistently; document the chosen form during implementation. Fetch the exact tag's Release metadata, not a guessed mutable branch.
- Use a single predictable artifact name derived from the package name and version, for example `jev_gateway-X.Y.Z-py3-none-any.whl`, and a sidecar SHA256 file with a matching basename. Workflow, installer, tests, and docs must share this convention.
- Download the wheel and checksum over HTTPS from the same immutable Release. Validate that the asset exists, the checksum has the expected format and filename, and the computed SHA256 matches before invoking `uv tool install` on the local wheel. Any metadata, download, or integrity failure aborts before replacing the installed CLI.
- Keep release resolution and package acquisition in the shell installer. This avoids introducing GitHub network concerns into runtime CLI commands.
- Preserve `--home`, initialization opt-out, `--dry-run`, `--yes`, and `--no-uv` semantics where applicable. Dry-run must not install or mutate; show the requested release selector and commands, and clearly state that latest resolution and checksum cannot be verified offline unless the user explicitly opts into lookup.

## Version and provenance contract

The package version in `pyproject.toml` is the canonical release version. Replace the hard-coded `jev --version` value with package metadata so installed wheel version reporting follows the artifact. Release tags use `v<project-version>` and the workflow verifies that the tag and built wheel metadata agree.

The installer passes explicit provenance to `jev install init`. Extend install state to represent a wheel installation accurately, including selected version and wheel source URL, instead of synthesizing a Git URL from `--ref`. Preserve backward compatibility when reading existing state created by Git installs. Keep current runtime files and records untouched on reinstall.

The current `--ref` option is a developer escape hatch in the existing contract. During implementation, define a non-ambiguous compatibility path: retain explicit Git-ref installation only when explicitly requested, while default and `--version` use Releases. Do not permit a supplied version/ref to become an unvalidated URL or shell fragment. Preserve quoting and validate selector characters.

## Release workflow

A single GitHub Actions workflow runs on version-tag pushes (`v*`). It checks out that tag, validates the relationship between tag, `pyproject.toml`, and CLI/package metadata, builds from a clean source checkout, inspects wheel contents and metadata, generates the SHA256 file, and creates a published GitHub Release containing both assets. It uses `permissions: contents: write` and the repository's `GITHUB_TOKEN`; no long-lived publishing secret is needed. Repository tag protection is the authorization boundary. The workflow must not depend on a second workflow triggered by its own Release event.

A failed validation must not publish a usable Release. Build and validation complete before the publish step. The Release is stable by default; prerelease classification follows the tag/version syntax and must be explicit. The default installer remains stable-only, while explicit selection may resolve prereleases.

## Compatibility and documentation

Keep macOS/Linux support, uv bootstrap and consent behavior, isolated tool installation, and current initialization flow. Preserve existing runtime configuration and records through reinstall and default uninstall. Update README.md and README.zh-CN.md in matching structure, plus installation/CLI docs, with latest install, `--version`, prerelease selection, SHA256 behavior, missing-release errors, and rollback by installing a previous version.

Keep PyPI, Homebrew, containers, Windows, private-release authentication, and first-release creation outside scope.

## Failure and rollback

- No latest stable release: print an actionable error and exit nonzero; never fall back to `main`.
- Explicit version not found, missing asset, checksum missing, malformed checksum, or mismatch: print a specific error and exit nonzero before tool installation.
- Failed build/tag/version/content checks: workflow ends before publication.
- To roll back an installed client, rerun the installer with `--version` set to a previously published version. Runtime data stays in place.

## Test approach

Stub network commands and `uv` to test latest and explicit release resolution, prerelease explicit selection, missing release/assets, checksum match/mismatch, malformed metadata, dry-run, and no mutation before verification. Test install-state serialization for wheel provenance and backward reading of existing Git-based state. Workflow checks validate version matching and packaged wheel contents. Run shell syntax checks, focused pytest, full pytest, Pyright, and `uv build`; inspect wheel metadata and contents. A real GitHub publication/install smoke test is deferred until an approved first release exists.
