# Implementation baseline

This task started its full-overhaul execution with the earlier presentation iteration still uncommitted. `git status --porcelain` showed `.trellis/spec/backend/dashboard-routing-config.md`, `frontend/src/{App.tsx,i18n.tsx,styles.css}`, `frontend/src/config/RoutingEditor.tsx`, and `frontend/src/monitoring/VirtualList.tsx` modified, plus the task directory and new monitoring/appearance/presentation files untracked. None were reset or discarded.

Before Tailwind installation the relevant SHA256 values were:

| File | SHA256 |
| --- | --- |
| `frontend/src/App.tsx` | `0a0ca559b93f16eb8507c2556e3bd37d42fdc2bbf88a24cf5c4359cfbb24d614` |
| `frontend/src/styles.css` | `640a4e37e936dcee533fd9e523f6a1c2a1aed144389c5ab0fc06625afbb040a1` |
| `frontend/src/i18n.tsx` | `af5debfde5012e89a97aefbda9445a673fe28d45175bea28f617002aa7b2f562` |
| `frontend/src/config/RoutingEditor.tsx` | `0fc6a6a6029067358c91c2ca1fb7de9bd2472f8389e8453ae13e3f8faba39e4b` |
| `frontend/src/config/RoutingCanvas.tsx` | `143f6ec41c46d48bb1c69278db3fd62bb194332458b20eb4980c770594e0256b` |
| `frontend/src/monitoring/MonitoringView.tsx` | `faa055d856d0b0d87a17ae58602804d946e527f1687eccd0c3b80df8e8395985` |
| `frontend/src/appearance/AppearanceView.tsx` | `529367a95351f3005d2a14b62140765d1ef46cadd11162346e71ddf392e765eb` |

Prior isolated fixture captures in the task's earlier iteration covered monitoring/appearance/strategy at desktop and 390/320 widths in both schemes; those verify the earlier source, not the new Tailwind integration. A fresh browser matrix is still required after full integration.

The first execution slice installed Tailwind's Vite plugin, imported theme/utilities without Preflight, and mapped semantic color names. During the next migration pass, browser inspection found legacy global rules and native UA button styles colliding with layered Tailwind utilities. Remove migrated selectors as each view moves to utilities, and define a deliberate component-control base for untouched controls; do not re-enable broad Preflight because it resets existing form/table/canvas behavior. Frontend lint (0 errors, four existing `i18n.tsx` warnings), 137 tests, TypeScript/Vite build, bundle freshness and `git diff --check` passed after the initial integration slice. Continue to verify computed styles in the browser, not just generated class names.
