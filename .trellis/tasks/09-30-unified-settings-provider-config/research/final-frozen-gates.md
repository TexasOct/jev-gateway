The frozen-source gate run stopped at gate 7 because `uv run pyright` could not find the `pyright` executable. Gates 1–6 passed. Gates 8–16 were not run, in accordance with the instruction to stop on the first failure. No product, test, operator, public, or authentication files were edited by this tester.

The protected evidence directory is `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/overlay-final-gates/`. Each attempted gate has a numbered `.log` and `.json` containing the exact argv, cwd, environment changes, UTC start/end, timeout, elapsed seconds, and exit code. `commands.jsonl` contains all seven completed command records; `final-outcomes.json` records the failure and unrun gates. The new `overlay-final-dist/` directory is empty.

| Gate | Command or check | Result | Elapsed seconds |
| --- | --- | --- | --- |
| 1 | `npm --prefix frontend run lint` | Exit 0; 0 errors, 4 warnings | 4.222 |
| 2 | `npm --prefix frontend test` | Exit 0; 33 files, 267 tests passed | 1.254 |
| 3 | `bash scripts/build-frontend.sh` | Exit 0; bundle built | 3.858 |
| 4 | `frontend/node_modules/.bin/tsc -p frontend/tests/tsconfig.json` | Exit 0 | 0.761 |
| 5 | In `frontend`: `./node_modules/.bin/playwright test -c playwright.config.ts` | Exit 0; 120 passed | 17.564 |
| 6 | `PYTHON_DOTENV_DISABLED=1 uv run pytest -q` | Exit 0; 970 passed | 52.229 |
| 7 | `uv run pyright` | Exit 2; executable unavailable | 0.042 |
| 8 | `bash scripts/build-frontend.sh --check` | Not run | |
| 9 | `uv lock --check` | Not run | |
| 10 | `sh -n scripts/install.sh` | Not run | |
| 11 | `git diff --check` | Not run | |
| 12 | `uv build --out-dir /Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/overlay-final-dist` | Not run | |
| 13 | `.venv/bin/python scripts/validate-release.py v0.1.0 /Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/overlay-final-dist` | Not run | |
| 14 | ZIP comparison of every wheel package file against frozen source; expected 54 files | Not run; no wheel exists | |
| 15 | Prepared `native-close-layout/run_suite.py --backend-ready` | Not run; no new suite or audit | |
| 16 | Fresh online managed Python 3.12 installed-wheel smoke with `UV_OFFLINE` unset | Not run; no installed 119-check proof | |

The exact gate 7 error, preserved in `07-pyright.log`, is:

```text
error: Failed to spawn: `pyright`
  Caused by: No such file or directory (os error 2)
```

Gate 7 ran from the repository root at `2026-10-02T15:06:23.348191+00:00` and finished at `2026-10-02T15:06:23.390517+00:00`. This is an environment failure before type checking began; there is no failing test assertion. No dependency installation, fallback command, source fix, or test weakening was attempted.

Content fingerprints at stop:

```text
source_tree_sha256=15fc95e3b4fc6bf2fdf1be496f99d5af7a47c6e0b284c540eea92526d07087ab
static_tree_sha256=e38770d6d1835f09d424295bbb2ba5775860410396f291948ad29496188ae78e
extended_tree_sha256=96a7d45b468589e32627e5f447ca7b76337b4ae2e38dd88429020e616c59ab22
```

The source manifest contains 174 files using the prepared native runner's source selection and fingerprint algorithm: backend Python/templates, frontend source/tests, and its listed build/dependency inputs. The static manifest contains 4 generated package files. The extended manifest contains 232 files, adding backend tests, scripts, LICENSE, Pyright/browser/build configuration, and frontend tsconfig inputs. Source and extended contents match the pre-gate snapshot. Source, static, and extended contents match the post-test snapshot at stop, with zero changed paths. These checks cover file bytes; generated output modification times may change during the required builds.

`freeze-before-gates.json`, `freeze-after-build.json`, `freeze-after-tests.json`, and `freeze-at-stop.json` preserve those manifests privately. The evidence directory has mode 0700 and its files have mode 0600. No credential or runtime configuration file hashes were printed.

Wheel SHA256 and wheel/source parity are unavailable because the build gate was not reached. The prepared native suite uses synthetic generation and cannot prove real upstream behavior; it did not run in this attempt. Ordinary reinstall with a populated overlay, real upstream acceptance, public release/installer acceptance, and actual local reset remain the parent's or other agents' scope. This run supplies no evidence for those flows.
