# Repaired v0.1.1 source verification

All assigned final backend and package checks passed. Full pytest passed 767 tests, Pyright reported 0 errors and 0 warnings, and the repaired wheel and sdist each match all 52 final source package files. This verifies the local repaired candidate; installed and public release acceptance remain with the parent task.

The structured results, full source hashes, package hashes, artifact hashes and retained failed attempts are in [verification/repaired-source-gates.json](verification/repaired-source-gates.json). Native command logs and exit records remain private under `.git/jev-release-011-acceptance/repaired-source-native/`.

| Final command | Native exit | Result |
| --- | ---: | --- |
| `uv run pytest -q` | 0 | 767 passed in 54.02s; task runner duration 60.269s. |
| `uvx pyright` | 0 | 0 errors, 0 warnings, 0 informations; Pyright 1.1.414. |
| `uv lock --check` | 0 | Lockfile is current. |
| `sh -n scripts/install.sh` | 0 | Source installer syntax. |
| `sh -n scripts/install-local.sh` | 0 | Local installer syntax. |
| `sh -n scripts/install-with-brew.sh` | 0 | Brew installer syntax. |
| `sh -n scripts/uninstall-local.sh` | 0 | Uninstaller syntax. |
| `sh -n scripts/build-frontend.sh` | 0 | Frontend shell syntax. |
| Private version/dependency audit | 0 | Three version owners are 0.1.1; 65 dependency entries are unchanged. |
| `uv build --out-dir .git/jev-release-011-acceptance/repaired-candidate-dist` | 0 | Fresh wheel and sdist. |
| `python3 scripts/validate-release.py v0.1.1 .git/jev-release-011-acceptance/repaired-candidate-dist` | 0 | Release validation, installer stamping and checksum sidecars. |
| Private package audit | 0 | Exact wheel/sdist source parity; metadata, entrypoints, license, templates and static references. |
| `sh -n .git/jev-release-011-acceptance/repaired-candidate-dist/install.sh` | 0 | Generated installer syntax. |
| Final scoped preservation audit | 0 | Publication evidence, journals, source and candidate artifact hashes preserved. |

The five source shell scripts and the generated installer all passed syntax checks. The private audit scripts and their native records are retained alongside the logs. Every worker Python command used `PYTHONDONTWRITEBYTECODE=1`.

The three version owners are `pyproject.toml`, `jev_gateway/__init__.py` and the root package entry in `uv.lock`. An exact parsed comparison with pre-bump commit `c29c304bea3f33fcc9e696db3d8104a75ab27d61` confirms that the root version is the only lockfile change and all 65 dependency entries remain unchanged. The current lockfile also matches the current HEAD byte for byte; declared dependencies and the frontend lockfile are unchanged.

Frontend lint, unit, build, TypeScript, browser and freshness results were reused from [verification/preview-fix-gates.json](verification/preview-fix-gates.json): 233 unit tests and 118 browser tests passed, with two workers and zero retries. All 120 source hashes in its private verification manifest still match. Full pytest invokes its existing session fixture to build the static bundle. Those writes completed before the package build, and all four static files match the pre-pytest verified bundle byte for byte.

| Repaired source | SHA256 |
| --- | --- |
| `frontend/src/app/AppShell.tsx` | `39bcd01fa616282ef61fbcf1f98db161c29179d1cab3b5533fb75dee10587576` |
| `frontend/src/features/routing/RoutingEditor.tsx` | `1b46d6bdac16f07edc04ca4461a024f938a3f546b934d2ea485702c33a1390d5` |
| `frontend/tests/browser/routing-editor.spec.ts` | `f006c816afb515b571bdfe4c4ecd190f3b647780aaa8471f101d6b6b80bb1ed7` |

The final source manifest contains 234 files and has SHA256 `c8b292b8523ea6b8d23d22341c12d24aba884a4a0e012647babe4a04f0f78244`. Every manifest entry stayed unchanged through verification. The JSON report includes each source hash and all 52 packaged-file hashes.

