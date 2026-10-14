# Multi-agent model context and cache usage support

## Goal
Enable local coding agents to use accurate active-model context-window limits and upstream-reported cache usage to make their own compaction decisions, using each agent's native integration mechanism where possible. This task begins with a source-backed adapter design and a Pi-first implementation only where the repository owns a viable integration surface. Claude Code and Codex receive evidence-based feasibility and support-level plans, not unsupported claims of runtime hot reload.

## Requirements
- Preserve JEV's existing model identity and routing semantics.
- Expose confirmed active model metadata (`context_window`, `max_output_tokens`) in a way compatible with an agent adapter; unknown remains unknown.
- For routed requests, make the actual selected model and its context limits available to supported integrations without breaking OpenAI-compatible response bodies.
- Preserve upstream cache usage fields where available and normalize supported cache-read/cache-write usage for records/observability without fabricating missing values.
- Treat cache-hit tokens as still occupying model context; never subtract them from context pressure.
- Support safe, reversible, narrowly scoped local-agent configuration changes only for explicitly supported fields; distinguish startup-only config from runtime updates.
- Implement and verify Pi integration first. Document capability-based extension points and evidence-based feasibility for Claude Code and Codex.
- Preserve existing privacy/capture-content and credential-sanitization behavior.

## Acceptance criteria
- Tests prove active model metadata is sourced from the loaded catalog and accurately identifies the actual selected model for a routed request.
- Tests prove cache usage is preserved/normalized for supported upstream shapes, absent values remain unknown, and legacy usage/cost behavior remains compatible.
- Tests prove cache hits do not reduce context-window usage calculations.
- Pi adapter/integration has a testable path for model window, request usage/cache usage, current context pressure, and native compaction decision; any runtime limitations are explicit.
- Claude Code and Codex support claims are documented with per-agent configuration source, update timing, reversibility, and verified limitations; no claim of cross-agent hot reload absent proof.
- Existing OpenAI-compatible behavior and all relevant backend tests pass.
- Documentation explains data ownership: JEV owns catalog limits and upstream usage; each agent owns its local conversation state and compaction decision.

## Accepted delivery boundary

The user reviewed the completed gateway-only implementation and explicitly
authorized committing it and publishing 0.1.9. This task closes the metadata,
selected-route headers, nullable cache evidence, compatibility migrations and
agent integration documentation. There is no product-owned Pi extension in this
repository. Native compaction and direct local-agent configuration writers are
deferred to a separately owned adapter package; their original acceptance items
are not claimed delivered by this gateway release.
