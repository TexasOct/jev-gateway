# Workflow canvas acceptance plan

Status: plan only. No implementation, test execution or integration acceptance has been certified by this agent. The parent will resume this same independent acceptance context with the integrated snapshot; final verification and the child `acceptance.md` verdict belong to this context.

## Scope and sources

The child owns WF1-WF6 and the canvas portion of IA3-IA5 in `../10-05-admin-experience/prd.md`. Its acceptance context is separate from the canvas implementer and the parent integration acceptance agent. This pass writes only this file in the current checkout. It does not change source, tests, task lifecycle, commits or generated assets.

Reviewed sources:

- Repository `prompt.md`, especially sections I, III and VII.
- Parent `prd.md`, `design.md`, `implement.md`, `check.jsonl`, `task.json` and `research/current-state.md`.
- Child `prd.md`, `design.md`, `implement.md`, both context manifests and `task.json`.
- `.trellis/spec/backend/dashboard-routing-config.md`, especially independent canvas layout, strategy canvas outputs/connection editing, frontend geometry and configuration-write boundaries.
- Backend spec index, quality guidelines, provider configuration, credential configuration and provider identities.
- Current `frontend/package.json`, Vite/Playwright configuration, browser fixture/hit-test helper, canvas connection and visual suites, and relevant routing editor/helper tests.

These sources describe contracts and existing verification facilities. They do not establish that the developing child implementation satisfies them. The current checkout is dirty and other agents are working; final source inspection must use the integrated snapshot supplied at resumption.

## Requirements matrix

| Requirement | Verification cases | Required observable result | Evidence needed for acceptance |
| --- | --- | --- | --- |
| WF1 | C01-C04 | Native blank-area right click offers supported creatable types; placement handles zoom, pan, scroll and content origin. Explicit add works with keyboard/touch. New objects become selected and configurable. | Native input trace, pointer/viewport/position measurements, selected ID, inspector screenshot and draft assertions. |
| WF2 | C05-C06 | Menus stay within the visible window, close on Escape/outside click and do not initiate drag, marquee or connection edits. | Menu bounds and focus records, native mouse/keyboard actions, unchanged graph/layout where cancellation is expected. |
| WF3 | C07-C11 | Supported nodes/edges can be deleted using their actions and Delete/Backspace. Editing text is safe. Protected objects explain restrictions; semantic references, rule slots and layout stay consistent. | Before/after semantic graph and layout, native keyboard tests, restriction copy, endpoint/tag assertions and absence of unintended requests. |
| WF4 | C12-C15 | Undo/redo restores draft, layout and selection together; stale operations cannot overwrite new state. Save/remount boundaries hold. Pan, zoom, fit, selection and native hit testing remain usable. | History checkpoints, queue/race evidence, pointer traces, hit points, computed geometry and rendered configuration after writes. |
| WF5 | C16-C18 | Cards communicate type/name/summary and normal/selected/incomplete/invalid states. One inspector groups relevant fields. JSON and graph errors identify repair targets and preserve recoverable drafts. | Inspected screenshots and computed styles, inspector/form assertions, raw JSON/parsed draft comparisons and error-to-target actions. |
| WF6 | C19-C21 | Workflow identity, help and separate policy/layout status are understandable. Explicit save and reopen retain configuration, derived connections and layout. | Request records, fresh reads/reopened UI, file/runtime evidence for real API boundaries and dirty-navigation checks. |
| IA3, canvas | C16, C22-C23 | Existing theme, local icons, spacing and geometry remain consistent across supported sizes, schemes and locales. | Inspected screenshots, header/canvas/overlay/node bounds, focus and settled contrast measurements. |
| IA4, canvas | C18, C20, C24 | Loading, empty, failure, saving and forbidden states explain recovery. Failed saves retain editable input and never claim success. | Controlled response ordering, status/error screenshots, draft comparisons and write counts. |
| IA5, canvas | C04-C05, C10, C17, C21, C25 | Forms and controls work with keyboard; dismissals restore useful focus. Narrow actions remain reachable. Dirty dismissal/navigation requires a discard choice. | Keyboard-only trace, active-element records, modal focus checks when a dialog exists, touch input and navigation/cancel request assertions. |

All rows are pending execution. Implementer reports and passing pure tests are supporting material; they do not replace the browser/runtime evidence above.

