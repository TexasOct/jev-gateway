# Completed branch integration

## Boundary

Combine the four recorded branch contents and repair their integration conflicts. Use `integration/completed-squash` in `.trellis/.runtime/worktrees/completed-main`; keep local `main` at its baseline until the combined source is validated. Resolve behavior in its existing backend or frontend owner, with no feature expansion.

## Histories and order

1. `fix/v0.1.0-macos-release`: initialization, empty-tag/global-default routing, streaming evidence, and completed unified-settings records.
2. `feat/write-only-credential-config`: JSON-only credential writes and protected credential responses.
3. `fix/select-spacing-alignment`: native select spacing and responsive provider-form alignment.
4. `feat/provider-icon-presets`: selectable provider icons, mainstream supplier presets, and asset provenance.

The branches are not ancestors of one another. Integrating initialization first makes the credential merge resolve against its final configuration surface. The select and icon changes then land over that combined provider page.

Already merged branches are `feat/dashboard-key-page`, `feat/strategy-workflow-canvas-editing`, and `feat/provider-icon-presets-verified`. The verification branch has dirty files but no unique committed history; detach that worktree at its unchanged tip before deleting its local ref.

## Conflict contracts

- Keep `main`'s version and later lifecycle, preview-reset, dashboard-key, and canvas behavior.
- Combine the approved initialization/global-default behavior with the newer write-only credential boundary; credentials must stay absent from public configuration reads and errors.
- Adapt release-only setup code to `credentials.json` and the shared `ProviderConfiguration.gateway_credential()` writer. Preserve both `/v1/setup` and `/v1/gateway-credential` APIs with consistent local-bootstrap authorization, readiness, safe projections, and configured reference names. Initialize the managed credential template alongside the existing files, without overwriting operator data.
- Keep global-default request parsing, provider-qualified model IDs, runtime selection, overlay serialization, and monitoring evidence consistent.
- Preserve both parents' task records and whole journal sections. Review repeated journal headings even when Git reports an automatic merge.
- Resolve archived-task moves without resurrecting a completed task in the active task directory. Repair moved context paths while preserving reasons and historical command text.
- Build and test only the isolated merged source, using the provider-icon branch's committed tip rather than copying its dirty working files or generated assets.

## Squash delivery

Temporary integration commits are confined to the disposable integration branch. After all tests and review pass, squash its validated tree onto baseline `main` and create one ordinary single-parent commit containing the approved feature content, integration repairs, task archive, and journal entry. This follows the user's request for all content to use squash.

Source tips will not be ancestors of squash `main`. Deletion therefore requires recorded temporary-integration ancestry, exact final-tree equality, functional validation, and the native recovery bundle. Use `git branch -d` for naturally merged tips; use `git branch -D` only for proven integrated squash tips after detaching their unchanged worktrees. Remove the disposable integration branch too.

The archive and journal initially record source acceptance and the pending delivery operations. After recovery and local-ref cleanup are verified, amend their completion records into the same signed single-parent squash. Preserve the baseline parent and every accepted product/source fingerprint. Revalidate the amended metadata/tree and final collisions; reconcile the original index from the final main tree with the same captured protected entries, and leave protected working files intact. Both source delivery and any metadata amendment remain recoverable in retained refs/bundles. Main must still have exactly one new commit above the baseline.

## Safety and rollback

A native snapshot contains branch refs, a complete Git bundle, each worktree's index, staged entries, binary patches, and all changed-file hashes and copies. Its path is stored in `.trellis/.runtime/completed-main-merge/safety-path.txt`.

Use ordinary temporary commits and the final squash commit with configured signing and hooks. Abort an unresolved merge only in the isolated worktree if necessary. Keep branch refs until validation passes. Before deletion, verify each recorded tip and its integration proof again; detach linked worktrees at the same commit and preserve their files. Remote refs remain outside this local operation.

For the original worktree's final switch, retain a native snapshot and a task-owned stash if normal checkout requires it. Switch to validated `main`, restore every protected changed file from its latest verified snapshot, and verify hashes and staged edits. Clean tracked files may update to the new main source; dirty and untracked content must survive. Remove only the task-owned stash once those checks pass.

Before switching, check final target-file and parent-path collisions and every original worktree's staging state. A later index-only change staged the original checkout's 141 protected paths and 15 task-owned documents; its actor is unknown. A subsequent check detected revised working bytes and staged blobs for the protected Provider view and select test. Retain the initial versions and the full later capture under `latest-protected-inputs-2`; 229 other protected files remain unchanged. Freeze task-document writes before a new complete capture. Require exactly those 156 stage-0 paths, protected bytes matching the latest verified capture and no uncaptured index or file changes. Stop and recapture on any concurrent change.

Verify the task stash's original-HEAD parent and index tree against that capture, and require the original worktree to be clean after stashing. Create a named recovery ref for the stash and include it in a verified retained integration bundle before dropping the stash or deleting source refs.

Initialize recovery with the target main index. Restore saved worktree bytes, modes, symlink targets and missing states, then overlay only the 141 captured protected index entries in one native NUL-delimited `update-index` batch. Compare protected entries by blob, mode and stage; compare every other entry with final main. Do not restore the complete older-branch index. The 15 task-owned active paths are omitted only after confirming their current contents, archive transformations and final document revisions are represented in the completed archive. The staged diff count can shrink against the new HEAD while all protected entries remain intact. The other four worktrees retain empty staged diffs.

Capture the exact stash OID, retain it and all remaining refs on any failed check, and locate that OID again before dropping only its current stash selector after successful recovery. The independent recovery checklist is in `research/worktree-safety-review.md`.

## Verification

Run the project's backend, frontend, package, and installed-wheel checks on the combined source. Compare protected changed-file hashes, staged edits, temporary source-tip ancestry, final squash tree and parent count, task manifests, and journal sections. Retain logs and the safety snapshot after removing the temporary integration worktree.
