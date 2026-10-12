# Implementation and release plan

1. Preserve main HEAD/index and establish an isolated `release/0.1.8` worktree with existing dependencies, ignored Trellis scripts, and project agent profiles. Do not sync the shared Python environment or rewrite frontend locks.
2. Prepare the three version records and prove third-party lock records unchanged.
3. Sole writer reads curated specs and the catalog/overlay/API paths, adds meaningful failing regressions, saves the original failure, applies the minimal parser fix, and records focused validation and the spec invariant.
4. Fresh read-only checker inspects all seven product/spec/version paths and test evidence. Run full backend tests, Pyright, frontend lint/tests/types, frontend build/freshness, wheel build and release validation. Run the existing isolated macOS installed-wheel smoke. Record actual exits and source hashes; do not sum overlapping test scopes.
5. Parent accepts only the actual independent PASS and matching source inventory, integrates the accepted paths, and creates signed fix and release-version commits. Verify the annotated tag and push main/tag atomically after confirming remote baseline and tag/Release absence.
6. Verify hosted build and Ubuntu/macOS smoke jobs for the exact tag commit. Download hosted assets and smoke evidence; both OS smokes must bind to the same wheel.
7. Download all four pinned public assets; verify digests, sidecars, version, and installer identity. Run ordinary isolated public-installer smoke using the documented private PATH tuple adaptation if needed, preserving assertions and the no-Node guard.
8. Write acceptance, archive with `--no-commit`, validate archived contexts, create signed archive and journal commits, and push bookkeeping without moving the tag. Verify clean tracked state and matching remote main.

Stop for unexpected source overlap, unresolved product decisions, failed ownership checks, existing target release/tag, or source/package mismatches. Preserve failures and repair only the demonstrated scope. Native workflow completion and independent PASS are separate requirements.
