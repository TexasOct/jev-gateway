# Combined-source review and repairs

The independent application review returned `REWORK` for `d4495d6` against baseline `dbcc14f`. The complete original verdict is retained as `final-integration-review.initial.md` in the original runtime evidence directory.

## Legacy gateway credential compatibility

Baseline `catalog._resolve_api_key()` returned `value.strip()`. The combined credential implementation resolves an immutable mapping from process environment, neighboring dotenv and literal JSON values, then returns the raw value. `gateway_from_dict()` rejects whitespace, so an existing padded legacy gateway credential can no longer load. The initialization contract explicitly requires legacy trimming and byte preservation.

The repair preserves source provenance in a read-only mapping. Gateway parsing normalizes surrounding whitespace for legacy dotenv and captured process values, while JSON values remain literal and undergo strict gateway validation. A caller-provided plain mapping keeps literal semantics. The snapshot's raw values, source precedence, shared read lock and immutability stay intact. CLI provider-add candidate validation must retain that provenance when overlaying a pending provider secret.

The repair adds 52 regression cases covering both legacy sources, unchanged files and process state, literal JSON overrides, strict missing/invalid gateway credentials and CLI dry-run/real-add behavior. Before the repair, 12 targeted cases failed. Afterward, 133 credential/CLI cases and 238 related consumer cases passed, as did changed-file Pyright and whitespace checks. The parent inspected the complete seven-file patch, then repeated all 1189 backend cases, full Pyright, freshness, lock, build and package validation successfully. Final installed-wheel acceptance passed 169 checks, and independent repair review returned PASS. After the subsequent sampling repair, complete browser acceptance passed all 243 cases.

## Provider icon browser locator

The initial complete browser run returned 238 passed, one failed and two skipped. `provider-icons.spec.ts:85` used `Credential environment reference`, while the merged `pmEnv` label is `Credential reference`. The assigned correction now uses the current exact accessible label. Its create, save and write assertions are unchanged; all 27 provider-icon cases passed in the next complete run.

## Installed default browser navigation

The next run provided all four live/default URL and home variables and returned 240 passed, one failed and zero skipped. The actual local decision and LLM requests both recorded matching credentials. The installed-default case initialized the gateway successfully, then its unscoped `Provider & models` click matched both the Views navigation and Connection setup action.

The two navigation actions in `credential-default-install.spec.ts` now scope their exact button locator to the `Views` navigation landmark. Assertions for successful setup, authentication, empty fields and browser privacy remain. Active LSP checks of both edited browser files returned zero diagnostics. Final browser acceptance will use a fresh installed package after the backend repair.

The original `final-browser*`, the missing-Chromium launch attempt and `final-browser-complete-acceptance*` evidence are retained separately. No automatic retries or weakened assertions were introduced.

## Review coverage

The initial reviewer found no additional actionable issue in shared setup transactions and bootstrap authorization, strict missing gateway references, initialization preservation, defaults and routing evidence, provider maps/privacy, CLI presets, pending state, secret clearing or native select styling. The subsequent bounded review returned PASS for the seven-file repair and both browser files, confirmed caller provenance, strict credential boundaries, matching specs and unchanged assertions, and found no required code rework. Its verdict is retained as `final-repair-code-review.md`.

## Wide-canvas coordinate sampling

The next full run executed all 241 cases, with 240 passing and one responsive Questions-center hit failing at 2560px. Six diagnostic runs reproduced three stale-point failures: chrome measurement changed the origin by `98.71875px` between the bounding-box read and the hit check. The cached point hit empty canvas; the current center still hit Questions, with zero scrolling and no covering chrome. These reproductions were Chinese/dark; the original full-run English failure's scheme remains unknown.

The responsive test now uses `canvasNodeCenterHit()` to read the current bounds and actual center hit within one synchronous browser evaluation. Measurable-bounds checks, exact Questions hit, native 40x16 drag, all locale/theme/viewport loops and the policy-write assertion remain. Two synthetic regressions cover origin movement and actual overlay rejection. The new regression proves the coordinate invalidation mechanism, without guaranteeing reproduction of Chrome's original timing.

A separate bounded reviewer returned PASS for the helper, regression file, responsive change and corresponding spec paragraph. It confirmed synchronous sampling, serializable/typesafe geometry, actual occlusion detection and unchanged assertions. Its complete verdict is `final-atomic-canvas-code-review.md`; no source rework is required. Sampling after that callback can still observe later movement, so the retained native drag assertion remains necessary. Frontend lint, application/browser TypeScript, active LSP and all 311 units passed after the repair. Focused acceptance passed 32/32 instances, and the full original command passed 243/243 cases once, with zero failures/skips/retries. Both credential integrations and all icon cases passed; package/static parity and owned-service cleanup passed. These execution results are separate from the read-only code verdict.
