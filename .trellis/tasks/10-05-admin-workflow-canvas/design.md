# Design

Extend RoutingCanvas/RoutingEditor and pure model helpers. Treat current supported creatable nodes according to graph semantics: add routing rules and supported editable question configuration through existing helpers; explain fixed questions/fallback/pools/catalog models where arbitrary addition/deletion is invalid. Use the existing inverse viewport mapping and unscaled overlays for context actions. Store bounded history of semantic draft and layout together, including selection, with remount/save boundaries and stale gesture protection.

Own routing feature files and new canvas tests. Avoid shell/API/metadata code; expose optional onDirtyChange to the parent for navigation protection. Existing inline JSON/question editing must stay synchronized with draft and identify parse/validation errors. Read the output/connection restrictions in the Dashboard spec before mutation.
