# Source and candidate package review

The final local source and candidate package gates passed for version 0.1.1. No scoped code fixes were necessary. This review covers local source and candidate artifacts only. Publication, remote CI, public downloads, public installer acceptance, and the operator's default installation remain outside this review.

Reviewed release diffs: `pyproject.toml`, `jev_gateway/__init__.py`, `uv.lock`, and `.trellis/spec/backend/quality-guidelines.md`. All three version owners agree on 0.1.1. The lockfile diff changes only the root package version; every other resolved package record matches HEAD. The spec correctly documents version agreement and dependency preservation. Reviewed the release validator, release workflow, releasing documentation, and CLI lifecycle contracts against the task requirements. No behavioral release-code change needs additional regression tests.

Verification results are recorded in `verification/source-gates.json`:

- Frontend lint exited 0. Reused the completed native result from `.git/jev-release-011-acceptance/local/frontend-first.json`.
- Frontend unit tests exited 0 with 233 tests passed. Reused the completed result because tracked frontend source has no diff against HEAD.
- The normal frontend browser command built the dashboard and compiled browser TypeScript, then passed all 118 tests with retries explicitly set to 0. Durable browser output is under `.git/jev-release-011-acceptance/local/browser-results`.
- `scripts/build-frontend.sh --check` exited 0.
- Full `uv run pytest -q` exited 0 with 767 tests passed.
- `uvx pyright` exited 0 with 0 errors, 0 warnings, and 0 informations.
- `uv lock --check` exited 0.
- Shell syntax checks exited 0 for the release installer, local installer, Brew installer, local uninstaller, and frontend build script. Release validation also checked the generated stamped installer's shell syntax.
- `uv build` produced a fresh wheel and sdist under `.git/jev-release-011-acceptance/candidate-dist` and exited 0.
- `python3 scripts/validate-release.py v0.1.1 <candidate-dist>` exited 0. It checked metadata, entry points, templates, license, dashboard references, exact package contents and bytes, installer stamping, and checksum sidecars.
- Candidate installed-wheel smoke exited 0. Its actual `candidate-smoke/evidence/checks.json` reports `success: true`, version 0.1.1, the matching wheel digest, and 59 completed checks. These cover isolated managed Python, paths containing spaces, installed entry points outside the checkout, dashboard assets, local authenticated APIs, SQLite integrity/schema, repeat installation, lifecycle, and uninstall preservation.

Wheel and sdist metadata report version 0.1.1. The wheel requires Python >=3.12 and declares AGPL-3.0-or-later. Independent byte comparison confirms wheel and sdist parity for all 52 package files, including four static files. `verification/candidate-package.json` records package counts, metadata and artifact SHA256 values. The candidate wheel SHA256 is `a27530dddc54bbd4b18b55f8a1adf44654837d9d752b87c10b548aa4dfd0e4cb`.

`verification/source-file-hashes.json` records SHA256 values for 190 tracked source/release files and generated static files. Every recorded file retained its digest through the final checks. Operations that write the ignored static bundle ran sequentially. Native logs remain private under `.git/jev-release-011-acceptance/local`; no failed or incomplete invocation contributes to these pass results.

Vite reported its existing advisory about minified chunks larger than 500 kB. It did not fail the build or browser suite. No other substantive warning or finding remains in this scoped review. Local macOS candidate smoke does not establish Ubuntu CI acceptance or public asset identity.

This check changed only its owned task evidence files. It did not edit the version agent's files, the other tester's tooling/configuration, or the two existing dirty journals. No commits, pushes, tag/release changes, default installation actions, operator signals, or real upstream generation calls were performed.
