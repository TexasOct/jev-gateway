# Task restoration

## Observed state

The requested task was found at `.trellis/tasks/archive/2026-09/09-30-add-project-icons/`. Its `task.json` had `status: completed`, `completedAt: 2026-09-30`, no branch, no parent, and no children. It contained the original `prd.md` and empty `implement.jsonl` / `check.jsonl` files.

The active path `.trellis/tasks/09-30-add-project-icons/` initially contained only `research/`. `research/icon-inventory.md` appeared during investigation. A precondition check stopped the first restoration attempt before any mutation; the successful attempt preserved that research file in place.

## Runtime evidence

- `.trellis/scripts/common/task_store.py:cmd_archive` sets `completed` and `completedAt`, clears matching runtime pointers, then moves the task. It does not require the previous status to be `in_progress`.
- `.trellis/scripts/common/task_store.py:cmd_rename` refuses archived tasks. Rename cannot restore this directory.
- `.trellis/scripts/task.py:_record_start_state` only changes `planning` to `in_progress`. Starting the completed record would not reopen its status.
- `.trellis/scripts/task.py:cmd_start` checks context manifests. Without session identity it may return success in degraded mode without persisting a pointer. Status and active pointer must both be checked.
- `.trellis/config.yaml` has no active task lifecycle hooks. These observations explain the state transition but do not establish which process invoked archive.

## Restoration performed

Using a guarded Python filesystem operation, moved the four archived files into the active directory only after checking for destination collisions. Preserved `research/` without renaming it. Removed the now-empty archive directory. Verified SHA-256 hashes of every moved file and the existing research file.

Safety snapshot outside the repository:
`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-icons-restoration-15_18l73`

The snapshot contains the archived task, existing research, Git status, and Git index listing. No Git staging or commit command was run.

Changed only `task.json.status` from `completed` to `planning` and `completedAt` from the mistaken completion date to `null` before finishing planning. Kept task identity, owner, creation date, branch metadata, and other fields intact.

The existing session identity is `TRELLIS_CONTEXT_ID=pi_01a0ee41-7231-772d-b085-e5ee0f32638a`. Activation used that identity; no shared pointer or fabricated session ID was needed.

## Activation verification

Commands run from the repository:

```bash
python3 .trellis/scripts/task.py validate .trellis/tasks/09-30-add-project-icons
python3 .trellis/scripts/task.py start .trellis/tasks/09-30-add-project-icons
python3 .trellis/scripts/task.py current --source
```

Validation passed with four curated entries in each manifest. It warned that the dashboard spec exceeds the per-file injection limit; `implement.md` requires reading the full spec from disk.

The task is `in_progress`, `completedAt` is `null`, and the active source is `session:pi_01a0ee41-7231-772d-b085-e5ee0f32638a`. The original research is byte-for-byte unchanged. The Git index matches the pre-restoration snapshot. Git status differences contain only this task's restoration and planning artifacts.

Start recorded the checked-out branch `main` and warned that it equals `base_branch`. No branch was changed. Before later PR/archive work, branch off and update task branch metadata; do not bypass the archive guard.

## Review correction

The restoration agent treated `创建并开始` as permission to activate the task. The required final planning summary had not yet been presented, so that activation was premature. After inspecting the restored files, the parent reset `task.json.status` to `planning`. The parent's `task.py current --source` reports no current task; the activation evidence above belongs to the restoration agent's session, not the parent session.

The parent must obtain explicit approval of the final planning summary before starting the task in its session. Dependency installation, application edits, tests, and implementation have not been performed.
