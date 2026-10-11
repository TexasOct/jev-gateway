# 0.1.6 model imports and strategy workflow

## Goal

Implement the operator's three requested changes and publish stable 0.1.6 after verification. The operator explicitly requested construction now; this authorizes task creation, implementation, checks, commits, pushing and publication without another planning-approval round.

## Requirements

- R1: Importing a model does not require every basic parameter. Identity and supplier ownership remain required. Omitted capabilities, reasoning efforts, token limits and prices stay unknown/omitted. Provided values still obey existing domains; false, zero, empty lists and explicit null retain their distinct meanings. Subsequent model editing preserves incomplete records and existing evidence/source choices.
- R2: Each workflow strategy contains only its explicitly selected model nodes. Add nodes by choosing imported supplier models. Remove a node only from that strategy and its references; keep the supplier model and other strategies. Persist strategy selection and restrict runtime policy candidates to that selection. Old configurations initialize nodes from actual policy references, never the entire catalog.
- R3: Support switching, adding and deleting named editable workflow strategies. Persist independent strategy policy and layout data. Preserve old v1 overlay/layout loading and default no-query API behavior. Protect the runtime default and reject invalid names/references. Guard unsaved work and asynchronous requests across switches.
- R4: Remove canvas information, advanced editing, original canvas footer and the old workflow copy at top left/right. Put strategy switch/add/delete at top left, and save/review/reset and canvas tools in a compact bottom-right floating panel. Keep node inspection, model editing, rules/connections, undo/redo, draft review, dirty/pending/readonly/auth/error guards and keyboard/focus access.
- R5: Preserve B presentation, themes/locales, native controls, 190/56/28 node geometry, pointer transforms, existing unrelated provider/credential/Monitoring behavior and source provenance. Update affected specs/docs and meaningful regression tests.
- R6: Release 0.1.6 through the existing hosted build and Ubuntu/macOS installed-smoke workflow. Verify stable public metadata, exact source/tag and four public assets. This request does not request another operator installation.

## Task map

1. `10-11-model-optional-016`: R1, frontend/backend model import contract and tests.
2. `10-11-strategy-state-016`: R2/R3 durable backend, API types/client and pure draft/graph state.
3. `10-11-workflow-controls-016`: R2-R4 interaction and UI, admitted after task 2.
4. Parent integration: R5/R6, complete affected validation, independent final review, archive/commit and release.

## Acceptance criteria

- A1: Minimal and partially populated models import and reopen without invented confirmations; invalid supplied values fail before writes. Model edits preserve missing fields and existing valid legacy data.
- A2: Unselected models never render as nodes or become runtime candidates; add/remove, undo/redo and save/reload affect only the selected strategy. Legacy referenced models are retained.
- A3: Create/switch/delete survives reload, preserves other strategies and global supplier models, and protects the default. Unknown/duplicate/reserved names and dangling references fail safely.
- A4: Separate policies/layouts/history and stale-response guards prevent cross-strategy writes; v1 data remains readable and no-query legacy callers continue working.
- A5: Requested copy/advanced/footer are absent; strategy controls and floating actions work at desktop and 320/390px widths, in English/Chinese and light/dark, without blocking node targets or dialog focus.
- A6: Existing native guards, credentials, model sources, canvas geometry and auth suspension retain meaningful coverage. Obsolete presentation assertions are updated to the new controls, without dropping business assertions.
- A7: Source-bound focused tests, complete frontend units/browser checks, relevant/full backend gates, lint/types/build/package and changed-path native LSP establish the final candidate. Keep failed receipts and skips accurately scoped.
- A8: Stable v0.1.6 references the accepted committed source; release workflow succeeds and public installer/wheel/checksums match. Preserve v0.1.5 tag and operator runtime data.
