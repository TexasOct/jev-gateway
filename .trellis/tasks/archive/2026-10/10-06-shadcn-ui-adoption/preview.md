# Design preview review

The operator requested preview samples before construction, then selected B for all surfaces with the instruction “全部按照B类来进行施工”. Preview review is complete and construction is authorized. The three original samples remain available for comparison; B is the implementation reference.

## Preview boundary

The standalone mockup lives in `research/preview/index.html`. The sample gallery is `research/preview/gallery.html`. Open either directly in a browser, or run `python3 .trellis/tasks/10-06-shadcn-ui-adoption/research/preview/serve-preview.py` from the repository root and use the printed local address. It uses synthetic data and local assets, makes no gateway calls, and stores no configuration. Its actions demonstrate presentation rather than production behavior.

The current source baseline is `8352e4b`, following the operator-directed `0.1.4` admin delivery and archive. The archived parent records verification exceptions and `acceptance_complete: false`; the preview does not turn those historical exceptions into a PASS.

## Samples

Four existing destinations are represented: Monitoring, Strategy workflow, Suppliers, and Settings. Models remain under their supplier. Model editing, supplier editing, and model discovery/import have demonstration overlays.

Three presentation options share the agreed neutral surfaces and blue emphasis:

| Variant | Presentation | Main comparison |
| --- | --- | --- |
| A | Grouped panels | Separate supplier and settings sections with clear panel boundaries. |
| B | Lightweight lists | Flat supplier rows and settings sections with separators and fewer containers. |
| C | Compact workspace | A shared supplier list surface and settings labels beside field groups on desktop. |

Workflow node dimensions remain 190px wide with 56px headers and 28px output rows. Workflow variations share the same geometry. Monitoring samples retain 132px session rows and 360px request blocks. The prototype illustrates layout and does not reproduce the production canvas engine or virtual-list implementation.

Use the bottom controls to switch variants, light/dark, Chinese/English, and normal/loading/error/read-only/saving states. Arrow keys switch variants when a form field is not focused. Query parameters preserve the chosen view when a link is reopened.

## Review scope

Review section boundaries, form hierarchy, control density, neutral surfaces, blue emphasis, model rows, editor layout, and narrow-screen readability. Feedback can combine elements from different variants. Production interaction and acceptance remain governed by the task requirements and original regression suites.

## Preview verification

The browser rendered 144 combinations: four pages, three presentation variants, two themes, two locales, and widths of 1440px, 390px and 320px. The final render found no document overflow, JavaScript errors, failed image loads or external network requests. The narrow model editor measured 366px within a 390px viewport; its footer remained within the visible height. Preview variant, theme, locale and retry controls were exercised.

There are 24 sample screenshots under `research/preview/screenshots/`, plus the gallery overview. The gallery returned HTTP 200 and all 13 thumbnail images loaded. Representative desktop, dark, compact, flat-list, monitoring, narrow workflow and narrow editor screenshots were inspected. The initial narrow English navigation and modal-width failures are retained in `research/preview/initial-render-receipt.json`; the corrected results are in `research/preview/render-receipt.json`.

The icon files and pinned source manifest are copied from the existing supplier assets, with `assets/LICENSE-lobe-icons.txt`. The files are design artifacts, not production shadcn registry components. No product acceptance tests or official CLI installation were run for this preview.
