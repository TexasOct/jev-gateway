# Global default and initialization integration review

Historical review of the 09:43 UTC source identified by the fingerprints below.
R1-R4 were subsequently repaired and rechecked in
`backend-source-stream-rework.md`, `global-route-ui-rework.md` and
`final-rework-review.md`. The latter found two additional scoped P2 items;
`implicit-layout-rework.md` records the frontend follow-up. Coverage gaps and
publication/reinstallation requirements below remain acceptance obligations
until supported by their own final evidence. A delayed completion notification
does not identify this report as a review of later source.

Verdict: REWORK for the reviewed integration. Four concrete defects remain below. This verdict concerns the current source and synthetic reproductions. It does not certify the parent’s full suites, native browser acceptance, installed wheels or public publication.

Reviewed on 2026-10-02 at 09:43 UTC against dirty working-tree source on `fix/v0.1.0-macos-release`, HEAD `16929b38d780bd04385fecb9aaa76d824acf04c7`. Product source, tests and generated assets were read-only. The reviewer created only this report. No commit, push, API mutation, real credential/configuration access or upstream probe was performed. Full suites were not rerun.

## Findings requiring rework

### R1: Setup changes untouched dotenv record bytes (P2)

Exact sites: `jev_gateway/provider_config.py:106-114` (`env_update`) and its new setup caller at `jev_gateway/setup.py:73`. Provider credential SET/CLEAR also calls it at `provider_config.py:274`.

The helper decodes the entire file, calls `splitlines()`, then rebuilds every record with LF and a final newline. Adding the management assignment consequently changes existing CRLF records and a missing final newline. The current goal requires preservation of bytes outside the selected modification. This is an existing helper limitation exposed by the new initialization path.

Reproduction executed against the actual `ManagementSetup.configure`, using a temporary directory, the packaged empty template, `external={}` and fake credentials:

1. Write `.env` as `b"# keep exact record bytes\r\nLEGACY_KEY='  fake-padded-legacy  '\r\n\r\n"`.
2. Read the setup revision and configure `fake-review-management-key`.
3. Compare the existing prefix and line endings.

Observed results:

```text
actual_setup_preserves_unmodified_env_prefix: False
actual_setup_backup_preserves_original: True
actual_setup_legacy_value_unchanged: True
actual_setup_CRLF_count_before_after: 3 0
```

The old secret’s parsed value survives, but its record bytes do not. The backup retains the original, so this is not credential loss or failed rollback. Preserve unaffected records, their line endings and ordering when adding/removing the selected assignment. Add a setup regression with CRLF and an existing file without a final newline; the current preservation cases use LF.

### R2: Escalation discards the global-default selection flag (P2)

Exact site: `jev_gateway/strategy/policy.py:250-255`, inside `_escalation_candidate`. It creates a new `Selection` with profile, effective tier and relaxed state but omits `defaulted=candidate.defaulted`. The consumer at `policy.py:129-132` therefore cannot append `empty_tag_default` evidence.

Reproduction executed with the existing synthetic `tests.helpers.catalog_document` builder and an injected fake credential mapping:

- Mode `escalate`.
- Ordered labels: `baseline` explicitly contains `SMALL_MODEL_ID`; `missing` resolves an empty tag.
- `defaults.default_model = LARGE_MODEL_ID`.
- Session route/tier: `SMALL_MODEL_ID` / `baseline`.
- Set `consecutive_truncations = 2`, then decide the next turn.

Observed:

```text
StrategyOutcome(
  model='large-provider/vendor/large-model', tier='default',
  reason='output_truncated', mode='auto',
  switched_from='small-provider/vendor/small-model', blocked_by=None
)
```

The model and final tier are correct. The reason omits the empty-tag/global source, even though this selection reached an empty pool. Expected evidence includes both `output_truncated` and `empty_tag_default`. `gateway.py:299` forwards this reason to `X-JEV-Reason`; `decision.py` also stores it unchanged in decision and session evidence. Preserve the flag when rebuilding the selection and cover escalation into an empty pool, including a matrix strategy’s rule prefix. Existing escalation coverage switches into a populated label and does not exercise this branch.

### R3: Configured-route displays omit the usable global path (P2)

Exact sites:

- `jev_gateway/gateway.py:1010-1040`: routing configuration returns labels/models but no global-default reference.
- `frontend/src/shared/api/types.ts:50`: `ConfigurationPayload` has no defaults field.
- `frontend/src/features/routing/model/draft.ts:340-358`: `workflowEdges` emits only membership edges.
- `frontend/src/features/routing/model/configured-route-flow.ts:50-65`: branch models are derived only from those edges.
- `frontend/src/features/routing/ConfiguredRouteFlow.tsx:117`: an empty branch displays “No configured pool members”.
- `frontend/src/features/monitoring/model/route-activity.ts:63-85`: `configuredModels` ignores `PolicyCatalog.defaults.default_model`.
- `frontend/src/features/monitoring/components/StrategyDistribution.tsx:100`: those models supply configured route destinations.

