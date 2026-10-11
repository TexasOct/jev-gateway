# Interaction seam

Consume the predecessor's actual named configuration/layout APIs and pure model helpers. Own RoutingEditor, RoutingCanvas and focused extracted controls where separation reduces those components, plus App/API consumers only as needed for strategy request identity and departure guards. Reuse existing shared NativeSelect/Button/Dialog/Field; add no package dependencies.

Selecting a strategy loads its independent draft/layout/history. Confirmation occurs before abandoning dirty work; pending writes cannot be retargeted. Model chooser adds already imported qualified IDs to the draft with visible nodes; no provider mutation. Shared ModelDialog continues editing the supplier-owned model. Node removal can leave repairable draft routing edges but must not silently substitute models.

Floating controls remain outside canvas hit testing, support narrow wrapping and do not obscure inspector/dialog targets. Preserve 190px/56px/28px geometry and original pointer transforms. Localized removal of old copy does not remove meaningful error/recovery feedback.
