# Generic model metadata source acceptance

AC1–AC6 pass for source delivery. Generic Models.dev provider rows and LiteLLM
fallback rows now automatically supply available prices and explicit parameters
by selected source brand/provider, exact upstream model ID and compatible
transport, independently of serving host, path and port.

Manual fields, provenance, independent conflicts, conditional pricing and
unknown/null versus false/zero/empty-list distinctions retain their existing
behavior. Canonical inheritance supplies only absent nonprice facts. Native
OpenRouter source selection retains its endpoint boundary. A `structured_output`
declaration alone leaves `json_mode` unknown.

## Validation

| Check | Result | Retained receipt |
| --- | --- | --- |
| Original custom-host regression | Failed before the repair | `verification/native-evidence/original-regression.receipt.json` |
| Focused backend metadata/API | 434 passed | `verification/native-evidence/focused-final.receipt.json` |
| Metadata regression set including privacy/failure checks | 451 passed | `verification/native-evidence/metadata-final.receipt.json` |
| Required full backend suite | 3310 passed, 2 skipped | `verification/native-evidence/backend-final.receipt.json` |
| Pyright | Exit 0 | `verification/native-evidence/pyright-completion.receipt.json` |
| Frontend unit tests | 422 passed | `verification/native-evidence/frontend-unit-final.receipt.json` |
| Frontend lint/build | Exit 0; lint has 4 existing warnings | `verification/native-evidence/frontend-lint-final.receipt.json`, `frontend-build-final.receipt.json` |
| Browser test TypeScript | Exit 0 | `verification/native-evidence/browser-type-final.receipt.json` |
| Focused real-browser regressions | 3 passed | `verification/native-evidence/browser-final.receipt.json` |
| Initial independent review | REWORK: obsolete documentation wording | `verification/review-rework.md` |
| Targeted documentation recheck | PASS; no remaining AC1–AC6 blocker | `verification/review-pass.md` |
| Main transfer integrity | 13 files match accepted candidate; diff check exit 0 | `verification/transfer.json` |

These test receipts belong to the isolated implementation worktree at baseline
`de81708688854b9766504ff851b12df142221093`. After transfer, the parent verified
all 13 candidate hashes and ran `git diff --check` in the main checkout. The full
suites were not repeated against the combined, independently changing main
working tree.

The final review binds the 12 implementation files in
`verification/native-evidence/source-hashes.json` and the documentation repair
in `docs/admin-experience.md`, SHA-256
`2baa41c24f3eb820d587d6dd13cb101d4a965faddfeb1b599cd0b0c9c91bc558`.
The transfer receipt records all 13 candidate hashes.

## Preservation and recovery

The implementation report was interrupted by `Upstream HTTP/2 stream failed`
after completed gates. The retained native implementation child settled its
report without repeating those completed checks. The original regression,
initial check logs, REWORK report and later successful receipts are retained
separately under `verification/`. See `research/stream-recovery.md` for the
original orchestration failure and recovery references.

The first parent transfer preflight stopped before copying any files because
11 unrelated inputs had advanced since the initial admission snapshot. The
parent preserved their current bytes, verified that none overlapped the 13
task-owned files, and made a fresh recovery copy before transfer. All 20 current
unrelated modified files, the raw Git index, staged patch and HEAD remained
unchanged by the transfer. Both the initial and transfer recovery bundles remain
available; the transfer receipt records the later bundle's provenance.

## State at the original source handoff

The accepted source is present in
`/Users/texas/Workspace/jev-gateway`. The isolated branch and worktree remain
available for comparison. PRD acceptance boxes are checked; the task remains
`in_progress` pending the scoped commit step required by the project workflow.

The operator's installed `jev-gateway 0.1.6` and running daemon remain unchanged.
No credentials, operator configuration, local installation, daemon restart,
version bump, release, Git staging/commit/push or task archive was performed.

## Release delivery

The release task subsequently committed these 13 accepted files in signed
commit `da122333df853f21cdeeff4430cc501a11bd2d60`. Combined source review
returned PASS, including all 787 collected browser identities and both
isolated credential fixture modes. The earlier metadata receipts above
remain evidence of their original scopes; overlapping checks are not summed.

[Stable 0.1.7](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.7)
targets signed product commit `87d27245f00072913bf78a67b831f83f4efe4589`.
The formal build, Ubuntu/macOS checks of the same wheel, four public assets,
and ordinary downloaded public installer have independent publication PASS.
Each hosted OS smoke and the separate public installer smoke passed 169 checks.

The operator package remains `0.1.6`. Publication did not upgrade it or restart
the existing daemon. The release owner handles archive and journal commits
separately from the tagged product source. The context manifests now load the
existing tracked `design.md`; original ignored research and native evidence
remain in private preservation records.
