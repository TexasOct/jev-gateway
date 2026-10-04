# Select and provider-icon integration boundaries

## Select tip `e7ace7c`

The runtime delta is small: add `items-start` to the provider form's two-column grid, keep unlayered native-select right padding and arrow geometry in `frontend/src/styles/base.css`, and add `select-controls.spec.ts` for viewport/locale/theme geometry, keyboard/focus, disabled, listbox, and forced-colors behavior. Preserve these changes when the later icon branch replaces provider-form sections.

Temporary commit `99a18f7` integrates that tip over credential integration `79717f0`. Application changes merged automatically; only the workspace index needed resolution. All seven complete journal sessions remain, and the index reflects 237 journal lines. Browser-test TypeScript and source/document whitespace checks pass. Five archived raw verification logs retain their original bytes, including original trailing whitespace; their staged blobs were compared exactly to `e7ace7c`. These evidence artifacts are excluded from source whitespace checks, and the exception must stay visible in the final review.

## Provider-icon tip `afdfa49`

The committed icon/preset branch adds packaged SVG assets and provenance, independent icon selection, a shared preset registry, account/project setup fields, and CLI parity. Its API additions include `ProviderSetupField`, richer `ProviderPreset` metadata, and `ProviderProfile.params` values typed as `JsonValue` rather than only redaction placeholders.

CLI argparse preset choices come from `provider_presets.PRESETS`. New `--param` and `--param-env` assignments are parsed by `_provider_assignments`; secret capture should occur interactively only when a key reference is declared. Local no-key presets must remain usable. When combining this with the credential branch, retain JSON-managed secret writes, immutable credential snapshots, shared-reference guards, and the release global-default setup flags.

The final provider form must combine gateway/bootstrap capability, icons/preset setup fields, credential privacy, and native select alignment. The shared API type merge must keep setup/global-default and managed-gateway fields alongside the icon/preset additions. No uncommitted verification-worktree files should be used as source.

## Verified parameter preservation

The current public `ProviderProfile.as_dict()` redacts every literal `params` value as `[configured]`, including non-secret values, and returns `param_env` reference names without their resolved values. The parent verified the committed icon tip with `git show afdfa49:<path>`: `profileForWrite()` omits both parameter maps, `openEditor()` gives an existing provider no preset template, and `setupForWrite(null, ...)` adds no maps. Backend upsert copies each omitted map from the persisted existing provider and rejects redaction markers. Preserve this omission path and backend copy behavior so icon-only edits retain literal parameters and environment references without attempting to save placeholders.

## Combined metadata review

The icon merge had four textual conflicts: the provider form, CLI entry point, backend guide index, and workspace index. The parent combined both indexes and repaired an automatic journal merge that had interleaved the release, credential, select, and icon session bodies. All 21 comparisons against the five recorded source histories now preserve complete session bytes, excluding blank separators. The combined journal has eight complete sessions and 282 lines; its index matches. README heading/code/link parity, all 81 checked relative links, and all 477 JSONL targets pass. The failed pre-repair report is retained as `combined-doc-check-before-journal-repair.json`; the passing report is `combined-doc-check.json` in the original runtime state directory. Application-code conflict resolutions and final gates are still pending.
