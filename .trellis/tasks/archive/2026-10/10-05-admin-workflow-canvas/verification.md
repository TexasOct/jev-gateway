# Workflow canvas implementation and verification

The canvas edits ordered first-match policy drafts. Connections remain projections of rules, fallback choices and catalog membership. Layout writes use the existing canvas-layout API and remain separate from policy validation, review and apply.

## Implementation self-check coverage

| Requirement | Implementation and evidence |
| --- | --- |
| WF1 | Blank-board native context menu adds routing rules at the inverse-mapped pointer position. The visible Add node button offers the same actions for keyboard and touch. Question configurations are added to the existing shared entry node, with this behavior explained in the menu. Rules start with an explicit empty destination, are selected/revealed immediately, and show their inspector and incomplete state. |
| WF2 | The menu lives outside the scaled content, measures its actual size, respects the visual viewport and responds to viewport changes. Outside pointer actions and Escape close it. Escape restores the trigger; arrow keys and Home/End move between available actions. Native blank-board menus were checked near window edges in both locales and themes at 1280px and 320px. |
| WF3 | Rule deletion and grouped rule deletion use semantic mutators. Slot positions and selection references follow removals, including duplicate rules. Connections use the existing classifier and disconnect mutator. Generated entry/fallback/catalog nodes explain their protection; generated, explicit and last-member edges preserve their restrictions. Delete/Backspace leave text inputs, selects, textboxes and contenteditable elements alone. |
| WF4 | A bounded 50-step in-memory history stores semantic drafts, node positions and selection. Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Cmd/Ctrl+Y work outside editors. Native pointer drag and keyboard movement both support layout undo/redo. Pan/zoom remain outside the stack. Save/reset, configuration remount and discard establish boundaries. Discard restores baseline rule slots independently of the bounded stack. |
| WF5 | Cards retain their existing type/name/summary projection and add selected/incomplete/invalid states. The common inspector groups rule conditions, routing destination and advanced selection. Checkbox rows use aligned labels and nested fieldset borders are removed. Error actions reveal the related question/rule/fallback. Unsupported question type has an explicit choice-format repair. Unreadable overlay JSON explains server repair and offers the existing reviewed reset. |
| WF6 | Policy validation/application and automatic layout-save states are distinct. Layout status has a stable line height to preserve gesture geometry. Failed policy saves retain the draft and review, allowing retry. Native tests apply, reload the page and verify question text, rule count and exact node positions. |
| IA3–IA5 | Existing controls, local icons, tokens and responsive geometry are reused. Loading, forbidden, invalid and save-failure states have feedback. Keyboard addition, menu navigation/dismissal and protected deletion were exercised. Parent integration receives an optional dirty callback. |

## Parent interface

`RoutingEditor` adds `onDirtyChange?: (dirty: boolean) => void`. It reports semantic policy changes, pending add/rename inputs, node-drag previews, viewport changes throughout the 450 ms autosave debounce, and every queued/in-flight layout PUT. It clears the callback on unmount. Pass a stable callback from the shell's page-switch and beforeunload guards. The shell is deliberately unchanged in this child.

Policy draft dirtiness lasts until explicit discard or successful apply/remount. Independently autosaved layout dirtiness lasts until the latest queued layout succeeds, or failed-generation rollback restores the last saved layout. An older successful PUT cannot clear dirtiness while a newer revision or unsent viewport debounce exists. The queue reports pending immediately upon enqueue, including gaps between serialized writes. Cancelling a drag restores its starting layout and keeps any older queued writes dirty.

Policy review/apply/reset wait for layout work to drain, preventing the resulting configuration remount from silently dropping queued layout revisions. Undo/redo restore semantic draft and node positions while preserving current pan/zoom. Successful policy apply/reset, configuration-hash remount and explicit draft discard establish history boundaries; automatic layout-save completion does not clear history. Layout-only writes never validate/apply policy or reload the routing engine.

`RoutingCanvas` owns its history and receives internal save/discard boundary counters plus `onLayoutDirtyChange`. Configuration hash remount remains the existing server reload boundary. No API payload/schema changes are required.

## Verification commands and results

- `npm --prefix frontend run lint`: passed, with four existing Fast Refresh warnings in the locale provider.
- `npm --prefix frontend run test`: 39 files, 316 tests passed.
- `npm --prefix frontend run build`: TypeScript and Vite passed; the existing large-chunk warning remains.
- `cd frontend && npx tsc -p tests/tsconfig.json`: passed.
- `JEV_BROWSER_PORT=43927 npx playwright test -c playwright.config.ts canvas-workflow-actions.spec.ts canvas-connections.spec.ts canvas-hit.spec.ts canvas-visual-acceptance.spec.ts routing-editor.spec.ts icons.spec.ts responsive.spec.ts --workers=2 --output=/tmp/trellis-workflow-canvas-43927-results`: 81 passed. The `icons.spec.ts` pattern also includes provider icon regressions. New cases cover queued layout writes, unsent viewport debounce and native drag cancellation, and exact repair targeting for unknown destinations with valid inherited fallback choices.
- The native failure-fallback gesture cancellation regression passed 10 repetitions after waiting for the measured content-origin frames and asserting the port is actually exposed. No forced clicks or synthetic pointer dispatch were used.

Playwright config and the fail-closed mock origin allowlist both accept `JEV_BROWSER_PORT` with the existing 4178 default. All runs here used dedicated port 43927 (early runs used 4293), and retained unexpected-traffic rejection.

## Screenshots inspected

- [Desktop menu, both themes and locales](evidence/workflow-menu-1280.png)
- [320px menu, both themes and locales](evidence/workflow-menu-320.png)
- [New incomplete rule and grouped inspector](evidence/workflow-new-rule.png)
- [Graph after native history operations](evidence/workflow-desktop-history.png)
- [Failed policy save with retained review and retry](evidence/workflow-save-failure.png)

The contact sheets combine the original browser captures without changing the page content. The native rule inspector was inspected at 75% board zoom; the form itself remains unscaled. Desktop and narrow menus stay within visible bounds. Original captures and Playwright artifacts are also available under `/tmp/trellis-workflow-canvas-43927-results`.

## Integration scope

These results are implementation self-checks. The independent `accept-canvas` task owns the acceptance verdict. Save/reopen and failure tests run the real frontend against mocked existing HTTP operations. This child does not claim live gateway transaction verification, shell navigation/discard integration, packaging acceptance or physical mobile keyboard/pinch-zoom acceptance. The parent owns those checks. There is no raw JSON editor in the current routing surface; the JSON failure path concerns the server's unreadable overlay file. Backend routing semantics, catalog identities, authorization and credential handling are unchanged. Source layout limits remain 256 nodes, 65536 encoded bytes, bounded integer coordinates and the existing ID namespaces.
