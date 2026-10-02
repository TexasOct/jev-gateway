# Integrated checks after source and stream rework

The current source passed the full backend, type, frontend and browser checks.
These results cover the R1–R4 fixes, completed-stream evidence changes and the
parent's session-list source projection. Native browser, real upstream,
installed-wheel and publication acceptance remain separate gates.

| Check | Result | Evidence |
| --- | --- | --- |
| Packaged frontend build | Exit 0, 3.70 seconds | `post-rework-build/result.json` |
| Full pytest | 936 passed, exit 0; test time 45.92 seconds | `post-rework-full/backend.log` |
| Full Pyright | 0 errors, 0 warnings, 0 information, exit 0 | `post-rework-full/pyright.log` |
| Frontend lint | Exit 0, four existing Fast Refresh warnings | `post-rework-full/lint.log` |
| Frontend unit tests | 261 passed in 33 files, exit 0 | `post-rework-full/unit.log` |
| Browser TypeScript | Exit 0 | `post-rework-full/browser-types.log` |
| Full Playwright after locator correction | 116 passed, exit 0, command time 15.72 seconds | `browser-rework-2/result.json`, `browser-rework-2/browser.log` |
| Frontend freshness, lock, installer shell syntax, whitespace | All exit 0 | `post-rework-full/results.json` |
| New wheel build and release validator | Both exit 0 | `post-rework-artifact-gates/results.json` |
| Fresh macOS installed-wheel smoke | Exit 0, 119 PASS checks, 26 CLI commands, 109.80 seconds | `post-rework-installed-2/result.json`, `post-rework installed smoke 2/evidence/checks.json` |

All paths above are relative to the protected evidence root
`/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/`.
Tests use isolated synthetic configuration and upstream fixtures. No passing
result in this table certifies real generation or a public installation.

The first full browser run retained 112 passes and four failures. The new test
searched for an exact button name `Rule 1`/`规则 1`, but the actual accessible
name also includes that rule's conditions. The selector now identifies the rule
prefix, and the complete 116-case rerun passed. Its read-only path, priority
save/reload, unchanged tags and default-clear assertions were retained.

The parent's first focused session-list run had two constructor failures in new
memory-only tests and two corresponding Pyright findings. The fixtures now pass
the required gateway arguments and narrow optional snapshots. The subsequent
full backend and type gates above passed; failed logs remain in
`session-list-rework/`.

The first new installed-wheel attempt failed before application startup because
the parent carried `UV_OFFLINE=1` into an empty managed-Python installation.
The sanitized first command reported no managed Python 3.12 interpreter. Its
failure is preserved in `post-rework installed smoke/evidence/01-command.log`.
A separate fresh-directory installation with offline mode unset passed. It used
managed Python 3.12, verified the installed package against the wheel, and covered
empty startup, setup rejection/preservation, deferred provider save, confirmed
first-model import, all three strategies' global fallback, edits/reload and
running/stopped reinstall/uninstall preservation. Generation in this smoke stays
synthetic; real upstream acceptance remains a separate requirement.

The candidate wheel is
`post-rework-dist/jev_gateway-0.1.0-py3-none-any.whl`, SHA256
`74046d1c13b59f02c1af653980cd2cb36ff069a87e53ee3fb02daeb445d1a274`.
The validator checked package/source parity, dashboard references, Python
requirement, license, entry points and generated installer/checksum assets.

The old native harness service at PID 22983 and port 51675 was ownership-checked
through its gateway command and port, then stopped. This cleanup left the actual
operator service unchanged.
