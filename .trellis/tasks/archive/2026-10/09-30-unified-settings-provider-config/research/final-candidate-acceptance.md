# Final candidate acceptance

The final candidate passes the source, native browser and macOS installed-wheel
checks listed below. Real installed business acceptance, publication, public
downloads and the actual local reset have separate evidence and remain required.

| Check | Authoritative result |
| --- | --- |
| Backend suite | 970 passed |
| Frontend unit suite | 267 passed across 33 files |
| Browser suite | 120 passed |
| Frontend lint | Exit 0; four existing warnings |
| Browser TypeScript | Exit 0 |
| Pyright | 0 errors, 0 warnings, 0 informations |
| Static freshness, lock, installer syntax, diff whitespace | Exit 0 |
| Fresh build and exact v0.1.0 validator | Exit 0 |
| Wheel/source comparison | All 54 package files match |
| Native six-flow suite and privacy/ownership audit | Exit 0; 344 checks |
| macOS installed smoke | Exit 0; 119 checks, success true, version 0.1.0 |

The first frozen gate attempt stopped before type checking because
`uv run pyright` could not locate an executable. Its log remains under
`overlay-final-gates/07-pyright.log`. The established cached-tool command
`uvx --offline pyright` succeeded in the continuation. No product change or
test weakening was needed for that command failure.

The rebuilt wheel is
`overlay-final-dist/jev_gateway-0.1.0-py3-none-any.whl`, SHA256
`57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914`.
Its package-manifest digest is
`1117650fdc38c3f77776b7703f891e8e42347a6f822861b2aaee362928256bb9`.
The continuation completed at `2026-10-02T15:33:57.724686+00:00`.

Native audit `audit-20261002T153153.009228Z.json` records baseline 75,
16-character boundary 2, 8192-character boundary 2, source/retained routing 123,
layout 52 and implicit-choice 90 passing checks. All six flows retain unchanged
source/static fingerprints. Credential leak and permission error counts are
zero. The suite index is
`suite-20261002T153152.354486Z.json`; its final audit is the authority for PASS.
Earlier failed native suites remain preserved.

Native requests use a synthetic upstream through real browser Fetch, TCP,
Uvicorn, ASGI, configuration transactions and SQLite. Installed smoke also uses
synthetic generation. These checks prove application behavior in their stated
scope; they do not establish real upstream output, populated ordinary-reinstall
retention, public artifact identity or operator-reset acceptance.

Evidence root:
`/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/`.
The source logs are in `overlay-final-gates/`; corrected type/build/native and
installed logs, command codes/times and artifact identity are in
`overlay-final-continuation-gates/`. Installed checks are in
`overlay final installed smoke/evidence/checks.json`.
