# Implementation plan and progress

- [x] Confirm repository boundary: gateway only; no JEV-owned Pi extension exists here.
- [x] Add protected active concrete-model metadata endpoint and actual selected route window in decision metadata / chat response headers, leaving OpenAI `/v1/models` and response body unchanged.
- [x] Normalize common OpenAI (`prompt_tokens_details.cached_tokens`, `input_tokens_details.cached_tokens`) and Anthropic (`cache_read_input_tokens`, `cache_creation_input_tokens`) usage fields into optional cache read/write outcome values.
- [x] Add backward-compatible SQLite outcome-column migration, decision evidence projection, session request evidence projection, and regression coverage.
- [x] Document Pi / Claude Code / Codex integration support boundaries and avoid claiming that gateway fields alone implement runtime compaction.
- [x] Verify focused test set and Pyright.
- [x] Verify the complete backend test suite after concurrent repository work settled.
- [x] Run the complete backend suite after rechecking repository state: 3349 passed, 2 skipped; the earlier unrelated failures were caused by overlapping in-progress decision-routing work and passed once that concurrent work settled.

## Explicit scope limitation

The user requested Pi-first behavior, but this repository has no product-owned Pi extension source or package. Existing `.pi/**` integration is Trellis-managed and must not be altered. The gateway now provides discoverable active model metadata, actual route headers, and cache usage evidence for an adapter to consume. A true Pi runtime provider/compaction adapter and direct Claude Code/Codex configuration writers remain a separate deliverable requiring an owned agent-adapter package and agent runtime tests.

## Validation

- `.venv/bin/python -m pytest -q tests/test_records.py tests/test_decision.py tests/test_gateway.py tests/test_stream_evidence.py` — 181 passed.
- `.venv/bin/python -m pytest -q` — 3349 passed, 2 skipped.
- `uvx pyright` — 0 errors, 0 warnings, 0 informations.
- `git diff --check` scoped to task-owned implementation/docs/tests — passed. An unscoped check reports trailing whitespace in an unrelated pre-existing frontend localization edit; that file was not changed here.
