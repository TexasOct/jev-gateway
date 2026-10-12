# Release 0.1.8 acceptance

Stable [v0.1.8](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.8) is published and latest. Independent source and hosted/public reviews returned PASS. The parent verified the actual reports, sealed artifacts and native receipts. The task is archived and recorded in workspace session 14.

## Accepted behavior

V2 overlay merge accepts wrapped strategy catalogs with absent or null global `policy`, using each workflow's valid policy. Explicit malformed global policies remain invalid, and compact catalogs still require a global policy. Synthetic API regressions cover validation, saving, v1 migration and reload; unchanged baseline bytes, unselected workflows, selected models and existing overrides; and invalid writes without state replacement.

The production change is three lines at the baseline-policy parse in `merge_overlay()`. Sixteen regression cases and the existing backend spec document the contract. Exactly seven source/spec/version paths were accepted. All 1025 tracked source bytes and Git modes match the integrated candidate, and all 65 third-party lock records remain unchanged.

## Actual local verification

Independent checker `675f2e4c-7af9-4526-bbd0-5e3cc342e7b9` returned PASS after fourteen native commands exited 0. Backend tests passed 3326 cases and retained two missing-browser-capture skips; frontend units passed 422 cases. Frontend lint has zero errors and four existing warnings. Frontend/browser types, full Pyright, build/freshness, lock, packaging and release validation passed. The isolated macOS wheel smoke passed 169 checks and verified owned cleanup, including closed port 51272 and removed isolated executable.

Writer-focused 108 passes overlap the backend suite and are not added to it. Frontend JUnit contains 422 executed rows and 419 distinct display tuples: three pairs are distinct parameter rows sharing reason-based titles in `outputs.test.ts`. Parent verified the source parameters and preserved those rows. All 3328 backend rows have distinct identities, including the two skips.

All 326 tracked frontend paths and dependency files match `v0.1.7`; its accepted 787 browser cases are reused for that unchanged scope. This release does not claim a new browser run or new captured-body replay. Local backend used Python 3.14.8; the installed smoke used managed Python 3.12. The hosted build passed with Python 3.12.15, Node 22.23.3 and npm 11.16.0.

The local accepted wheel is 448849 bytes, SHA256 `7fb8b3da0169bdd2eea5e4e80a343f6bfdc946278135bd92fd8e3aaf010d63bc`, with 100 members, 94 package files and 42 static files. The hosted/public archive digest is independently verified below. All uncompressed member bytes match the accepted local member inventory.

Active main-workspace LSP probing could not resolve three internal imports from its package-relative context. Complete candidate and integrated-main `pyright --project pyrightconfig.json` checks passed with zero diagnostics, and native imports/full tests passed. The editor findings remain an environment limitation; no source/settings suppression was introduced.

## Signed product delivery

| Commit | Scope |
| --- | --- |
| `6b5580eb98d62995eec21b913a292188f50493ce` | Parser, two regression files and backend spec |
| `ea34e794840d9b96e92b2e2c25ebc9229bd56d6c` | Three version records |

Signed annotated `v0.1.8` object `f1f7fed6f78684a3687162c74cd494a5266e98e4` targets the version commit and product tree `5e6e5f25fa71126e019b37dc6b23514f857f9d2a`. The parent verified signatures and atomically pushed main/tag after fresh baseline and target-absence checks. Temporary-index commits preserved the normal index during each commit, then reconciled it to the advanced HEAD. Main retains 60 historical Trellis permission differences from the fresh candidate checkout; their bytes/Git modes agree and their existing full permissions were preserved.

