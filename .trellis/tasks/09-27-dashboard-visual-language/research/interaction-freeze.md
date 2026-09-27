# Interaction boundaries for a visual-only iteration

Source: `.trellis/spec/backend/dashboard-routing-config.md`. This phase produces an offline static style board only. The constraints below govern design representations and any later product implementation; the prototype must not present controls as functional.

## Behavior that stays unchanged

- Keep the existing page/view entry points, control labels, DOM order and form semantics. Visual emphasis may change; the operator must not learn a new workflow.
- Preserve authentication handling, API paths, request bodies and response interpretation. Credentials remain in module memory. Only the existing validated locale identifier may be stored in local storage.
- Keep theme-seed selection, preview, save and reset behavior. A new visual language must still work with configured seeds rather than painting a fixed brand color over the existing theme system.
- Preserve node selection, drag handles, pan, zoom, Fit, keyboard alternatives and connection editing. Avoid CSS transforms or transition rules on coordinate-owning elements that alter pointer mapping.
- Node positions and scroll viewport remain independent of routing policy. A layout gesture may write `canvas-layout`; it must never write or reload routing policy.
- Routing edits still pass through the existing draft, validation, review and explicit apply flow.
- Keep the strategy view's `100dvh` shell, the header-sized first row, and the canvas in the remaining space. Monitoring and appearance keep their existing layout modes.
- Preserve `[data-canvas-occlusion]` measurements, unscaled overlays, node hit targets and inspector placement. Changing padding, borders or font metrics needs native-pointer regression checks.
- Keep the bottom drawer's contents, default expansion state and bounded internal scroll. Advanced sortable/drop-zone controls must remain under `DndContext`.
- Preserve both monitoring lists' fixed viewport heights, cursor pagination, virtual row bounds, refresh behavior, evidence expansion and stale-response protection.
- Keep all Chinese and English translations and locale persistence behavior.

## Evidence needed after implementation

- Compare event handlers, hooks, state transitions and API calls against the task baseline. Any behavioral change must be removed or reviewed as a separate task.
- Use stub dashboard APIs or an isolated synthetic catalog. Never apply changes to the user's running gateway to test appearance.
- Exercise real mouse/keyboard inputs. Before dragging, confirm that `elementFromPoint` resolves to the expected node instead of an overlay.
- Capture the same states before and after the visual changes: monitoring, strategy canvas, selected node inspector, expanded bottom drawer, policy review and appearance controls.
- Check desktop, tall desktop, 390px and 320px widths in both locales. Measure node visibility and viewport fit; absence of page overflow alone is insufficient.
- Record layout writes and policy writes separately. Confirm that save requires the same validation and explicit confirmation as the baseline.

## Visual scope constraints

Prefer existing CSS selectors and semantic tokens. Do not introduce a component framework, external font request, image-generation dependency, dark-mode control, new animation system or layout rearchitecture for this iteration. Status colors keep their meaning even if the primary accent is refined. Changes to focus outlines, contrast and existing hover/disabled styling must preserve accessible names and input targets.
