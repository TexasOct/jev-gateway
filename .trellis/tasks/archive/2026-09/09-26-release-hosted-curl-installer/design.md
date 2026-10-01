# Release-hosted curl installer design

## Boundaries

Each GitHub Release publishes a self-contained `install.sh`, its SHA256 sidecar, the versioned wheel, and the wheel's SHA256 sidecar. The public latest URL is `/releases/latest/download/install.sh`; a pinned install can invoke `/releases/download/vX.Y.Z/install.sh`. Each script embeds its own release tag and is the complete installer for that tag. It installs that same tag's wheel after verifying its checksum.

If a user runs `--version` for a different version than the script's embedded tag, the script downloads that target release's `install.sh` and sidecar, validates the requested tag and fixed GitHub release origin, verifies the checksum, then executes the target script with the original supported options and exact tag. The target script recognizes that its embedded tag matches the requested one and proceeds to its wheel. It must not recursively delegate. This creates a single immutable tag handoff and avoids querying or resolving `latest` twice.

The release validation and tag-triggered workflow build frontend assets from tracked frontend source, create the Python wheel and standalone installer, validate artifacts and checksums, then publish all assets. Generated `jev_gateway/static/` output is ignored and not committed. A Release wheel must contain the newly built dashboard shell and hashed assets. Existing CLI initialization owns runtime templates and installation provenance; legacy Git install state remains readable.

## Trust, inputs, and failure behavior

The initial `curl | sh` executes the downloaded latest installer before any checksum check, so its initial bytes cannot authenticate themselves. Documentation must offer a safer manual flow that resolves a release tag, downloads the install script and checksum from that pinned tag, reviews/verifies the script, then executes it. A sidecar from the same Release detects transfer errors and inconsistency; it is not an independent signature against a compromised publisher.

Validate version syntax and construct URLs only from the fixed GitHub repository origin and approved asset names. Do not interpolate user or API text into shell code. Reject unstamped/malformed embedded tags, conflicting embedded/requested versions, missing release assets, malformed checksums, bad digests, download failures, or unavailable GitHub release data before invoking an unverified child installer or replacing the CLI. Never fall back to raw `main`.

Preserve supported macOS/Linux behavior, `--home`, `--no-init`, `--dry-run`, `--yes`, `--no-uv`, isolated uv tool installs, initialization behavior, provenance, and runtime data on reinstall. Keep `--ref` only as an explicit separate developer Git install; it cannot be combined with `--version` and must not appear in public one-line commands. Dry run performs no network access, installation, or mutation; a Release dry run still requires a valid embedded release tag. Default uninstall preserves runtime data.

## Frontend package generation

Keep `frontend/` source and lockfiles tracked, but remove generated `jev_gateway/static/` output from Git and ignore that directory. Release workflow order is: install frontend dependencies, run lint/tests and a clean build, run bundle freshness validation if applicable, build the Python wheel, validate exact wheel contents, create both checksum sidecars, then publish. Update dashboard and quality specs so they no longer require committed bundle output. Local source installations and tests that require dashboard assets must build the frontend first or use a deliberate fixture; do not silently rely on stale local generated files.

## Verification

Use network-free tests for embedded tag identity, latest and pinned URLs, cross-version delegation, checksum verification before child execution, matching target wheel version, explicit prerelease pins, missing/bad assets, no fallback, dry-run and flag forwarding. Test release validation for exact installer/wheel artifacts and checksums. From a clean checkout, build frontend output before wheel creation and verify the wheel contains a working dashboard shell and JS/CSS assets. Run focused and full pytest, Pyright, frontend lint/tests, shell syntax, `uv build`, release validation, and a throwaway-home install smoke test. Do not push tags, publish a Release, or write live runtime data.