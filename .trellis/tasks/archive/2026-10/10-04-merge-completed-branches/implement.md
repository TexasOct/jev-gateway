# Execution plan

The user approved execution with `开始`, requested deletion of merged branches, then added the provider-icon branch and squash delivery. No product or scope decision remains open.

## Preparation

- [x] Audit refs, worktree occupancy, branch completion records, and ancestry.
- [x] Snapshot refs, bundle, index bytes, staged entries, and all existing changed files using native tools.
- [x] Create a clean isolated worktree attached to `main`.
- [x] Write PRD, design, plan, and context manifests before task activation.
- [x] Validate task manifests and activate the task.
- [x] Abort the uncommitted original merge after the user's scope change and move the isolated worktree to `integration/completed-squash`.

## Merge

- [x] Merge the recorded release-acceptance tip with `--no-commit --no-ff`; resolve and review any conflicts.
- [x] Preserve `main` fixes and whole task/journal records; commit the resolved merge normally on the disposable integration branch (`48062bb`).
- [x] Merge and commit the recorded credential tip under the same rules (`79717f0`, disposable integration branch).
- [x] Merge and commit the recorded select-layout tip under the same rules (`99a18f7`, disposable integration branch).
- [x] Merge and commit the recorded provider-icon tip under the same rules (`d4495d6`, disposable integration branch).
- [x] Review the complete combined source and apply only necessary integration repairs; bounded independent repair review returns PASS for all nine changed files.

## Checks

Run from the isolated worktree, retaining full logs and reporting compact results:

```sh
uv sync --all-groups
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run test
scripts/build-frontend.sh
uv run pytest -q
uvx pyright
npm --prefix frontend run test:browser
scripts/build-frontend.sh --check
uv lock --check
uv build
python3 scripts/validate-release.py v0.1.1 dist
```

- [x] Inspect installed-wheel smoke arguments and run with the built wheel and a throwaway home; 169 PASS checks, zero FAIL lines, isolated operator state.
- [x] Preserve the initial complete browser failure evidence: 238 passed, one stale accessible-label locator failed, two integration cases skipped.
- [x] Correct the credential-field locator and rerun the full browser suite with isolated live HTTP and fresh installed-wheel gateways; 240 passed, one ambiguous navigation locator failed, zero skipped.
- [x] Apply navigation-landmark scope to both installed-default Provider clicks, preserving every assertion; active LSP checks are clean.
- [x] Independently review combined behavior, task-manifest paths, version preservation, and journals; REWORK identifies legacy gateway whitespace normalization and the repaired icon locator.
- [x] Repair legacy gateway normalization without changing literal JSON credentials; 52 new regressions and CLI candidate provenance verified, complete patch inspected.
- [x] Repeat complete backend/package checks: 1189 tests, full Pyright, freshness, lock, build and release validator pass; retain fresh final artifacts separately.
- [x] Complete final installed-wheel acceptance: 169 PASS, zero FAIL, source/wheel/installed parity across 94 product files, version `0.1.1`, no owned processes remaining.
- [x] Preserve latest complete browser evidence: 241 executed, 240 passed, one wide-canvas center hit failed, zero skipped; both credential integration cases and all 27 icon cases passed, fixtures cleaned.
- [x] Diagnose the 2560px hit failure: three reproductions show a 98.71875px origin shift between browser calls, while the current center hits Questions. Add synchronous bounds/hit sampling and origin-shift/overlay regressions; preserve all original assertions.
- [x] Repeat frontend lint, application/browser TypeScript, 311 unit tests and active LSP checks after the test-only sampling repair; zero errors, four unchanged Fast Refresh warnings.
- [x] Independently review all four sampling/spec changes; PASS, exact hit/drag/write assertions preserved, actual overlay rejection retained.
- [x] Complete focused browser acceptance: 32/32 instances passed, zero failures/skips/automatic retries; preserve all successful and failed preparation evidence.
- [x] Complete full browser acceptance: 243/243 passed once, zero failures/skips/retries; both real credential cases, 27 icons, all original 241 per-file counts, package/static parity and owned-process cleanup pass.
- [x] Independently verify the credential repair and both browser locator corrections; code review returns PASS with no required rework. Final full acceptance remains separately required.
- [x] Confirm all four candidate tips are ancestors of the temporary integration result (`d4495d6`); recorded refs remain unchanged.

## Finish

- [x] Capture legacy-only gateway normalization/provenance and synchronous browser geometry/hit sampling in the existing spec owners.
- [x] Finish integration repairs and archive this task with its journal entry in the isolated worktree.
- [x] Rewrite only this task's JSONL research references to its verified archive destination; the native archive helper moves files without rewriting those references. Revalidate native manifests and all documentation targets afterward.
- [x] Create one final squash commit on baseline `main` with normal signing and hooks; verify its tree against the validated integration result and its single parent against the original main tip.
- [x] Switch the original worktree to `main`, restoring protected changed files and staged edits from the native snapshot when required.
- [x] Freeze task-document writes before the switch, synchronize authorized document staging and capture the full index. Audit final-tree collisions, all protected hashes/modes/missing states, unchanged source refs, exact 141+15 stage-0 paths and the other four empty staged diffs. Stop and recapture on any new path/content/index change.
- [x] Stop original-worktree switching after detecting a later index-only change; retain its 156 staged paths/index/9 MB patch separately and confirm all 231 protected files still match.
- [x] Independently review latest-stage preservation; update PRD, design and recovery checks to compare protected blob/mode/stage entries rather than requiring an empty original staged diff.
- [x] Rehearse one native NUL-delimited overlay in an independent target-tree index; all 141 protected entries and every nonprotected target entry match, live index unchanged, 231 file/mode checks pass.
- [x] Stop recovery after a subsequent preflight detects two later protected working-file/staged-blob revisions. Save complete latest files/index/patches separately; 229 other protected paths remain unchanged, 141+15 staging and all original HEADs remain unchanged. Preserve initial versions too; writer unknown.
- [x] Independently verify the latest-input capture and recovery guards: PASS for 231 copies/modes, latest two blobs, unchanged other inputs/refs and selective index recovery; final execution gates remain required.
- [x] Verify the owned stash's original-HEAD parent and captured index tree, and require a clean original worktree before switching. Create a named recovery ref and verified retained bundle containing the stash before source deletion or stash drop.
- [x] Restore only the latest verified protected file bytes/modes and apply only the latest 141 protected entries in one NUL-delimited native index batch. Prove all nonprotected entries match main and all task-owned active documents are represented by their completed archive. Retain initial versions separately; never replace the complete target index.
- [x] Before deleting each original local feature branch, compare its current tip to the recorded tip and prove content integration plus bundle recoverability.
- [x] Detach occupied worktrees at their unchanged commits, verify protected hashes and staged edits, then delete integrated local refs. Squash tips may require `git branch -D` after the recorded content proof.
- [x] Delete the disposable integration branch after final-tree verification.
- [x] Clear only this task's original runtime pointer after verifying its archived copy; preserve unrelated session pointers and all pre-existing worktree directories.

The final native sequence amends only completion metadata, rechecks the sole baseline parent and all 13 accepted source fingerprints, reconciles the target index with the unchanged captured 141 protected entries, and removes only the task-owned integration worktree. `.trellis/.runtime/completed-main-merge/final-delivery-proof.json` records these checks after the amendment and directory removal, including all 231 protected paths and the final branch/worktree inventory. Initial copies, later captures, recovery refs, bundles and acceptance evidence remain retained.
