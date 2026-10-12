# Release 0.1.7 acceptance

Independent combined-source and publication reviews returned PASS.
[Stable v0.1.7](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.7)
is published, latest, non-draft, and non-prerelease. This record closes A1
through A7. A8 remains pending the separate signed archive/journal commits,
their main push, and the final preservation check.

## Source and signed delivery

The user authorized all current changes, including repairs needed for combined
acceptance. The original 33 admitted files became 39 product/version paths.
Integration verified all 1007 tracked file bytes and Git modes against the
accepted repaired inventory. All 65 third-party dependency records remain
identical to baseline.

| Signed commit | Scope |
| --- | --- |
| `da122333df853f21cdeeff4430cc501a11bd2d60` | 13 metadata paths |
| `3df249b148d90bbe7fd860bd381cd5c0e8d2e831` | 23 workflow/UI/browser paths |
| `87d27245f00072913bf78a67b831f83f4efe4589` | Three version records |

Annotated signed tag object `91d86b04293f98d450de72c8add5a07f94b66b7f`
targets the version commit and product tree
`69ee4a40b2a73b3d7f950b4dfa96fe2367617df1`. Parent integration/commit
receipts and independent signature/tag/blob checks agree. Main and tag were
pushed atomically after proving the remote baseline and absent target.

## Actual validation

The repaired aggregate contains 787 collected/executed identities: 778 preview
and nine standalone cloud cases. All passed, with no skip, duplicate, missing,
or extra identity. Both real isolated synthetic credential modes were admitted.
The final 200-case repair scope includes each original failed identity once;
its overlapping counts are not added to the aggregate.

Frontend units passed 422 tests. Backend acceptance retained 3310 passes and
two historical capture skips, with separate successful captured-body replay
evidence. Lint, types, Pyright, build, lock, and wheel validation passed;
lint retains four existing warnings. The fresh repaired local wheel passed
169 isolated macOS installation checks.

[Formal run 38204431529](https://github.com/TexasOct/jev-gateway/actions/runs/38204431529)
completed successfully on the tagged product source, attempt 1. Build, both OS
smokes, and release jobs succeeded. Hosted build used Node `22.23.3`, npm
`11.16.0`, and Python `3.12`, with fresh unit/backend/type/lock/package gates.
Ubuntu and macOS each passed 169 checks of the same hosted wheel.

## Public artifact and installation binding

Release ID `410170577` is also the latest Release ID. All four asset downloads
match API sizes/digests, hosted bytes, and both SHA sidecars.

| Public asset | Bytes | SHA256 |
| --- | --- | --- |
| `install.sh` | 10215 | `0410b4ac5792073a045c13ed0bc0f65bd91e537675e215d0e83e6b007e5e00c0` |
| `install.sh.sha256` | 77 | `6561c96515ba8319594123e48c598cde186cd4b864d2c9ead9274f64fb5e2c69` |
| `jev_gateway-0.1.7-py3-none-any.whl` | 448825 | `33aa25b3663c517eb767f8a5cca5f3d998a26626eb1bccc7f7f3393b9cca8147` |
| `jev_gateway-0.1.7-py3-none-any.whl.sha256` | 101 | `842b778182c729fc3e24e6840f8cd124055c026dd89b9f8260c59d2e4c98fa39` |

The public wheel metadata, both CLI entry points, 52 package/template files,
license, 42 static files, and all 100 RECORD members were inspected. The
installer equals the tagged template stamped once with `v0.1.7`. Hosted/public
archive bytes differ from the local accepted wheel digest; acceptance binds
the actual hosted bytes and their tagged payload.

The downloaded public installer smoke exited 0 in 106.703 seconds, passing
169 checks including stopped/running reinstall preservation. Its only helper
adaptation was one private PATH tuple replacement with
`('uv', 'sh', 'ps', 'uname', 'curl', 'python3', 'mktemp', 'rm', 'grep')`.
Whole-file reversal reproduces unchanged tagged source and mode. Assertions,
deadlines, retry behavior, and the no-Node guard remain unchanged. The earlier
raw missing-`grep` failure is preserved. Owned fixture shutdown was verified:
port 58735 closed, its gateway PIDs absent, and its executable removed.

Previous `v0.1.6` tag object `e16eb5947140b9e756f744a83793b084959b8b16`,
Release metadata, and four public asset bytes remain unchanged; download
counters were excluded from immutable-field comparison. The current API
reports `immutable=false`; this acceptance verifies the exact signed target
and unchanged observations without claiming GitHub-enforced immutability.

## Retained boundaries and custody

Original local REWORK, browser-cache admission failure, backend skips, repair
writer timeout, report recovery, and unexplained toolbar startup timeout remain
separate historical evidence. NativeSelect retains manual acceptance dated
2026-10-11 and its original automated failures/BLOCKED review. This release does
not create an automated NativeSelect PASS or sealed hosted-origin certificate.

Publication continuation `bed9cee7-6f19-4860-b37e-fcd6835461da` is terminal;
native delivery is attested and its independent report is PASS. Parent review
confirmed the saved machine receipts, including all 33 successful recorded
publication commands. Six completed native run/workflow directories, report
artifacts, and the settled checker session were copied to private persistent
storage with 76 file hashes/full modes verified. Earlier records were preserved.

Evidence root: `/Users/texas/Workspace/jev-release-017-safety-20261012T012734Z`.
Principal receipts are `accepted-integration.json`, `product-commits.json`,
`publication-refs.json`, `native-validation/checker-repaired-report.md`, and
`publication/checker-publication-report.md`. Publication machine evidence lives
under `publication/checker-evidence/`; final native custody lives under
`completed-independent-reviews/`. Raw evidence, research, runtime, prompts,
signatures, and private session content stay outside bookkeeping commits.

The source task is archived before the release owner. Context manifests load
tracked design/acceptance documents; original ignored research remains private.
Context validation passed with existing specification injection-size warnings.
Direct-main/no-PR archive validation is supported by signed product commits and
the published tag. The operator's installed package remains `0.1.6`; publication
performed no operator upgrade, credential/configuration edit, or daemon restart.
