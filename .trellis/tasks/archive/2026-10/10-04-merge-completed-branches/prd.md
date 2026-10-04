# 合并已完工分支到 main 并清理已合并分支

## Goal

Bring completed work from four branches into local `main` as one squash commit, remove integrated local branches, and preserve every existing changed working file.

## Background

The user approved the three-branch merge proposal and requested deletion of branches already merged. The later instruction `追加feat/provider-icon-preset，所有内容全部采用squash` adds the existing `feat/provider-icon-presets` branch and changes delivery to squash. The initial `main` commit is `dbcc14faac40503fe26703f032483e338e90b1d2`.

All four outstanding branches have completed task records. The older release branch also contains finished initialization and global-default routing changes that are absent from `main`.

All five worktrees initially had empty staged diffs. A later native preflight found an index-only change in the original checkout: 141 protected paths and 15 task-owned documents were staged. Its actor is unknown. Both the initial index and the later full index/patch are retained. Recovery preserves the latest protected stage-0 entries; the completed archive represents the task-owned documents.

A subsequent preflight detected new working-file and staged-blob revisions for `frontend/src/features/providers/ProviderView.tsx` and `frontend/tests/browser/select-controls.spec.ts` in the original checkout. Their writer is unknown. A separate complete capture retains those latest inputs, with all 229 other protected files unchanged from the initial snapshot. Final recovery preserves the latest 231 protected working files and 141 protected index entries. Initial versions remain retained in the original recovery snapshot; these uncommitted revisions do not become integration sources.

## Requirements

- R1: Integrate `fix/v0.1.0-macos-release` at `75b70c831da6b94d011dfa9bfca6435833f91de1`, `feat/write-only-credential-config` at `4acfba2c2b8a24baa412a4257e76a5c0cbd4d025`, `fix/select-spacing-alignment` at `e7ace7c8d4aac41a7de41469a0b80c8d54dd6189`, and `feat/provider-icon-presets` at `afdfa49a466ed5d507d5eee2ef462328e4482972` into local `main` as a single new commit.
- R2: Retain the later `main` fixes and version `0.1.1` while integrating initialization, global-default routing, write-only credential configuration, select-control layout, and provider-icon/preset behavior.
- R3: Deliver a normal single-parent squash commit on `main`, with no feature merge commits in its new history. Keep a source-tip-to-final-tree audit because squash does not preserve feature-tip ancestry.
- R4: Preserve the latest captured bytes, types, modes and missing state of every protected changed tracked file and untracked file in all worktrees, including later revisions detected during acceptance. Retain initial copies separately. Preserve the latest captured protected staging entries in the original checkout and the initially empty staged state of the other four worktrees. A worktree attached to a deleted branch may be detached at its unchanged commit.
- R5: Delete integrated local branches other than `main` only after proving their complete approved content is present in the validated squash tree and their original tips remain recoverable from the snapshot bundle. Switch the original worktree to `main` while retaining its existing changed files.
- R6: Preserve complete task acceptance records and journal sections through merges and archive this integration task after verification.

## Acceptance Criteria

- [x] AC1 / R1: The temporary integration history contains all four recorded tips, and final `main` has the same approved source tree.
- [x] AC2 / R2: Backend tests, Pyright, frontend lint/unit/browser checks, frontend freshness, wheel build, and local installed-wheel smoke checks pass on the merged source.
- [x] AC3 / R2: Package version stays `0.1.1`; initialization, global-default routing, credential privacy, select-layout, and provider-icon/preset tests are present and pass.
- [x] AC4 / R3: Final `main` has exactly one new single-parent commit above the recorded baseline, and feature histories are not copied into its parent chain.
- [x] AC5 / R4: All 231 protected paths match the latest verified native capture's bytes, types, modes and missing state after cleanup; 229 remain identical to the initial snapshot and two retain their later revisions. Each original-checkout protected index entry matches the latest captured blob, mode and stage; every nonprotected entry matches final `main`. The staged diff count may shrink when formerly added files become unchanged tracked files. The other four worktrees retain empty staged diffs. Keep initial copies and every later recovery snapshot.
- [x] AC6 / R5: Every deleted local branch tip is recoverable from the snapshot bundle and has content-integration evidence; `main` is the sole remaining original local branch and the original worktree is on it.
- [x] AC7 / R6: Task manifests point to existing spec/research files, journals retain their complete source sections, and the integration task is archived with verification evidence.

The initial signed squash `ee040984b83582ca51033e950ba8d652d4abab97` has the baseline as its sole parent and exactly matches validated integration tree `2e3405bceb2c6a6d3ed353758eb50397369bd012`. Native recovery verified all 231 latest files and 141 protected index entries, with every other index entry matching main. Five paths remain staged against main; the other formerly added paths are now unchanged tracked files. All source branches were deleted after bundle and content proofs. Completion records are folded into the same squash through a metadata-only amendment; the final OID and repeated preservation checks are recorded in `.trellis/.runtime/completed-main-merge/final-delivery-proof.json`.

## Out of Scope

- Adding uncommitted work to the squash merely because it exists in a linked worktree; integrate the four approved committed tips.
- Publishing a release, changing the installed operator service, or pushing/deleting remote refs.
- Completing unrelated planning or in-progress tasks.