## Semantic fixtures and boundaries

Use synthetic catalogs with valid choice questions, multiple ordered rules including identical rule bodies, failure fallback, tag pools with multiple members, an explicit-membership pool, and models carrying foreign-strategy tags. Include zero-rule and final-rule-removal cases, a one-member tag pool, disconnected match outputs, invalid question configurations, empty/unassigned catalogs and long Unicode names. Use only synthetic credentials and isolated runtime files.

The graph represents ordered routing policy. The supported creation list must follow the integrated semantic helpers; it must not advertise arbitrary generated question/fallback/pool/catalog-model cards as independent deletable nodes. Supported question-definition editing remains available through the existing semantics. Inventory actual creatable types and protected objects before executing C01-C11, and record the applicable restriction for each type.

Deleting a match/fallback wire creates an explicit empty-label draft and retains a reconnectable output. That draft blocks review/application until repaired. Omission of a label must not silently restore an inherited selection. Fixed question/failure/final-default paths, explicit pools and removal of the last resolved member remain protected. Intermediate unmatched connection editing preserves ordered-rule semantics. Question result wires sharing one canonical target retain distinct visual identities and action descriptions.

Layout retains schema v1: `{version: 1, nodes: {node_id: {x, y}}, viewport: {x, y}}`. Node coordinates are integers within absolute value 10000, at most 256 positions and 65536 encoded bytes. There is no persisted free-form edge list or new zoom field. Zoom acceptance checks correct behavior and canonical viewport restoration, without inventing persisted zoom requirements. Layout uses atomic last-writer-wins replacement; do not impose routing/model revision contracts on that API.

Policy validation/application writes routing overlays through its existing explicit review flow. Layout writes are separate. Check that layout operations leave baseline/overlay bytes, policy hash and configuration-version count unchanged, and that validation/cancellation writes nothing. Both write boundaries retain configured-key and Bearer restrictions. The valid unmatched default must remain distinct from decision-failure fallback.

## Native creation and menu cases

| Case | Procedure | Acceptance oracle |
| --- | --- | --- |
| C01 | At desktop, use native right-button mouse input on a verified blank board point. Choose each supported creatable type in a fresh fixture. | Exactly one intended semantic object is created; menu contents match supported types and restrictions. The new object is selected in the editor and has a usable configuration entry. Missing required fields are explained. No policy PUT occurs before review/apply. |
| C02 | Repeat native add at 1x, a supported reduced zoom and a supported enlarged zoom. Include horizontal and vertical native pan/scroll and their combination. Capture geometry before opening the menu. | Unscaled layout coordinates correspond to the captured pointer location after inverse mapping. The node appears nearby and selection/inspector stay synchronized. Opening/selecting the menu does not change the captured creation point. |
| C03 | Repeat C02 with wrapped locale chrome, expanded/collapsed drawer and changed measured content origin. Include page scroll where supported; verify the fixed workspace does not create an unintended page of controls. | The calculation uses current canvas bounds, scroll, zoom and content origin. Header/drawer/toolbar reflow introduces no stale-coordinate offset. If creation reveals the node, compare canonical position with the original captured point and separately record resulting viewport movement. |
| C04 | Activate explicit add using Tab and Enter/Space, then through a touch-enabled browser context using native touchscreen input. Test the same supported types without right click. | Both routes produce a selected, editable object at a usable visible position. Controls have localized accessible names and visible focus; protected/read-only states explain why creation is unavailable. Touch emulation is recorded as browser evidence, with physical-device coverage stated separately. |
| C05 | Open blank/node/edge menus near each window corner at desktop and 320px, both locales. Use Escape and native outside clicks, then keyboard menu navigation. | Menu bounds remain inside the visible window and all actions are reachable, with internal scrolling if needed. Escape dismisses the menu, preserves the draft and restores focus to the invoking object/control or a visible canvas fallback. Outside click closes without an unintended canvas edit. |
| C06 | Right-click an exposed node header, output handle and wire; cancel and then use applicable actions. Follow with ordinary left-button node drag and native connect/reconnect. | Context actions refer to the intended object/output. Right clicks/menu selection do not start node drag, marquee, pan or a connection gesture. Cancellation leaves no transient wire or stuck pointer capture; subsequent native gestures work. |

