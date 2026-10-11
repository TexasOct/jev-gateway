Stable [v0.1.6](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.6) was published at `2026-10-11T22:05:41Z`. Parent verification closes A8. The preparation receipts below retain their original boundaries; final publication and public-installer evidence follow them.

`pyproject.toml`, `jev_gateway/__init__.py` and the root `uv.lock` project record now say 0.1.6. All 65 dependency records are unchanged. At version preflight, the only other change above the accepted 525-file inventory was `.gitignore` excluding local task receipts. That four-path audit retained 521 unchanged hashes. Its source-map SHA256 is `c16890e0d03e353639870cdc4dbae38771376dc595519f0f27121bb70b583c1a`; binding receipt SHA256 is `0115e664f1883f3e4228cd89d7ca8310d62bac56244a37911062ec2e2257f2f8`.

Parent local commands have actual exit 0 and stable before/after source hashes:

- `uv lock --check`
- `python3 scripts/validate-release.py v0.1.6`
- `scripts/build-frontend.sh --check`
- `uv build --out-dir .trellis/.runtime/workflow-release-016/dist-0.1.6`
- `python3 scripts/validate-release.py v0.1.6 .trellis/.runtime/workflow-release-016/dist-0.1.6`
- `python3 scripts/smoke-installed-release.py --wheel <isolated-local-wheel> --version 0.1.6 --work-dir <isolated-mac-smoke>`

The isolated macOS smoke reports `success: true`, version 0.1.6 and wheel SHA256 `5aa77723b72260869a6d3f704bb5e6d4e0ab012cb6e3bf17aa47ba4b337238f9`. Checks cover actual installed package parity, Python 3.12, lifecycle, empty setup, synthetic provider/model/routing writes, key rotation, SQLite, repeat-install preservation and uninstall preservation. Native command receipt SHA256 is `3ab3b22dab48cb106404e019022f44130cdd2130ee5539206b3bcacd1a1ee798`; checks receipt SHA256 is `7dd3eb855a4a583458204e5df48228d57e0ee55553b6f8c81b6296a77b1bb03f`. The detached wrapper's initial 1000ms timeout was a tool wait boundary, not the smoke exit; the completed native receipt is 0.

Active native LSP for the new version delta checked `jev_gateway/__init__.py`: clean one, zero diagnostics and all other outcomes zero. Its hash is `17f0d96fe042c3c4b30e622593fb22377007949fa798b23510b0440aaccaef90`; the 525-file release binding remained stable. This is separate from the accepted 46-path integration probe. Parent also inspected the final native 320px Chinese dark controls, 1280px English dark controls and 390px Chinese dark model chooser screenshots.

Four tasks were archived children first with `--no-commit --skip-branch-validation`, reflecting actual direct-main/no-PR construction. All four archived contexts validate. Eight JSONL parent references were repaired without changing reasons. The matching session pointer was preserved, then cleared by the normal archive CLI. HEAD and the normal index remained unchanged through archival.

Before mutation, the parent preserved 8,806 working files (405,907,829 bytes), exact index and diffs in `/Users/texas/Workspace/jev-release-016-safety-20261011T213248Z`. Original timeout and earlier failed receipt custody remain independent. The 8,670 local receipt files are preserved outside the commit. Native release logs/receipts live under `.trellis/.runtime/workflow-release-016/`.

Live preflight found no v0.1.6 tag and received GitHub HTTP 404 for its release. Existing v0.1.5 remains tag object `7ee318ab535ec23c28f343b26d50056aa8902a95`, targeting `69cf58501ecba3bc95d8dbdf9bad64fb29412347`. This release scope does not upgrade the operator installation or touch its runtime files, credentials, SQLite or service.

The normal journal CLI then appended session 11 and updated its index. Both files belong to the 525-file inventory, so that command truthfully reports `source_stable: false` for those two expected bookkeeping writes. The original journal prefix is byte-identical. The commit candidate has six inventory deltas: the four preflight files and these two journals; all other 519 hashes match the accepted candidate.

An exact temporary-index projection contains 142 changed paths, including 93 source/spec/version/ignore paths and 49 task/journal paths. All 525 projected inventory bytes match the working release source, and wheel validation from the projection exits 0. No raw receipts, research or runtime files enter the index. The final passing browser output is separately copied and byte/mode verified: 1,820 files, including 1,015 PNGs, under the external safety directory.