Package validation covers 46 Python files, four static files and two templates. Wheel and sdist metadata both identify `jev-gateway` 0.1.1, require Python `>=3.12`, declare `AGPL-3.0-or-later`, and contain the six expected dependency requirements. Both archives contain the exact source license. All 58 wheel RECORD entries have valid file sets, sizes and SHA256 digests.

Both archives expose `jev = jev_gateway.cli.main:main` and `jev-gateway = jev_gateway.gateway:run_gateway`; their target functions are present. The CLI reads the installed distribution version. Entrypoint validation used metadata and AST inspection; this worker did not install or launch the candidate.

Both packaged templates are present, nonempty and identical to source; the models template parses as JSON. The dashboard shell resolves its JS and CSS references to nonempty packaged assets: `/dashboard/assets/index-DiAhKErC.js` and `/dashboard/assets/index-DUdxukOW.css`.

The fresh output directory is `.git/jev-release-011-acceptance/repaired-candidate-dist/`. The validator generated the exact source installer with its single release assignment stamped to `RELEASE_TAG=v0.1.1`. Both sidecars have the expected filenames and digests. The four designated assets match the workflow upload list; the sdist remains a local artifact.

| Artifact | Release asset | SHA256 |
| --- | --- | --- |
| `install.sh` | Yes | `bbd06b07d7e8f5ead47540bc4d52c2dc24a524eb850911f12682d1ba28e56cd5` |
| `install.sh.sha256` | Yes | `b402cff962889260f41065ca4e861868a09b727a63f311f2d5afc2d232268855` |
| `jev_gateway-0.1.1-py3-none-any.whl` | Yes | `06abc0d9e50c3490635835a46c32d97e81aa0da527eb3b1b870ef95f475aae59` |
| `jev_gateway-0.1.1-py3-none-any.whl.sha256` | Yes | `325c44fa72235d12ffbfb252cd28e5170b8a8fc0b5ab33c19756b3d153f5019d` |
| `jev_gateway-0.1.1.tar.gz` | No | `1c2758f9d5946ca85335492ac2c7404ff828d170a0b0512aeb49f1a8dc6b4d02` |

The retained nonpassing attempts are documented so the final pass does not hide them:

- Initial snapshot setup exited 1 because the initial-publication source manifest named its old JS bundle. The private snapshot was corrected to capture final static filenames while preserving the original manifest.
- The first full pytest attempt hit the tool's 60-second limit while uv recreated `.venv` and downloaded dependencies. It has no native completion exit or test summary. The retained rerun completed with exit 0 and 767 passed.
- The first Pyright attempt exited 1 with 68 errors and two warnings while `.venv` was being recreated. Its diagnostics show unresolved dependencies. The same command passed after environment setup and full pytest finished; source files were unchanged.
- The first broad preservation guard exited 1 because `verification/tools/verify-public-assets.py` changed outside this worker during verification. The initial snapshot and failed guard remain private; the JSON report records both hashes. This helper is mutable task tooling, separate from original publication evidence.
- The next preservation guard exited 1 because it rejected eight cache files already present in the initial task-tool snapshot. The final check confirms all eight are unchanged and no new task-tool bytecode was created.

The original publication evidence and both dirty journals are unchanged. The initial snapshot contains 166 files: 165 remain identical, and the one observed difference is the mutable task helper described above. The 148 files outside task tooling all remain identical.

| Preserved journal | SHA256 |
| --- | --- |
| `.trellis/workspace/TexasOct/index.md` | `af00db6e65bd08a076a728f31742adfab8dd7453f449d2d7f459807557da567f` |
| `.trellis/workspace/TexasOct/journal-1.md` | `9c87f62b236d6e198ff88d9f6f7207eaf35593418fd5cde4ef6fb605552254a5` |

Native evidence and candidate directories have mode `0700`, and their files have mode `0600`. This worker made no product edits, commits, remote changes, operator installation or service changes, or real generation requests, and launched no recursive agents.

Local checks used Python 3.14.8, uv 0.7.16, Node.js 24.18.0 and npm 11.16.0. Pyright targets Python 3.12. Release CI uses Python 3.12 and Node.js 22, so its platform checks still need to run on the repaired release source. Installed-wheel smoke, public installation and installed browser acceptance were outside this worker's assignment.