For C02-C03, compute the expected board point independently from measured browser state:

`x = (clientX - canvasLeft + scrollLeft - originX) / zoom`

`y = (clientY - canvasTop + scrollTop - originY) / zoom`

Record these inputs, actual stored position and any deliberate small creation offset. Allow at most two unscaled pixels for rounding relative to the documented anchor. Check that any intentional offset remains near the pointer and is consistent across zoom levels. Do not call the implementation's mapping helper to generate the browser oracle. Use `elementFromPoint` to prove the chosen blank point has no node, port, wire or overlay above it.

## Deletion, text safety and graph integrity

| Case | Procedure | Acceptance oracle |
| --- | --- | --- |
| C07 | Delete a removable rule through its node context menu, then independently via Delete and Backspace. Cover first/middle/final slots, duplicate rule bodies and deletion of the last rule. Undo each operation. | Correct ordered slot is removed; selection, inspector and rule-layout IDs are remapped coherently. Derived incident paths disappear or reconnect according to ordered semantics. No layout entry, selection or condition reference points to a removed object. Undo restores the original draft, layout and selection. |
| C08 | Select an exposed wire through native mouse input and through keyboard. Delete/disconnect match/fallback and removable tag-member edges. Reconnect each using pointer and keyboard alternatives. | Exact visual wire identity is selected. Empty-label match drafts remain repairable and block review. Pool removal preserves foreign tags and other memberships. Reconnection restores valid output/card state; no silent policy application occurs. |
| C09 | Try node/edge actions and keyboard deletion for generated/mandatory cards, context/failure/default paths, explicit memberships and the last resolved member. Try during read-only and review states. | Each blocked operation explains its actual restriction and leaves graph, layout and persisted files unchanged. Generated cards never masquerade as independently removed policy objects. A protected item in a group cannot bypass its restriction. |
| C10 | Keep a graph object selected while editing a text input, number field, textarea/JSON editor, select and any contenteditable region present. Press Delete and Backspace with native keyboard input. Exercise text undo/redo while the canvas has history. | Text controls retain their normal editing behavior and graph state/history does not change. Keyboard guards cover focused descendants and active dialogs. Return focus to canvas, where the same deletion keys still perform the supported graph action. |
| C11 | Add/delete/reorder rules, rename/remove question definitions or criteria using supported editors, and remove/reconnect pool members. Compare semantic data, rendered endpoints and stored layout after every command. | Rule conditions reference existing questions/criteria; all displayed wire endpoints and selected IDs exist. Slot coordinates follow the intended rule even when bodies are identical. Foreign tags survive. Save payload contains the complete ordered rules and model changes relative to baseline. |

"No dangling references" allows an explicitly disconnected, visibly invalid match draft that blocks application. It does not allow nonexistent graph endpoints, stale rule slots, missing question/criterion references or silently inferred fallback choices.

## History, gestures and stale-state cases

| Case | Procedure | Acceptance oracle |
| --- | --- | --- |
| C12 | Build a sequence: add, configure, move, reorder, disconnect, reconnect, delete. Undo to the starting checkpoint and redo to the end. Exercise toolbar and supported keyboard commands; undo then make a new edit. | Each semantic command restores a coherent draft/layout/selection checkpoint. A completed drag commits one logical movement; pointer frames do not create separate entries. Redo is cleared by a divergent edit. History is bounded as documented; selection of nonexistent objects is never revived. Text focus follows C10. |
| C13 | Hold native node/connection gestures while a newer inspector edit, undo/redo, draft replacement or configuration refresh occurs. Open a context menu, change the underlying target, then invoke its stale action. | Completion/cancellation cannot overwrite the newer state or delete a replacement rule occupying the old slot. Stale targets are rejected or safely reselected with an explanation; pointer capture/previews clear. No orphan layout write survives a removed target. |
| C14 | Save successfully, await the refreshed rendered configuration, then try undo/redo. Repeat after external `config_hash` refresh, baseline reset, navigation remount, failed apply and failed serialized layout write. Delay old layout reads/writes with controlled responses. | History and stale gestures reset at successful server-save/configuration-remount boundaries. A failed policy save retains recoverable draft/history. Queue rollback preserves the last confirmed layout and permits explicit retry; stale responses do not revive obsolete positions/drafts. Drawer disclosure survives hash remount, successful apply collapses review, and reset shows refreshed baseline configuration. |
| C15 | Use native pan tool, scroll/wheel, zoom buttons, node dragging, marquee/group selection, wire gestures, keyboard selection and Fit. Select a distant model from an advanced/list entry before Fit. Repeat with inspector open and dense outputs. | At gesture start/end, `elementFromPoint` reaches the intended node/port/wire. Displacement scales correctly; pan/scroll leave policy unchanged. Fit uses the current editor selection and actual output-driven dimensions, keeping the selected node/compact group inside the unoccluded visible canvas at usable size. Toolbar/inspector do not cover required hit points. Cancelled gestures leave no writes or phantom history entry. |

