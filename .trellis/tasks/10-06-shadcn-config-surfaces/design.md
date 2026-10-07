# Configuration surfaces design

Own presentation under `features/settings`, `features/appearance`, `features/providers/suppliers` and `features/providers/models`. Use exact files listed in the parent migration map, confirming current locations before edits. AppShell and ConnectionPage remain parent-owned.

Group existing fields by their current business responsibility. Use shared labels/help/inputs/native selects, restrained Card sections and Alert feedback. Normalize action placement and spacing while keeping current progressive disclosure and embedded supplier-owned model lists. Preserve the 768px settings/supplier content bound and responsive wrapping.

Existing hooks/props remain the API/draft authority. Forward callbacks and raw sentinel values; do not normalize unknown capabilities, null limits, credential actions or empty numeric drafts in presentation wrappers. Model source evidence and automatic/manual status stay visible. No new nested dialog or separate model list destination is added.

Keep native color control input/change ordering and saved/custom selection. Preserve supplier search/kind/edit dirty guards, local operation/error ownership and per-supplier query response scope. The current shared Dialog owns accepted modal behavior; feature guards still decide close/save/discard.

Acceptance includes configuration success and failure/pending/permission states, both locales/schemes, long names and dense import at desktop/narrow widths. Shared-file fixes are requested from the primitive/foundation owner and integrated once.
