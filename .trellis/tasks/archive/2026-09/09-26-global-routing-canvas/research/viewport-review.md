# Independent source review of viewport revision

The read-only check agent reviewed actual frontend code against the revised task. It did not edit files or run gates. Four source-level findings require fixes and targeted browser checks before acceptance.

1. At `frontend/src/config/canvas.ts:179-182`, inspector placement can return null for a centered 56px node in a 216px free region (the supported 320×700 geometry fixture). The above/below regions are only 56px each after margins. `RoutingEditor.tsx:554` keeps inspectorOpen true while hiding the panel. Plan a non-centered node reveal and a usable fallback for insufficient space; test geometry, actual panel access and exposed node hit testing together.
2. `RoutingCanvas.tsx:446` and `styles.css:397-398` place transformed unscaled content in normal flow inside a scaled board. Shrinking the transform does not shrink the child's layout overflow. Let the scaled outer board own scroll extents, clip it and absolutely position its content. Measure scrollWidth/Height at 0.5×, 1× and 1.75×.
3. `RoutingCanvas.tsx:42,125-129,390-395,437-444` saves raw CSS scroll offsets while zoom remains transient. Restoring at 1× points to a different location. Define paired canonical-1× save/restore conversions, preserving the API shape and accounting for the unscaled origin/free viewport. Exercise Fit, scroll, reload and rollback at non-default zoom.
4. `RoutingCanvas.tsx:83-87` and `RoutingEditor.tsx:349-370,554` can hide/remove focused inspector fields through geometry changes without focus handoff. Preserve access when possible, and move focus to an exposed selected node or the canvas before hiding a focused panel. Interactive resize/keyboard verification is needed.

The check also confirmed the strategy-only auto-header/remaining-row shell, canvas fill, internally scrolling collapsed drawer, DndContext provider boundary and unchanged strict layout/policy API separation. These confirmations are source review, not browser acceptance.

A scoped implementation agent is addressing the four findings. The browser tester is collecting pre-fix evidence and will need a post-fix rerun.
