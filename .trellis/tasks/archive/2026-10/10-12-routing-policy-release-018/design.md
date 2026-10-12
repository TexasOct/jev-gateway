# Optional baseline policy compatibility

`catalog_from_document()` accepts an absent or null global policy for wrapped `strategies.default/definitions` catalogs. Each wrapped definition supplies its own policy. The v2 branch of `merge_overlay()` instead parses a missing policy as `{}`, invoking the legacy three-tier requirement before it can use those definitions.

Make v2 merge parse a non-null explicit baseline policy and otherwise pass `None` to `strategies_from_document()`, following the existing catalog parser. Keep explicit-policy validation and compact-catalog requirements intact. Avoid new parsing abstractions or artificial operator configuration changes.

The production seam is `jev_gateway/routing_overlay.py`. Regression coverage belongs in `tests/test_routing_overlay.py` and `tests/test_strategy_state.py`. The parser invariant belongs in `.trellis/spec/backend/dashboard-routing-config.md`. Release preparation changes only `pyproject.toml`, `jev_gateway/__init__.py`, and the root project version in `uv.lock`.

One implementation writer owns this seam in a persistent isolated worktree. A fresh checker reviews the complete frozen candidate. Parent owns version preparation, integration, signing, publication, and bookkeeping. Keep all logs, raw receipts, synthetic credentials, and recovery material private; publish concise acceptance records only.

The current operator installation remains 0.1.7. Release rollback uses a prior published version; existing tags and assets are never overwritten. A local upgrade to 0.1.8 requires a separate request.