Reproduction executed by importing the actual pure TypeScript functions in the sandbox. Fixture: one built-in strategy with an empty `task_aware/missing` pool, one untagged model `fixture/global-model`, and `defaults.default_model` set to that model. A rule and fallback both select `missing`.

Observed:

```text
configuredModels(strategy, catalog): []
routeDestinations([], [], configuredModels(...)): []
configured branch models:
  [{id:"rule-0",label:"missing",models:[]},
   {id:"fallback",label:"missing",models:[]}]
whiteboard pool edges: []
```

The production routing configuration supplies even less information than that fixture because it omits defaults entirely. Setup can report routing ready and API preview can choose the global model, while the configured preview and whiteboard show no path to it. Monitoring initially omits it, then calls it only “Selected” or “Activity” once observed, because it is absent from configured possibilities.

Expose the inherited fallback to these read-only explanations and distinguish it from actual tag membership. Keep model-assignment writes under the existing overlay contract. Render its final result as Default/默认 without relabeling the matched rule. The current global-default browser spec exercises Settings; it does not cover these configured-path surfaces.

### R4: A configured literal `default` label is translated as the reserved outcome (P2)

Exact site: `frontend/src/shared/i18n/route-label.ts:3-4`. `formatRouteLabel` maps every string equal to `default` to the reserved result copy. Actual consumers are `SessionInspector.tsx:143`, `SessionInspector.tsx:212` and `RouteTrace.tsx:57`.

The parent’s `_select` correction preserves a configured literal `default` label and its normal pool. Its first-turn result is `tier='default', reason='first_turn_default'`. A different empty label using the global model also produces `tier='default'`, with `reason='empty_tag_default'`. The formatter receives only the label and cannot distinguish them.

Reproduction executed:

```text
formatRouteLabel("default", () => "默认"): 默认
```

This changes the user-defined label’s literal name in monitoring, while the strategy editor retains `default`. The design explicitly requires user-defined labels to keep their literal names. Carry enough outcome/source context to localize the reserved fallback without translating the configured label. Add a bilingual rendering regression with both outcomes in the same catalog; existing UI cases check only reserved fallback results.

## Source contracts that held in this review

- `CatalogDefaults`, its parser, `Catalog.validate`, `as_dict` and routing snapshots are connected. Omission/empty object/null field yield unset. Explicit null object, unknown fields, wrong types and dangling canonical IDs reject. The new dataclass field is appended with a default factory.
- Provider configuration safely projects defaults and applies `set_default_model` through the existing revisioned baseline/effective validation, injected credential snapshot, registry preparation and recoverable replacement. Validation does not activate. It does not put defaults into the routing overlay or change `.env` for a default-only operation.
- CLI addition seeds omitted provider/model arrays in memory and still rejects explicit invalid shapes. Forced provider deletion guards the global model reference before modifying files.
- The packaged template contains the three strategy plans, runtime/storage settings and disabled decision settings, with no provider/model instances or credential assignments. Quality/economy retain omitted kind, which resolves to auto; the registry can still select decision-backed behavior later.
- Absent-file initialization uses the shared configuration lock, preserves existing files and unresolved recovery protection, and stays independent of install provenance. Default foreground loading calls it; explicit missing paths keep strict errors.
- Setup validates new keys as 16..8192 printable ASCII without outer whitespace. Gateway key resolution retains legacy trimming. Connect trims old pasted padding. The local HTTP check requires loopback peer/Host, exact supplied Origin and rejects forwarding headers. The transaction rechecks key absence, references and revision before replacement; protected recovery material and restore callbacks remain in use. CLI setup does not import the gateway.
- Empty catalogs fail before strategy execution in the engine and HTTP chat/preview guards. Empty matched pools use exactly the global model and raise the shared `SetupIncompleteError` when it is unset. Assigned pools retain normal capability widening. Matrix selection retains its matched rule prefix, and fresh mode can change final label without changing the model.
- The literal configured `default` selection fix and its capability-widening regression are present. The transient `Selection.defaulted` flag distinguishes initial selection internally; R2 and R4 identify places where that distinction is subsequently lost.
- Settings uses the existing provider-management owner, revision, write capability, pending lock, error/retry behavior and catalog refresh. Appearance stays independent. Setup permits immediate console access with optional later provider/model configuration; browser credentials stay in the API client’s module memory.
- Preview/decision serialization, response headers, best-effort decision records and session updates consume the strategy’s final tier. Session overview/list and request trace localize the reserved string, subject to R4. Raw JSON evidence keeps canonical API values, which is appropriate for evidence inspection.

## Coverage gaps and pending parent gates

These items are separate from the reproduced defects above.