[Formal release run 38281763280](https://github.com/TexasOct/jev-gateway/actions/runs/38281763280), attempt 1, passed build, Ubuntu smoke, macOS smoke and release on the exact product commit. The run completed at `2026-10-12T17:10:03Z`. Both OS smokes bind the same hosted wheel and passed 169 identical ordered checks. Their counts are separate executions and are not added to unit/backend/browser counts.

## Public release and installer

Release ID `410837578` is stable/latest, non-draft and non-prerelease, published at `2026-10-12T17:10:01Z`. Four pinned HTTPS downloads reached HTTP 200 and match the same-run hosted artifact, API sizes/digests and both SHA256 sidecars.

| Asset | ID | Bytes | SHA256 |
| --- | --- | --- | --- |
| `install.sh` | `634422707` | 10215 | `ab10aec412e9380a1200d541cae22afbf4f0fc81241d332d7c4fa6014ed3d48a` |
| `install.sh.sha256` | `634422705` | 77 | `20f0058c987a16e9820c68d89ead31239a2a79b7f9b95f43f7b0ed3d2615c3ec` |
| `jev_gateway-0.1.8-py3-none-any.whl` | `634422706` | 448849 | `58a46521b71c54d9f1e2e5bc2a72683238356b6c241e628dd47b7305758cfe7d` |
| Wheel `.sha256` | `634422703` | 101 | `4f498b7660ef15dfbe7388f1d411862b9d24ac4eb8f8d80b34fdf6a0f6429a6a` |

The hosted/public wheel has exactly 100 members and 100 RECORD rows (99 hashed members and the unhashed RECORD self-row); all digests/sizes verify. Its 52 nonstatic package/template files, license and entry points match the signed source. Its 42 static files and every member hash match the accepted local package inventory. The installer matches the tagged template with its single release stamp replaced once.

Independent publication checker `7c97956c-d1ee-4fad-b076-6c14f88788cb` returned PASS; workflow `2546d413-a5c9-4538-b9c9-7b52fbd25000` completed with `ok: true`. Native delivery is lightweight `attested`; actual acceptance rests on saved command/artifact receipts, which the parent separately verified. Forty-five native commands retain 42 exits 0 and three diagnostic exits 1 described in [recovery record](recovery.md). Every publication acceptance operation passed, without workflow retries, source corrections or asset replacement.

The ordinary public installer smoke used the actual downloaded installer and wheel, exited 0 in 159.778 seconds and passed all 169 checks, including initial installation, running reinstall and stopped reinstall. Its private helper changed only the documented headless PATH tuple to admit `uv`, `sh`, `ps`, `uname`, `curl`, `python3`, `mktemp`, `rm`, `grep`. Whole-file/mode reversal and all 68 assertion/check-call AST nodes verify; deadlines, retries and the no-Node guard are unchanged. The known adaptation was applied initially, with no invented unadapted failure. Cleanup proved port 55791 closed, no owned process survived, and the synthetic executable/PID record was removed while runtime data was retained.

This is ordinary installer acceptance under `docs/releasing.md`. Historical browser/manual dispositions and sealed public-installed/RL1 limits remain as recorded. GitHub reports `immutable: false`; acceptance establishes signed/package bindings and observed preservation. Previous v0.1.7 tag object/target, Release ID/body and asset metadata remain unchanged after excluding download counters.

The operator remains healthy on 0.1.7, running on port 8000. Parent read-only status/version checks passed, and eight configuration/credential files retain their original bytes and permissions. This release task uses synthetic homes and performs no operator installation or data migration.

## Evidence and closure

Private evidence root: `/Users/texas/.local/state/jev-gateway/release-0.1.8-20261012T155829Z`. Source reports, original native failures, receipts, inventories, wheel, index copies and retained sessions stay outside commits. [Recovery record](recovery.md) preserves the stream failure, report settlement and fixture corrections. The original rejected acceptance remains unchanged.

Archive commit `412b7659f936487ed0402e88252de831e6f564dd` contains nine public task records. Archived contexts validate (8 implement entries and 7 check entries); large-spec injection warnings remain explicit, with complete native reads reused. Workspace session 14 preserves the prior 16892-byte journal prefix, ten history rows and both existing workspace file modes. Final signed closure records the session and completion metadata; main advances through these bookkeeping commits while the product tag stays fixed. A1 through A8 are verified by the retained source, publication and parent reconciliation receipts.

Original source checker run/event/output artifacts and the settled complete source/publication session are retained privately. The source checker's pre-publication complete session length/hash was not anchored, so no retrospective unchanged-prefix claim is made. The writer's separately anchored recovery prefix remains verified.
