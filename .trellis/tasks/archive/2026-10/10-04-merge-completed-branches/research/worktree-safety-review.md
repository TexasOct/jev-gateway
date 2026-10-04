# Worktree preservation review

The independent read-only reviewer returned `REWORK` for the recovery checklist, while confirming that the planned sequence is viable. It verified the native bundle, 141 original-worktree changed paths, 90 verification-worktree changed paths, empty original staged diffs, and the four recorded source refs. It did not inspect or authorize application integration.

## Required execution checks

1. Compare protected paths with the final target tree before switching, including file/directory parent collisions. If an originally untracked file becomes tracked on main, restore its original bytes while keeping the target main index.
2. Restore only the paths listed in the native snapshot. Ordinary checkout updates other clean source files. Preserve an originally missing path as missing; recreate a saved file even when the target tree deletes it. Check file modes and symlink targets as well as hashes.
3. Keep the original worktree and its index under this task's exclusive operation during stash, switch, and restoration. Recheck each original staged diff immediately beforehand. Stop and resnapshot if another writer introduces staged changes; never install the original full index after main advances.
4. Capture and verify the exact task-owned stash OID. Locate that OID before dropping it. Retain the stash if any restoration check fails.
5. Include this task's archive and journal in the final candidate. Compare its complete tree with final main and verify the single parent is `dbcc14faac40503fe26703f032483e338e90b1d2`.
6. Record source-specific inclusion and bundle recovery proofs before deleting a squashed branch with `-D`.
7. Remove the original planning directory only after verifying its archive on main. Clear only this task's session pointer, and retain unrelated task pointers and pre-existing worktree directories.

These checks are incorporated into the execution plan. They refine the recovery mechanism within the user's approved merge and cleanup scope.

## Later index change and revised staging contract

A second read-only review returned `REWORK` for the written acceptance contract and missing execution gates, while confirming that selective recovery can proceed within the existing authorization. It found no unavoidable decision to return to the user. Its complete verdict is retained as `latest-staging-preservation-review.md` in the original runtime directory.

The review independently confirmed unchanged main/original HEADs, exactly 141 protected plus 15 task-owned staged paths, stage 0 and mode `100644` for all protected entries, matching saved index entries/hashes, and matching bytes/modes for all 231 protected files and their copies. Its observed index state had no unstaged difference. The actor responsible for staging remains unknown. The candidate has no protected file/directory collision; the final squash tree must be checked again.

The PRD, design and execution plan now preserve the latest captured protected entries instead of requiring the original checkout to return to an empty staged diff. Comparison uses each blob, mode and stage, since adding files to main can reduce the relative staged diff count. Other worktrees keep their original empty staging constraint.

Execution gates:

1. Freeze task-document writes before capture. Synchronize any authorized task-document revisions, then recheck the complete index, the exact 141+15 path set, protected worktree bytes/modes and final-tree path collisions. Any extra path, changed protected content, non-stage-0 entry or concurrent mutation stops the operation and requires a new snapshot.
2. Record full stage entries and the index tree. Verify the owned stash's original-HEAD parent and index tree against that capture. Require the original worktree to reach its expected clean state before switching.
3. Give the stash a named recovery ref, include that ref and its reachable objects in the retained integration bundle, and verify the bundle before dropping the stash or deleting source refs. Keep stash, snapshots and remaining refs on any failure.
4. Restore the latest verified protected worktree bytes and modes against the target main index. Apply only the 141 latest protected stage entries through one native NUL-delimited `update-index` batch. Verify all protected index entries against capture and all other entries against main, plus all 231 worktree paths against their latest copies. Keep initial copies separately.
5. Omit the 15 active task paths only after verifying their latest content and authorized archive changes against the final completed task. Locate and verify the exact stash selector again before dropping it. Keep the original and later snapshots after cleanup.

The parent implemented a native preflight and tested the overlay against a separate index initialized from the candidate tree. One NUL-delimited `update-index` batch preserved all 141 protected entries, and every other index entry matched the target tree. The live original index was unchanged. All 231 protected file hashes/modes, original HEADs, exact 156 staged paths and four other empty staged diffs passed; no file/directory collision exists. Six authorized task documents had unstaged revisions at this check, so final capture still requires their synchronization and a document-write freeze. Evidence: `latest-preservation-preflight.json` and `preservation-guard.py` in the retained original runtime.

## Subsequent protected input revisions

The next preflight stopped on changed protected index entries. A full comparison found revised working bytes and staged blobs for only `frontend/src/features/providers/ProviderView.tsx` and `frontend/tests/browser/select-controls.spec.ts` in the original checkout. Their writer is unknown. The other 229 protected files, all original HEADs, 141+15 staged paths and four empty staged diffs remain unchanged. No unprotected index entry changed outside the task-owned documents.

`latest-protected-inputs-2` retains a complete consistent capture of 231 protected files, five full indexes, entries, binary patches and statuses. Its manifest records the initial hashes and latest hashes; initial copies were independently verified and left intact. The updated guard compares protected working files and protected index entries with this latest capture. This prevents recovery from replacing those later revisions with old bytes. Any further mutation still stops execution and requires another verified capture. The original guard remains retained as `preservation-guard.initial.py`.

The mesh discovery returned `Not in a session`; no peer identity or writer attribution is available. No mesh join or external message was sent. The latest inputs are preservation data only; the candidate remains based on the recorded committed branch tips.

Independent review returned PASS for this latest capture and recovery plan, with no new user decision required. It verified all 231 latest files/copies/modes, 229 unchanged initial versions, exact latest stage-0 blobs for the two later inputs, all five saved indexes, unchanged original/source refs and the retained initial 259-file snapshot. It also checked the isolated 141-entry overlay evidence and unchanged collision/freeze/full-index gates. Complete verdict: `latest-protected-inputs-review.md` in the original runtime. This accepts the plan and capture; final stash, switch, bundle and restoration checks still require execution.

## Executed recovery

The final capture froze all 15 task documents and verified 231 protected files, exactly 141 protected plus 15 owned stage-0 entries, four other empty staged diffs and no final-tree collisions. The owned stash's first parent matches original HEAD; its worktree and index trees both match captured tree `de5cfa6f6a3d73a9b47bd957395d4bdb98fb1b4d`. The original checkout became clean before switching. Its named recovery ref and a verified retained bundle preserve the stash and all source history.

After switching the original checkout to main, the parent restored only the latest protected files and overlaid the 141 captured entries in one NUL-delimited native batch. All 231 files/modes match the latest capture, every protected blob/mode/stage matches, every other index entry matches main, and the other four worktrees remain unstaged. The completed archive represents the 15 active task documents. Five paths remain staged against main; captured entries are unchanged even where main now contains identical files.

The parent checked source tips and complete-tree parity before deleting local source refs. Existing linked directories remain at unchanged detached tips. Native task finish removed only the matching session assignment with no active run; three other routing files stayed byte-identical. The owned stash was dropped by its reidentified exact OID after recovery passed. Initial and later copies, the named stash ref and verified bundle remain retained. Final metadata amendment, repeated index reconciliation and temporary-directory removal are documented in `final-delivery-proof.json` in the original runtime directory.
