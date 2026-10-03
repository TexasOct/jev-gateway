PASS. Independent code review of the reset-disclosure source repair, comparing the working-tree changes with HEAD `e5cdf2b9418624ccd95a302a65beda6f41b0d443`. No required fixes were found in the three assigned files. This conclusion applies to the repaired source and retained preview evidence. Final release acceptance remains pending replacement publication and a complete run against the actual downloaded public wheel.

The review inspected the exact diffs in `frontend/src/app/AppShell.tsx`, `frontend/src/features/routing/RoutingEditor.tsx`, and `frontend/tests/browser/routing-editor.spec.ts`, plus the relevant callers, canvas lifecycle, API fixtures, task contracts, and dashboard spec. Product source and existing evidence were kept read-only. The only file written by this review is this requested report. No subagents, commits, services, packaging, or publication were started.

| Reviewed contract | Evidence and result |
| --- | --- |
| Preserve disclosure across configuration changes | `AppShell.tsx:70` defines a stable, module-level `RoutingWorkspace` whose sole state is `informationOpen`. `AppShell.tsx:260` mounts that wrapper without a configuration key. The nested editor retains `key={configuration.config_hash}` at line 73, so only drawer disclosure survives a hash change. |
| Reset draft, inspector, and gestures on a new hash | `RoutingEditor.tsx:311` still initializes the draft from the supplied configuration. Selection, inspector, review, acknowledgement, anchor, topology and other edit state remain inside the keyed editor. Its `RoutingCanvas` subtree also remounts; gesture refs and connection intent state remain local. Existing canvas cleanup invalidates the layout queue, rejects late layout reads, clears timers/frames and releases node capture (`RoutingCanvas.tsx:179`). Existing draft-identity stale-connection checks remain intact (`RoutingCanvas.tsx:406` and `RoutingCanvas.tsx:457`). No canvas lifecycle or gesture implementation was changed. |
| Successful save collapses the drawer | After a successful apply response, `RoutingEditor.tsx:531` calls `setInfoOpen(false)` before awaiting configuration reload. It updates wrapper disclosure through the callback, so the new keyed editor also starts collapsed. Failed apply does not reach that call. The original browser sequence still clicks the drawer after save and requires the configured preview to be visible. |
| Reset retains disclosure | The reset callback (`RoutingEditor.tsx:542`) performs the existing confirmed DELETE/reload flow without changing disclosure. The new keyed editor receives the wrapper's open state, while the draft returns to the baseline. The original final visible configured-preview assertion remains. |
| Hooks and direct callers | `setInfoOpen` depends on `onInformationOpenChange`; `openDrawerAt` and `save` include `setInfoOpen` in their dependencies. React's wrapper state setter is stable. `informationOpen ?? localInformationOpen` preserves explicit controlled `false` and uses local state when the optional props are omitted. The only production caller is the wrapper, which supplies both props. Existing direct SSR test callers omit both and retain their collapsed/default contract. |
| Preserve assertions and wait for rendering | Removing only the two added wait lines reproduces the entire HEAD browser file byte-for-byte. The save wait (`routing-editor.spec.ts:85`) requires the formerly pending draft to render as unchanged. The reset wait at line 94 requires the fallback node to display baseline `default`, replacing the saved `quality` choice. API write receipts alone cannot satisfy these render waits. Both original configured-preview visibility assertions remain unchanged. |

Native evidence was independently inspected in `.git/jev-release-011-acceptance/preview-fix-20261003-220024`, the directory cited by `verification/preview-fix-gates.json`:

- `unit.log` records 33 files and 233 tests passed.
- `browser.log` records 118 individually successful cases and `118 passed (53.0s)`, with two workers. Case 110 is the save/reset regression; case 18 is the stale native connection gesture regression. The retained command in `gates.json` uses `--retries=0 --workers=2`, and `browser-results/.last-run.json` has `status: passed` and no failed tests.
- `lint.log` records zero errors and four existing React Fast Refresh warnings in `src/shared/i18n/index.tsx`.
- `build.log` records `tsc --noEmit` followed by a successful Vite production build. It retains a nonblocking bundle-size warning.
- `browser-typescript.log` is empty and the native `gates.json` records exit 0 for the browser TypeScript command. `freshness.log` says `dashboard bundle is current`. Every recorded gate exits 0; the completion marker contains `done`.

All three current file SHA256 values were recomputed from disk and match the retained summary and full-source manifest:

| File | SHA256 |
| --- | --- |
| `frontend/src/app/AppShell.tsx` | `39bcd01fa616282ef61fbcf1f98db161c29179d1cab3b5533fb75dee10587576` |
| `frontend/src/features/routing/RoutingEditor.tsx` | `1b46d6bdac16f07edc04ca4461a024f938a3f546b934d2ea485702c33a1390d5` |
| `frontend/tests/browser/routing-editor.spec.ts` | `f006c816afb515b571bdfe4c4ecd190f3b647780aaa8471f101d6b6b80bb1ed7` |

The raw `full-source-hashes.json` digest is `12f6dbe325a0647c86ca0ff7b3289de65051085f44b737d0d4cc079c6dcb7c20`, matching the recorded digest. All 120 listed files match the current working tree, with no missing files or digest mismatches. The three assigned hashes were checked again immediately before writing this report.

No tests were rerun during this review; verification combined source inspection, independent hashing, and inspection of the retained native logs. Browser evidence covers the corrected source bundle served through loopback Vite preview with synthetic APIs. Direct-editor fallback interaction and configuration changes during an active gesture were assessed from ownership/lifecycle code; the retained suite includes fallback structure and stale-gesture coverage, but this review did not run additional targeted scenarios.

The parent owns repackaging, republishing, artifact/source parity checks and the full browser rerun against the downloaded replacement public wheel. `published_wheel_reverified` remains false in the repaired-source evidence. The earlier public-wheel failure reports must remain retained; this source-review PASS does not close the release PRD's public-installation or public-browser acceptance criteria.
