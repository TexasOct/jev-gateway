# Design: per-agent context-window and cache-usage integration

## Boundary

The smallest behavior gap is that JEV has confirmed `context_window` / `max_output_tokens` in its active catalog and forwards most upstream usage, but local agents have no reliable common way to obtain the actual routed model's window, while persisted usage lacks a normalized cache-token contract. The behavior belongs at the catalog/request outcome boundary plus agent-specific integration, not in routing heuristics that would conflate cache savings with context occupancy.

## Proposed architecture

1. **Catalog metadata contract**: Provide a narrow, read-only way for an agent integration to retrieve active model IDs and confirmed limits. Do not change canonical model IDs or imply a single limit for a dynamic strategy. Keep unknown as null.
2. **Resolved request metadata**: At completion, bind usage to the actual resolved `ModelProfile`; provide its ID and limits through the least disruptive supported integration surface. Preserve standard response body semantics. Avoid requiring proprietary headers as the only mechanism; evaluate native model metadata/config and existing API response surfaces, with headers only as optional fallback if Pi requires them.
3. **Usage normalization**: Parse known provider/LiteLLM usage variants into optional cache-read/cache-write token counts while preserving raw response usage. Cache metrics are observability/cost facts, not deductions from context occupancy.
4. **Persistence/cost**: Extend outcome storage only if needed for durable reporting, using backward-compatible SQLite migration and nullable fields. Existing model cache price metadata may be used for cost only when token counts and price are known; do not turn missing usage into zero evidence.
5. **Agent adapters**: Define explicit capabilities and safe configuration ownership. Implement Pi first using Pi's own model definition/extension/compaction lifecycle. Assess Claude Code and Codex independently; distinguish startup config from live session updates. Preserve user config and restore only fields JEV changed.

## Compatibility and privacy

- Keep `/v1/models` current OpenAI-compatible contract unchanged unless verified target-agent behavior justifies an additive field and compatibility review.
- Keep request/response body compatibility and upstream usage fields intact.
- Use existing capture-content and sanitizer controls; never log secrets or expose full messages merely to report cache usage.
- No auto-application of public metadata suggestions; only active confirmed catalog facts are authoritative.

## Out of scope

- Generic rewriting/compaction of Agent conversation history by JEV.
- Treating a policy/strategy name as if it had one fixed context window when candidates vary.
- Blindly editing all installed Agent configuration files or claiming universal runtime hot reload.
- New routing behavior based on cache hit rate.
- Bare upstream-model aliases unless separately specified.

## Files expected (final set depends on codebase validation)

- Backend catalog/gateway/decision/records and focused tests for active limits and usage normalization.
- Pi adapter/extension integration and tests if this repository owns the integration surface; otherwise a documented integration artifact/package boundary.
- Target-agent compatibility docs and API docs.
- Trellis specs only if implementation establishes a durable new contract.
