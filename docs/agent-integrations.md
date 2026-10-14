# Local agent integrations

JEV Gateway owns model routing, confirmed catalog limits, and provider-reported request usage. Each local agent owns its conversation history, context accounting, and compaction decision. Cache-hit input tokens remain part of model context even when they reduce provider cost or latency.

## Gateway metadata and usage

- `GET /v1/jev/models/metadata` (Bearer-protected) lists the active concrete catalog models and their confirmed `context_window` and `max_output_tokens`. Unknown limits are `null`. Dynamic strategy names are intentionally excluded because one strategy can route to models with different limits.
- Successful chat responses include `X-JEV-Context-Window` and `X-JEV-Max-Output-Tokens` for the selected concrete route. A value of `unknown` means the active catalog has no confirmed value.
- Cache-read/write usage is retained in request evidence only when returned in a recognized upstream usage shape. Missing values remain `null`. Existing OpenAI-compatible response bodies and `/v1/models` schema are unchanged.
- Cache price metadata does not currently alter the legacy input/output cost estimate.

These are JEV integration surfaces, not a universal Agent protocol. A client must explicitly query/consume them.

## Pi

Pi model definitions require a context window and use model metadata for compaction. Configure the selected model with the JEV-confirmed window when the model is fixed. For dynamic JEV strategies, a Pi-owned provider/extension must resolve the actual route and update the active model metadata or use a conservative window across candidates; it must not assume the strategy has one fixed window. The extension must account for the interaction between Pi's pre-request compaction threshold and its discovery of the routed upstream model, so the context window is safe before dispatch as well as refreshed after a route change. Pi's extension compaction lifecycle can own the actual compact decision using Pi's local conversation state. Cache usage is observational and must not be subtracted from context pressure.

This repository currently provides gateway metadata and request evidence only; it does not ship a JEV-owned Pi extension. Pi extension implementation and runtime model-switch/compaction verification are a separate adapter deliverable.

## Claude Code

Claude Code has native model and auto-compact settings. A future adapter may map a fixed JEV model's confirmed window and a chosen compact threshold to those settings. Treat configuration-file/environment synchronization as startup/new-session behavior unless a target-version test proves live-session updates. Do not overwrite unrelated user settings, and record/restore only fields explicitly owned by the adapter.

## Codex CLI

Codex documents `model_context_window` and `model_auto_compact_token_limit` configuration. These are suitable for a Codex-native configuration adapter, but do not prove a running session hot-reloads edits. Until verified, synchronize before launch or for a new session, and preserve user configuration.

## Support levels

Report each Agent's support separately: model catalog discoverable; fixed-model window configured; actual route window observable; cache usage displayed; compact threshold configured; existing-session runtime update verified. Do not advertise a higher level than tests establish. A routing strategy with candidates of different window sizes must either expose the selected model per request or use a conservative effective limit.
