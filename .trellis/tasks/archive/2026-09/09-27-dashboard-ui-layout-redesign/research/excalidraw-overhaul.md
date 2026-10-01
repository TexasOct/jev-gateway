# Excalidraw-inspired overhaul: planning revision

## User request

Completely redesign the frontend visual language and interactions, with a simple, attractive experience similar to Excalidraw. This supersedes the prior presentation-only iteration. The earlier source edits remain intact and uncommitted; no cleanup, rollback or commit is authorized by this request.

## Reference evidence

Observed https://excalidraw.com in an isolated managed browser. At a 1131×865 viewport the top tool island was 566×48px, positioned 16px from the top, with an 8px radius, white background and layered low-opacity shadows. Selection/hand/rectangle controls measured 40×40px. These are observed reference dimensions, not mandatory JEV values.

The live UI exposes selection, panning and shape tools, a separate menu for export/preferences/language, help, and library. Official UIOptions docs describe customizable tools, menu canvasActions, welcome screen and dockable sidebar breakpoint: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options. These options describe embedding Excalidraw, not a requirement to adopt its package for JEV.

## Proposed direction for review

Use a spacious workspace with small floating control groups and context-sensitive panels. Reduce permanent chrome and nested panel frames; make common actions identifiable and advanced detail available on demand. Keep a coherent light/dark semantic palette and keyboard labels. Follow Excalidraw's workspace and interaction organization without making the gateway a general drawing application or assuming hand-drawn text/rough geometry is appropriate for evidence data.

- Shared shell: compact view switcher, one settings/menu entry, separated contextual actions.
- Monitoring: proposed readable session selector and request summary/detail workspace; do not require graph manipulation merely to inspect evidence. Advanced provider records and raw JSON remain accessible.
- Strategy: canvas-first with selection/panning/tool groups, contextual inspector, explicit draft versus applied policy feedback. Any undo/redo, draft guards, gesture or geometry changes need a reviewed contract before implementation.
- Appearance: settings surface organized around immediate preview and explicit persistence rather than a large primary diagnostic panel.

## Boundaries

Backend routing semantics, credential privacy, evidence meaning and policy validate/review/apply safety remain constraints. Navigation presentation, panel organization and frontend interactions may be redesigned after renewed planning approval. Do not assume implementation approval from this request alone.

## Decision still needed

Should monitoring remain a structured session/request inspector with Excalidraw-like chrome, or should monitoring itself become a node canvas? Recommend the structured inspector: it is quicker to read and requires no canvas skills. A monitoring canvas prioritizes visual exploration but requires a separate spatial-navigation design and stronger mobile/keyboard accommodations.