Capture node bounds and the hit result together in one browser evaluation, as the existing `canvasNodeCenterHit` helper does. Separate awaited measurements can become stale after origin reflow. Native `page.mouse` input is required for mouse acceptance; synthetic `PointerEvent` dispatch does not exercise browser pointer capture faithfully. `canvas-hit.spec.ts` proves the measurement helper's behavior, not the mounted workflow interaction.

## Inspector, validation, save and state cases

| Case | Procedure | Acceptance oracle |
| --- | --- | --- |
| C16 | Inspect every supported card and inspector type, including generated read-only objects. Change selection and configuration; create incomplete and invalid drafts, then repair them. | Cards show recognizable type/name and relevant summary with consistent headers/icons/ports/spacing. Normal, selected, incomplete and invalid states differ in rendered appearance and accessible text. One inspector shows relevant basic/condition/advanced groups, with complete applicable fields and no conflicting parallel editor draft. |
| C17 | Edit through forms, then inspect the existing advanced JSON representation. Apply valid JSON and check forms/cards/edges; enter malformed JSON and semantically invalid JSON. Return to form editing and cancel/discard where supported. | Both editors share valid semantic data. Parse and validation errors explain the cause and repair location, preserve typed input and do not apply partial data. Errors navigate/reveal the affected node/edge/field where applicable. Required-field and relationship errors block review until repaired. Inspector close does not accidentally discard a workflow draft. |
| C18 | Exercise unsupported question types, fewer than two criteria, blank instructions/criterion descriptions, unknown or empty match labels, server validation failure and layout-capacity failure. Retry after correction. | Errors remain visible with drawer collapsed, identify the relevant configuration and explain recovery. Invalid graphs cannot reach application. Capacity limits preserve the confirmed layout and produce no policy write or false save notice. Both locales provide equivalent feedback. |
| C19 | Add/edit rules and questions, change a permitted connection/member and fallback, reposition nodes, then validate, review and explicitly confirm save. Reopen by reload/new browser context and read the saved state. | Loaded node configuration, ordered rules, derived edges, foreign tags and layout match the intended saved state. Dirty status clears after confirmed rendered reload. Policy and layout requests carry their separate schemas. Reopen is proved by fresh reads/rendered values, not an in-memory mock write flag. |
| C20 | Delay validation/apply/layout PUT and post-save configuration GET. Force validation/apply/layout failures, then retry; separately allow a successful write followed by a failed refresh. | Saving controls prevent duplicate submission. Failed writes retain form/JSON input and explain next steps. A committed write followed by a failed read is presented accurately and can retry the read without resubmitting the committed policy. Layout failure never reports a successful policy save, or vice versa. |
| C21 | Make semantic changes and try navigation/dirty dismissal. Cancel discard, then explicitly discard in a separate run. Repeat with a layout-only operation and with a valid saved draft. | Dirty workflow state reaches the integrated shell guard. Cancel preserves edits, selection and accessible focus; discard follows the stated boundary. Layout-only persistence does not falsely claim pending policy changes. Any confirmation dialog traps focus, supports Escape as cancel and returns focus to a visible trigger. Clean saved navigation proceeds normally. |
| C24 | Delay initial reads; return complete empty configuration, failed configuration/layout reads, corrupt-layout `read_error`, disabled writes, 401, 403 and controlled write failures. Recover using available actions. | Loading, empty, error, saving and forbidden states remain distinct. Known empty/unassigned states remain usable. Read errors do not silently become empty success; unreadable layout is not overwritten automatically. Read-only inspection/pan/fit remain available, mutation restrictions remain effective and drafts survive applicable recoverable failures. A later 401 follows the existing connection-page behavior. |

