# Branch inventory and authorization

The first request excluded the current branch. After approving execution and branch deletion, the user added `追加feat/provider-icon-preset，所有内容全部采用squash`. The existing branch is `feat/provider-icon-presets`; its committed content is now included. All four feature contents will land in one squash commit on local `main`.

| Branch | Recorded tip | Commits absent from initial main | Action |
| --- | --- | ---: | --- |
| `fix/v0.1.0-macos-release` | `75b70c831da6b94d011dfa9bfca6435833f91de1` | 3 | Merge, validate, delete local ref |
| `feat/write-only-credential-config` | `4acfba2c2b8a24baa412a4257e76a5c0cbd4d025` | 2 | Merge, validate, detach clean worktree, delete local ref |
| `fix/select-spacing-alignment` | `e7ace7c8d4aac41a7de41469a0b80c8d54dd6189` | 3 | Merge, validate, detach clean worktree, delete local ref |
| `feat/dashboard-key-page` | `eeb798f18e260ec84475944c627cc05126ab5d83` | 0 | Deleted local ref; clean worktree detached at the same tip |
| `feat/strategy-workflow-canvas-editing` | `7eb83e6627ef9a1d3f68394230bb7ff9ce569e55` | 0 | Deleted local ref after original-main ancestry proof |
| `feat/provider-icon-presets-verified` | `dbcc14faac40503fe26703f032483e338e90b1d2` | 0 | Deleted local ref; dirty worktree detached at the same tip with all protected files preserved |
| `feat/provider-icon-presets` | `afdfa49a466ed5d507d5eee2ef462328e4482972` | 3 | Integrate committed tip, preserve dirty files, switch original worktree to main, delete local ref |

Completion evidence lives in each candidate's archived task record. The release branch includes completed `09-30-unified-settings-provider-config` and `10-02-release-010-macos-acceptance`; the other branches include completed `10-04-write-only-credential-config`, `10-04-select-spacing-alignment`, and `10-04-provider-icon-presets`.

The initial release merge had ten conflicts, in the workspace index, HTTP API docs, app shell, and routing canvas/draft/preview files. It was aborted without a commit when the user requested squash. Its log is retained under `.trellis/.runtime/completed-main-merge/merge-release.log`.

The native safety snapshot is `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-completed-main-safety-ec__pks0`. The original worktree HEAD, index, staged entries, and every pre-existing changed file are protected. The dirty verification worktree is protected separately.

The bundle was verified as complete. A native check after the three already-main branch deletions compared all 231 protected changed paths and found no byte or existence changes. All original staged diffs are empty.

The first-stage release backend gate passed: `uv run pytest -q tests/test_setup.py tests/test_global_defaults.py tests/test_empty_tag_default.py tests/test_stream_evidence.py`, 191 tests in 8.59 seconds. This precedes credential, select, and icon integration and is not the final combined-source result.
