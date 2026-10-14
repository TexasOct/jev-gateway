# Execution

1. [x] Preserve primary staged/working source and commit the reviewed metadata task.
   Release review additionally reproduced an invalid/null cache count becoming
   zero (two failing regression cases). The correction uses an invalid sentinel
   for optional parsing and preserves real zero; all original cost logic remains.
2. [x] Align versions, document release scope, archive completed construction tasks.
3. [x] Run isolated application gates, build and validate the exact versioned wheel.
4. [x] Run isolated macOS installed-wheel smoke and final source review.
5. [ ] Commit/sign, fast-forward main preserving unrelated staging, tag and push.
6. [ ] Inspect actual hosted build and both same-wheel smoke outcomes.
7. [ ] Download and verify the four pinned public assets and stable/latest identity.
8. [ ] Run the isolated public installer, close A8, archive release bookkeeping and push it without moving the tag.

## Local acceptance

All native gate exits are zero: backend 3362 passed / 2 skipped; frontend 432
passed; browser preview 784 passed / 2 skipped and separate supplier-cloud 9
passed; Pyright zero errors/warnings; frontend/browser types, lint, build, bundle
freshness, uv lock, package and release validator pass. Lint retains four existing
Fast Refresh warnings. Isolated macOS installed-wheel smoke has success true and
169 checks. Product and browser-test source reviews each returned independent
PASS. Application-input hashes are unchanged after their respective freezes.

The original full browser run failed 17 stale single-selector/height assertions
and one keyboard action before canvas readiness. The selector now targets its
accessible Strategy name; layout verification retains viewport/hit/keyboard
invariants while checking both selectors and explanatory text. Screen reentry
waits for the loaded canvas edit control. The full corrected native run passed.
The single-scenario reproduction alone passed and is not called a deterministic
failure reproduction. Original failure logs, review snapshots and subsequent
native exits remain in private durable release evidence, alongside the temporary
directory and runner-argument setup failures. No raw logs enter this commit.

Hosted/public acceptance A5–A8 remains pending at construction commit time.
