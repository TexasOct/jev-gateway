# Implementation

- [x] Inspect the installed service, three model IDs/capabilities and configured
  decision provider; retain a safe inventory and preservation digests.
- [x] Write `strategy.json`, a secret-free, reproducible v2 workflow payload.
- [x] Validate and exhaust the 24 task/complexity combinations plus invalid/
  unavailable classification using the installed catalog and strategy engine.
- [x] Validate through the authenticated management owner and apply the new
  workflow, keeping its actual name and all other workflow ownership intact.
- [x] Run bounded live synthetic previews, then reload and verify persistence,
  model-list visibility, service health and data/configuration preservation.
- [x] Record native receipts and final acceptance, reviewing whether any new
  executable project convention warrants a spec update.

## Validation scope

This is configuration-only work against the unchanged installed engine. Use
the real strict parser/registry and substantive routing assertions for this
policy, rather than replaying the accepted release's full source/UI suites.
Synthetic classifier previews may call the already configured provider; no
chat generation or private user prompt is needed for acceptance.

## Result

Accepted and installed through scoped APIs. See `acceptance.md`. Runtime source,
frontend, dependencies and versions were unchanged; repository commits and task
archival are separate bookkeeping from the completed local configuration write.