The signed release commit is `06e246dec9229eb6eef9aa148d376eadbfdd90e1`, parent `a7c57da6730705d2cae3242ab5bacb3cc76c0513`, tree `ebc7f4ff3d8c58e10b8966ecd0237309f2cd16be`, with native signature status G. Standard signing and hooks were retained. The temporary index's final successor changed only the two task documents; product source stayed identical to the validated projection. Normal index reconciliation and clean status passed. Atomic push published `main` and annotated tag `v0.1.6`; tag object is `e16eb5947140b9e756f744a83793b084959b8b16`.

[Workflow 38178580657](https://github.com/TexasOct/jev-gateway/actions/runs/38178580657) binds that exact source and completes build, Ubuntu smoke, macOS smoke and publication successfully. Hosted Python reports 3306 passed/two missing-capture skips; the earlier actual two-case capture replay remains separate. Hosted lint reports zero errors/four existing warnings; Pyright zero errors/warnings/informations. Both downloaded installed-smoke artifacts have `success: true`, 169 checks, version 0.1.6 and wheel SHA256 `472a2743ea34a7a015e13e0eea7b955d9067bc8594981169dd857ff41bf1f4a3`.

GitHub release ID `409950663` is latest, published, non-draft and non-prerelease. Four pinned assets download with HTTPS 200. Each byte count/hash matches its API digest and the exact hosted artifact. Both checksum sidecars are exact. The installer equals the source template stamped with v0.1.6, and all 94 wheel product members equal current source/static bytes.

| Public asset | Bytes | SHA256 |
| --- | ---: | --- |
| install.sh | 10215 | `51bc98796953256f3f77374e78082debedc8aff32221ce9fe716336b797d4b79` |
| install.sh.sha256 | 77 | `c5bdcf81f01b075b3b2b2282cfb582b79d7c3170a2e96d13c9c5a13b8ddd4210` |
| jev_gateway-0.1.6-py3-none-any.whl | 448070 | `472a2743ea34a7a015e13e0eea7b955d9067bc8594981169dd857ff41bf1f4a3` |
| jev_gateway-0.1.6-py3-none-any.whl.sha256 | 101 | `ecda7fc528a1878d0b32fff8584ff63dd6e83e26cb41ed74ecaae546c59e1ec5` |

The initial public-installer smoke retained native exit 1, `success: false` and 147 passes. Its command 19 combined log says `grep: command not found`, followed by `invalid embedded release tag`. This was the raw smoke's four-tool PATH, not a bad stamped identity or checksum. The existing public-installed README, `adapt.py` and quality spec require exactly nine tools for this public repeat-install seam.

The parent made a private byte-bound copy and applied only that documented tuple expansion. Original source SHA256 is `538dfe989962325eb158ce7f04e690ef34257f27c6c5d43116728d4c613760c6`; adapted SHA256 is `fdb9af53e7d023d82ecab8810803870d45b73c4d60d8e840528e620f416aeb64`. Full reverse bytes/hash/mode match the source, and the no-Node guard and every other line/assertion/deadline remain exact. No package, source installer, published asset or tag changed.

The documented-headless public-installer recheck has native exit 0, source stability true and `success: true` with all 169 checks. Check receipt SHA256 is `b279a7e90ec0d34da0afe1dacb5cc1eb3a521118de02a1299926fbf2dda46f27`. It executes the verified public installer and wheel in distinct temporary HOME/tool/bin/cache/Python/state/runtime directories, with synthetic credentials and an unrelated cwd. Running/stopped reinstall, installed parity, no-Node operation, native lifecycle and uninstall preservation pass. This ordinary isolated smoke does not claim sealed hosted origin/RL1 acceptance. The earlier failed raw attempt remains intact.

Public notes were updated with the accepted behavior and validation. API reread confirms exact note text and unchanged asset digests. Post-commit custody verifies all 8,806 originals with exactly 18 authorized metadata/version changes, no other byte/mode drift and the exact old index backup. Published v0.1.5 and the operator installation remain unchanged by this work.

Final bookkeeping closes the parent criteria, links every child to the release source commit and appends publication journal session 12. The first journal call supplied a bare commit subject and exited 1 before writing; the CLI requires `<oid>=<subject>`. Its separate corrected call exits 0. Only the two expected journal inventory paths changed, preserving session 11's original prefix. These command-usage receipts are separate from product and release validation.
