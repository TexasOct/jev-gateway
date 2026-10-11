The independently accepted construction is prepared for stable 0.1.6. A8 is pending the signed release commit, annotated tag, hosted workflow and public asset verification at this recording boundary.

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