C19 also requires real backend evidence from an isolated synthetic runtime or the repository's ASGI/file tests: successful overlay apply/reload, independent layout round trip, rejected invalid draft and authorization denials. Confirm unchanged baseline bytes; confirm no policy hash/version change for layout-only actions; confirm invalid writes leave previous files and active policy untouched. Browser fixtures prove UI behavior and request shape. They cannot prove atomic replacement, disk recovery, server authorization or engine activation.

## Responsive, visual and accessibility coverage

| Case | Coverage | Acceptance oracle |
| --- | --- | --- |
| C22 | 1280×900 desktop, 1430×2511 tall, 390×900 and 320×900 narrow viewports, each in `en` and `zh-CN`, light and dark schemes. Capture collapsed/expanded drawer, menu, selected inspector and validation state. | Canvas top stays below the measured shared header and its bottom stays within the viewport. Drawer scrolls internally, with no second page of editor controls. Window/menu/inspector bounds and reachable actions pass in all 16 combinations. Page horizontal overflow is measured separately from intentionally scrollable canvas/toolbar content. |
| C23 | Dense question criteria, long Unicode model/label names, output growth/shrink and pools with many members; inspect screenshots and computed geometry after color/layout transitions settle. | Cards retain 190px unscaled width, 56px identity header, 28px output rows and 18px handles. Actual dimensions drive wires, movement, arrangement and Fit. Long names remain identifiable; states, local icons and spacing match existing primitives. Small status text meets 4.5:1 contrast. Reduced-motion mode retains visible information and usable controls. |
| C25 | Keyboard-only add/select/edit/delete/reconnect/undo/review/save, toolbar navigation, internal drawer/inspector scrolling and dirty-dialog cancellation. Include touch explicit add at 320/390px. | Controls have visible focus and understandable names. Hidden/unmounted objects never retain focus. Inspector/menu dismissal restores an exposed node/control or canvas fallback. Scrollable panels/footer actions remain reachable without nested dialogs or a mouse. No control's focus or hit target is covered by an overlay. |

Run the native creation/deletion/save/history main paths on desktop and 320px in both locales. The full 16-combination matrix verifies geometry, required state visibility and access; add regression cases wherever reflow changes the gesture origin or overlay coverage. Record exact coverage so a screenshot smoke pass is not described as every gesture passing in every combination.

## Pure tests and existing suites

| Facility | Useful complementary proof | Limit |
| --- | --- | --- |
| `frontend/src/features/routing/__tests__/draft.test.ts` | Ordered rules, question/criterion reference repair, full overlay payload, baseline-tag comparison and generated edges. | Cannot establish deletion-key routing, inspector focus or native node actions. |
| Routing `canvas.test.ts`, `outputs.test.ts`, `node-card.test.ts`, `drag-interaction.test.ts`, `selection.test.ts` | Inverse mapping with explicit inputs, slot remapping, semantic connection restrictions, card dimensions, fit planning, selection identity and drag calculations. | Passing math cannot prove the DOM supplied current origin/scroll/zoom or that an exposed pointer hits the right target. |
| Routing `layout-race.test.ts` and integrated command/history tests, if supplied | Queue rollback, confirmed checkpoints, bounded history, draft/layout restoration and stale-operation rejection. | Helper coverage cannot prove actual event ordering across editor remount, pointer capture, menu dismissal or rendered server refresh. Inspect new integrated tests before assigning coverage. |
| `RoutingEditor.test.tsx` and `CanvasNodeContent.test.tsx` | Inspector/control composition, statuses and DndContext ancestry of sortable rules/model drop zones. | Structure/marker assertions cannot establish emitted styles, overlay bounds, keyboard focus or usability. |
| `canvas-connections.spec.ts`, `canvas-visual-acceptance.spec.ts`, `canvas-hit.spec.ts` and new child browser specs | Existing native wire/port operations, invalid-draft guards, visual geometry and measurement-helper regressions. | Inventory actual assertions and screenshot paths first. Existing tests do not automatically cover new context menus, deletion/history or real server persistence. |
| `tests/test_canvas_layout.py`, `tests/test_routing_overlay.py`, `tests/test_gateway.py`, `tests/test_decision_matrix.py` | Strict schema, authorization, independent persistence, overlay validation/rollback and default-versus-failure routing. | Backend tests do not prove browser gestures or rendered save/reopen. |

