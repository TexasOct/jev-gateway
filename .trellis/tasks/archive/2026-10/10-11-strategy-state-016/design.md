# State seam

Follow the parent design. Extend routing_overlay.py, canvas_layout.py, gateway routing closures, catalog/strategy registry/policy candidate filtering and existing protected transaction helpers where required. No separate supplier record store. Preserve reload locks, auth and atomic rollback. Reconcile provider deletion references without rewriting unrelated supplier data.

Own shared API types/client and routing model helpers/tests necessary to consume the selected IDs and named state. The existing configuration model library remains available; graph projection filters it. The next UI child consumes this handoff and places interactions. Read actual factory/validator signatures before choosing a minimal v2 wire shape, then document the completed shape/API in the handoff and product specs.

Legacy v1 global model tag/priority overrides survive migration; new pool edits are explicit strategy-local references. Policy candidates, default and fallback must obey explicit selection. New empty strategies are editable and cannot silently route outside their selection.