1. The reasoning collision with a configured literal `default` label needs an explicit regression. A synthetic engine preview with an empty first label, a populated literal `default` label carrying `reasoning_effort='high'`, global model elsewhere and `reasoning.fallback='medium'` returned `reason='empty_tag_default'` and effort `high`. The exact site is `decision.py:549-553`, which looks up the final tier string. The child report documents using fallback only when no configured label supplies an effort for `default`; under that wording the observed result is allowed. This review therefore does not classify it as a separate product defect. Preserve or clarify that documented choice before changing it, and test global/default-label continuations together.
2. The installed-smoke implementation follows actual empty startup, guarded setup, provider-before-model save, confirmed import, unset-default 503, revisioned global default, every strategy’s default preview, pool assignment, reload, overlay removal, restart, running/stopped reinstall and foreground startup. This source review did not execute it. Native browser and Ubuntu/macOS installed-wheel acceptance remain parent-owned.
3. The smoke removes the routing overlay before its reinstall checks and compares only models/env hashes during reinstall. It creates the database and checks schema/integrity, but creates no successful decision/outcome evidence before reinstall. Its final uninstall check compares database bytes. It consequently does not itself prove preservation of an existing overlay or populated retained decision/continuation records through reinstall. Parent acceptance needs that evidence for the existing-state requirement; byte-identical SQLite across a restart is not required because normal configuration/lifecycle writes may occur.
4. The dispatch reports a running `final-local-2` pipeline and the prior full backend result of 2 failed / 893 passed, with the reason-based regression fixed afterward. This reviewer did not read final pipeline results or treat that earlier result as passing. Earlier reports’ 809 backend / 212 unit / 94 browser counts precede this integration. Child focused passes are scoped evidence, not current full acceptance.
5. `docs/releasing.md` and `.github/workflows/release.yml` retain build plus Ubuntu/macOS installed-wheel dependencies before publication. The original release backup report records the old release/tag/assets. Those original workflow successes cannot certify the replacement commit. Fresh artifacts, exact source/wheel parity, both OS gates, stable/latest flags, four public digests/sidecars and downloaded public-wheel/public-installer acceptance remain required before declaring the authorized v0.1.0 replacement complete.

## Verification performed

Read the complete current PRD, design, implement plan and every file listed in `check.jsonl`. Read the applicable backend specs completely: index, directory structure, dashboard/routing configuration, provider configuration, initialization, decision providers, CLI lifecycle, errors, logging, quality and database guidelines. Read the complete humanizer skill and applied embedded mode to this report. Inspected actual source bodies and changed regions, not only outlines, including the parser/transaction/setup/CLI/strategy/engine/frontend/display/smoke paths discussed above. Read both child reports as scoped evidence and the current acceptance/replacement reports.

Executed three bounded, synthetic reproductions:

- Python engine/policy/helper reproduction for reasoning collision, escalation evidence and dotenv byte normalization.
- Actual management setup in a temporary directory for dotenv preservation.
- Pure TypeScript imports for configured destinations, preview/whiteboard edges and label formatting.

Python reproduction commands set `PYTHONDONTWRITEBYTECODE=1`, `PYTHON_DOTENV_DISABLED=1` and `LITELLM_LOCAL_MODEL_COST_MAP=true`; catalog credentials were injected fake values. No gateway module was imported by these reproductions. No provider request was made. `git diff --check` returned exit 0 with no output. No lint, typecheck, browser, full test suite, packaging or release gate was rerun by this reviewer.

## Reviewed source fingerprints

Hashes identify the source used for the findings if the parent continues editing after handoff.

```text
5ec34d3a7ba8b780516d213ac2006efc8566884d2370768660238ef5209668ff  jev_gateway/setup.py
625d75b812c7b6d3de9900c9f8471f4e2f7fdd310972bb22fc3b0b0435290991  jev_gateway/provider_config.py
6f2672a065067317990299944e15c30cb2c6b7bdf676fdd7840d1999dc82892c  jev_gateway/strategy/policy.py
f52efb8bdb5618c1569f77ba2e216e562651ec9e193f3fa0c8192c7ccfe145db  jev_gateway/decision.py
14ecf795ff8df225fda46acbd272bb86e575d2c9521e5dc1d23447fa4e401996  jev_gateway/gateway.py
3f0d14465f42ed79e4cb9942afc859db3eaf71fb9dbc286efefa0a6cc6ac2f02  frontend/src/shared/i18n/route-label.ts
5ff3cb38fdc770e3f77477e973dda587d787004af52337d0003292bf2b8ba2a1  frontend/src/features/routing/model/draft.ts
50940d78ff64569553faf8dd9ad766d5f43f127cae33f910337beeff3d79db0f  frontend/src/features/routing/model/configured-route-flow.ts
15abff8ccd66059458d951c7f4380184da4d8374dc255ae3a7747952ecede39d  frontend/src/features/monitoring/model/route-activity.ts
436008cacf136ac6643134006d11d95e049112b99eef6172757245b2ab77a13d  scripts/smoke-installed-release.py
```
