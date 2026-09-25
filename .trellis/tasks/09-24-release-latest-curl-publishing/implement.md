# Implementation plan

## 1. Confirm contracts and current code

- Read `.trellis/spec/backend/cli-lifecycle.md` and quality guidelines.
- Inspect `scripts/install.sh`, install-state code and tests, version reporting, packaging metadata, README/installation docs, and the existing curl/CLI task artifacts.
- Settle edge details before implementation: accepted version spelling (`X.Y.Z` and optional `v`), dry-run network behavior, asset naming, prerelease marking, and `--ref` compatibility.

## 2. Make package version authoritative

- Replace hard-coded CLI version reporting with installed package metadata.
- Add focused tests and ensure local editable/source execution has a clear version fallback if metadata is unavailable.
- Confirm built wheel version and tag convention agree.

## 3. Update installer release resolution

- Extend `scripts/install.sh` to accept `--version X.Y.Z`, leaving no argument as latest stable.
- Resolve release metadata for latest stable or exact explicit version; permit explicitly selected prereleases.
- Download the wheel and checksum from the same Release, validate metadata and SHA256, then install the local wheel with uv.
- Fail clearly on missing releases/assets/checksum, malformed inputs, download errors, and digest mismatches. Never silently fall back to `main`.
- Retain existing platform checks, uv bootstrap safeguards, relevant flags, quoting, and explicit Git `--ref` compatibility if appropriate.
- Preserve deterministic non-mutating dry-run behavior and update its tests.

## 4. Correct install provenance

- Extend `jev install init` and install-state serialization to record wheel version and source URL accurately.
- Preserve reading old Git-based state and preserve runtime data on reinstall.
- Add tests for new and legacy state, templates, and preservation.

## 5. Add release publishing workflow

- Add a tag-triggered GitHub Actions workflow for `v*` tags.
- Use a clean checkout, validate tag/version consistency, build the wheel, inspect expected entry points/templates/static assets/license, generate the SHA256 sidecar, and publish both files in one release job.
- Declare only `contents: write`; use `GITHUB_TOKEN`. Ensure failed checks prevent publication and the workflow does not rely on follow-on release events.
- Document tag protection and maintainer release procedure without creating the first public release.

## 6. Update public documentation

- Update README.md and README.zh-CN.md in lockstep, plus `docs/local-install.md` and `docs/cli.md`.
- Document latest stable default, `--version`, explicit prerelease selection, checksum verification, no-release failure, rollback with a prior version, and release creation/tag requirements.
- Remove claims that no release mechanism or release URL exists where no longer accurate; keep first-release availability explicit.

## 7. Verify and review

- Add offline tests with stubbed GitHub metadata/download and uv behavior.
- Run shell syntax validation, focused installer/state tests, full `uv run pytest -q`, `uvx pyright`, and `uv build`.
- Inspect wheel metadata and expected files. Verify README language structure stays synchronized.
- Run a dry-run/test installation against local fixture artifacts; do not publish a real release or push tags.
- Review the complete diff for unrelated edits; this checkout already has substantial pre-existing dirty state, which must remain untouched.

## Risk and rollback points

- Installer changes can prevent upgrades or install an unintended artifact. Keep validation before `uv tool install`, test bad/missing checksum cases, and never downgrade/fallback silently.
- Preserve the previous installer behavior behind an explicit Git ref only if compatibility is required; do not make mutable `main` the fallback.
- Workflow changes remain inert until a maintainer pushes a version tag. First public release creation and remote tag pushes are outside this implementation.
