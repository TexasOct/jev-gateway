# Signed delivery plan

The user's fix-and-publish instruction authorizes these commits and the subsequent tag/main push. No unrelated changes are admitted.

1. `fix(routing): preserve optional baseline policies in workflow edits`
   - `jev_gateway/routing_overlay.py`
   - `tests/test_routing_overlay.py`
   - `tests/test_strategy_state.py`
   - `.trellis/spec/backend/dashboard-routing-config.md`
2. `chore(release): prepare 0.1.8`
   - `pyproject.toml`
   - `jev_gateway/__init__.py`
   - `uv.lock` (root project version only)
3. `chore(trellis): archive verified 0.1.8 release`
   - Explicit public task/archive records after actual publication acceptance.
4. `chore(workspace): record verified 0.1.8 publication`
   - Owned workspace journal/index append and final acceptance metadata.

Keep private evidence, original failures, runtime data, ignored scripts, and raw sessions outside commits. The signed annotated `v0.1.8` tag targets commit 2 and stays there while bookkeeping advances main. Preserve configured signing and hooks.