Current `npm run test:browser` rebuilds the bundle, type-checks browser tests and runs Playwright. The browser fixture rejects unmocked origins and unapproved writes. Preserve those guards; explicitly allow only the intended policy validation/apply requests in writing cases. Do not weaken assertions, skip failures, enlarge timeouts or add fixed sleeps to obtain a pass. Use observable UI/network completion and controlled response barriers.

## Execution workspace and commands on resumption

The parent must provide the integrated source snapshot identifier and its dirty-diff provenance, the child delta, any known limitations, and an isolated acceptance workspace. Record the exact accepted source and build before execution. A moving shared checkout is unsuitable for reproducible browser acceptance.

Every browser build/process run must use this context's separate workspace and assigned unused loopback ports. Vite writes to `../jev_gateway/static` with `emptyOutDir: true`; a different port alone does not prevent two runs from replacing the same ignored assets. The isolated workspace must have its own generated static directory, preview server, Python runtime/test home, Playwright cache/output paths and reports. Do not run `npm run build`, `npm run test:browser`, dashboard-bundle pytest fixtures or package builds in the shared current checkout during parallel acceptance.

Use `JEV_BROWSER_PORT` with the validated existing Playwright configuration, strict port binding and `reuseExistingServer: false`. Give any real synthetic gateway process a separate assigned port and runtime directory. Use task-specific environment variable names; never repurpose `HOME` or `CODEX_HOME`. Write screenshots through `testInfo.outputPath` or an isolated absolute evidence directory. Some current connection tests use an old task screenshot destination; inspect those paths and prevent evidence from escaping or overwriting another agent's artifacts before running them. This plan does not edit those tests.

After isolation is established, run the appropriate existing commands from that workspace:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test -- src/features/routing
npm --prefix frontend run build
JEV_BROWSER_PORT="$CANVAS_ACCEPT_PORT" npm --prefix frontend run test:browser -- --grep canvas
uv run pytest -q tests/test_canvas_layout.py tests/test_routing_overlay.py tests/test_gateway.py tests/test_decision_matrix.py
scripts/build-frontend.sh --check
```

`CANVAS_ACCEPT_PORT` must contain the assigned unused numeric port. Inspect newly integrated browser test names before relying on `--grep canvas`; explicitly run any child specs omitted by that filter. Inspect installed dependency versions and current script behavior at resumption. Run new history/command and shell-guard regressions relevant to the child even if they live outside the routing directory. Browser test type-checking is included in the browser command; frontend TypeScript checking is included in build.

The parent owns full frontend unit/browser suites, full pytest, Pyright and package checks. Reference its evidence only when it matches the same integrated source snapshot, and identify it as parent evidence. Child acceptance still owns direct execution and inspection of the canvas-native cases. Expand checks only for changed code, confirmed failures or unresolved risk.

## Evidence, verdict and rechecks

For each case, record snapshot/build identity, fixture, viewport/scheme/locale, actual actions, expected/observed result, test or replay command and evidence path. Use screenshots plus measurements/network records where a picture cannot prove the behavior. Inspect the generated images before citing visual acceptance. Native traces should show real mouse/keyboard/touch actions and contemporaneous hit/bounds measurements. File/runtime claims require actual reads and policy/version assertions, without raw credential material.

On resumption, write child `acceptance.md` with a verdict of PASS or REWORK, requirement-by-requirement results, execution totals, evidence links, defects and coverage limits. PASS requires all required rows to be verified on the integrated snapshot with no outstanding relevant defect. Unfinished integration, a required check that was not executed or an environment gap remains REWORK/unverified with its concrete blocker; it cannot receive provisional PASS.

Classify failures as product defect, test defect, environment restriction or a separately reproduced pre-existing failure. Provide the shortest reproducible sequence and observed evidence. Product fixes return to the implementing owner; this context rechecks the fix and affected neighbors on the updated integrated snapshot. Re-run broader checks only when the change or unresolved risk warrants it. Do not edit product code/tests or perform lifecycle/commit/release actions within this plan-only assignment.
