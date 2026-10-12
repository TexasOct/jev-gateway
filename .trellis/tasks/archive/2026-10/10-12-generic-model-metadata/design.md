# Generic catalog applicability

## Behavior and ownership

The behavior gap lives in `MetadataClient.lookup()` in `jev_gateway/model_metadata.py`. It currently uses `_serving_matches()` for all public candidates, so a proxy discards every automatic field even when public catalog identity matching succeeds.

Separate generic catalog identity/transport applicability from endpoint-specific serving applicability. Use the former for Models.dev provider rows, their permitted canonical nonprice fallbacks, and LiteLLM static fallback rows. Keep strict endpoint matching where the source selection itself is endpoint-bound, including the OpenRouter native public API. Reuse existing transport compatibility rules rather than duplicating provider policy across consumers.

The generic source must still match the chosen source provider and exact upstream ID. Display names, icons, similar IDs and unlinked canonical names do not identify a model. Host mismatch alone must not produce a warning that describes otherwise applicable generic evidence as unusable.

## Evidence and consumers

Keep the existing response and persistence envelope shape. `applicable` means that a source may supply an automatic suggestion under the user's generic standard; it does not assert that a proxy charges the public rate. Sources, timestamps, canonical IDs, declared fields and conditional prices remain inspectable.

Leave source merging, provider-over-canonical precedence, independent conflict detection, field normalization and credential handling in their current owners. Canonical base prices remain excluded. Explicit false, zero and empty effort lists remain distinct from unknown. `structured_output` remains evidence and does not populate `json_mode`.

The frontend already fills only known applicable suggestions and skips touched fields. Verify this path with a focused regression. Change production frontend code only if the existing behavior prevents the approved rule or presents a contradictory contract; avoid introducing an additional trust toggle or adoption step.

## Expected changed files

- `jev_gateway/model_metadata.py`: generic applicability and warning/source selection.
- Metadata, business-oracle and provider-onboarding tests: replace old proxy reference-only expectations and prove exact identity, conflict, unknown and HTTP/envelope behavior.
- Focused provider frontend tests and, if needed, one browser regression: automatic prefill plus manual-field protection.
- `.trellis/spec/backend/provider-configuration.md`, `docs/http-api.md`, `docs/models-config.md`, and any directly contradictory product wording: describe generic prices and explicit parameter suggestions.

## Compatibility and rollout

Existing manual fields retain ownership and values. Existing saved evidence is not rewritten merely by changing the lookup policy. Refresh yields current generic suggestions for untouched fields. Network targets, credential boundaries, configuration schemas and serving behavior stay compatible.

This source delivery does not replace the running 0.1.6 installation. A later authorized installation must use a verified package and the operator recovery procedure. Rollback of this task is the scoped source diff; retain the independent worktree and original command receipts until delivery is accepted.
