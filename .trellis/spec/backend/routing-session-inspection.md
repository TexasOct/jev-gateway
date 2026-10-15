# Routing evidence and session inspection

## 1. Scope / trigger

Use when changing classification evidence, historical session access, the session
workspace or explicit decision connectivity tests. Keep classifier/rule/model
selection separate from upstream completion. A failed classifier can select a
fallback model whose reply succeeds.

## 2. Signatures

```python
DecisionClient.evaluate(state, questions, *, valid=None) -> DecisionResult | None
DecisionClient.evaluate_with_evidence(state, questions, *, valid=None) -> DecisionEvaluation
```

`strategy/decision_provider/base.py` owns immutable evidence and the compatibility
evaluator for injected makers that implement only `evaluate`.
`routing_evidence.py` owns closed vocabularies and safe projections. The engine carries evidence through Decision
and the existing `decisions.signals_json`; records remain best effort.

- `GET /v1/routing/sessions?scope=live|retained&limit=30&cursor=...`
- `GET /v1/routing/sessions/{session_id:path}/requests?scope=live|retained&limit=30&cursor=...`
- `POST /v1/decision-connection-test`
- `useMonitoringData(run, onUnauthorized, suspended=false, active=true)`

## 3. Contracts

### Classification and routing

`DecisionResult.answers` is a detached immutable mapping; evaluation evidence
uses immutable attempts/answers. Each call owns its result. No shared `last_error`.
Existing injected makers remain compatible without invented HTTP evidence.

Decision/preview JSON and safe recorded decisions add `strategy_source`
(`default`, `explicit`, `session`) and `routing_evidence`:

```json
{"classification":{"status":"accepted","provider_id":"judge","answers":{"workload":{"choice":"docs"}},"attempts":[{"provider_id":"judge","status":"accepted","http_status":200,"elapsed_ms":12}]},"rule_status":"matched","matched_rule_index":7,"pool":{"label":"draft","selection":"cheapest_adequate","source":"label_pool","candidates":["example/model"]}}
```

Classifier statuses are `accepted`, `disabled`, `missing_provider`, `missing_key`,
`http_error`, `timeout`, `network_error`, `invalid_json`, `invalid_envelope`,
`invalid_answers`, `unsupported_protocol`, `unavailable`, `bypassed_manual`,
`bypassed_session`, `not_applicable`. Attempts contain only configured provider
identity, closed status, nullable HTTP status and monotonic elapsed milliseconds.
Retain numeric 401/404/429 distinctions. Accept exactly configured questions and
criteria; discard upstream reasoning and extra answer fields. Selected-provider
exclusivity and default-first failover retain their existing ownership.

`rule_status` is `policy`, `manual`, `session_reuse`, `classified`, `matched`,
`accepted_unmatched` or `classifier_fallback`. Rule numbers are one-based and
otherwise null. Accepted-unmatched selects the policy's first label/default
selection; failed classification selects the configured failure fallback.
`pool.source` is `label_pool`, `widened_pool`, `global_default`, `session` or
`manual`; candidates describe the actual eligible search step before ranking.
`defaulted` continues to identify global default-model selection independently.
A literal label `default` can have `defaulted=false`.

Old rows omit missing evidence/source/defaulted. Never infer per-call outcomes,
answers or timings from current settings. `config_context` uses the decision's
recorded hash, a bounded left join and whitelisted applicable strategy/questions/
rules/pools/default model. It is `{status:"unavailable",config_hash}` if absent,
malformed or oversized. Input is capped at 2 MiB, output at 64 KiB, with 64 questions/labels/
criteria, 128 rules and 256 model IDs. Never expose provider configuration or
arbitrary parameters. Historical enablement is a configuration fact, not proof
of an old classifier attempt.

### Retained sessions and UI ownership

Omitted scope remains `live`. Retained mode groups surviving SQLite request
metadata, sorted `(last_request_at,session_id)` descending, through the writer
queue. Requests retain `(received_at,rowid)` descending and latest-decision joins.
SQL fetches `limit+1`, with limit 1..100. List rows never decode message bodies.
Retained counts/times describe surviving records, not lifetime traffic.

Both list responses identify scope. `in_memory` is independent from retained
existence; detail separates `session` metadata and nullable `memory_session`.
Reading retained-only history never creates a live session/pin. Disabled/degraded
storage keeps evidence unavailable, not a certified empty history.

Signed cursors bind endpoint, scope, session and compound key; every page still
authenticates. Router restart invalidates tokens. Paging is best effort across
new records/pruning; deduplicate stable IDs and reset traversal on scope/refresh.
Keep live distribution on the existing live traversal.

Monitoring opens with a session rail, compact request selection and independent
wide details. Session rows remain 132px with 480px desktop/280px narrow windows.
Request rows are 88px; the timeline fits content between 88px and 264px. Details
render outside virtual rows. Keep focused rows mounted, Arrow navigation, readable
role snapshots, folded system/tools, code wrapping, both locales/themes and
320/390px views. Raw JSON/playback are secondary. Snapshot changes replace content;
never concatenate repeated contexts or claim the final response was captured.

History/detail reads belong to the monitoring view as well as authentication,
scope and operation generations. Leaving aborts and retires them; late 200/errors/401
cannot install content or revoke another view. On return, history may reload and
an aborted initial detail read can recover. Background live distribution retains
its separate owner. Recovery performs GET only.

UI append is bounded to 1000 history sessions/300 requests. Disclose truncation
when `uniqueRows.length > max || (uniqueRows.length >= max && page.has_more)`.
Slice only after computing this flag. A terminal page can cross the limit even
with `has_more=false`; exact-cap terminal pages are complete.

### Synthetic decision diagnostics

The POST uses existing management-write auth before body parsing. Accept exactly
one saved `provider_id` selector or candidate `provider` with optional
`credential:{action:"keep"|"set"|"clear",value?}`. Saved selectors cannot edit
credentials. Resolve through the existing immutable credential owner; no process
environment mutation, config write, auto-enable, failover or generation request.

Return `{provider_id,scope:"decision_classification",synthetic:true,
generation_tested:false,decision_enabled,status,http_status,elapsed_ms,answers}`.
Use fixed synthetic `connectivity.choice=ready|unready` only. Status additionally
supports `busy`, `address_error`, `response_too_large`. No raw upstream prose,
headers, URLs or secrets. Bound total network time to 5s, request to 4 KiB,
response to 64 KiB and concurrency to 4. Reuse validated public destination/IP pinning, verified TLS and
redirect rejection. It runs only on explicit operator action, even when global
classification is disabled. Success certifies this synthetic evaluation only.

## 4. Validation / error matrix

| Situation | Required result |
| --- | --- |
| Classifier disabled/missing provider/key | Distinct safe status; configured failure fallback |
| Accepted answers, no local rule | `accepted_unmatched`; no fabricated provider failure |
| HTTP 401/404/429 or bad JSON/choice | Safe typed failure and numeric status where available |
| Concurrent evaluations | No cross-request answer/attempt/error contamination |
| Missing historical evidence/config | Explicit unknown/unavailable, no current-config inference |
| Nonlive session, live scope | 404; retained scope can read surviving records |
| Invalid limit/scope/cursor or wrong-scope token | 400; every page still checks Bearer |
| Retired history/detail 200 or 401 | No current-view content/authentication effect |
| Terminal append crosses 1000/300 after dedupe | Truncation disclosed, no further cursor fetch |
| Exactly max rows and no next page | Complete; no false truncation notice |
| Diagnostic upstream 401 | Semantic HTTP 200 result; gateway authorization 401 remains separate |
| Synthetic diagnostic rejected/limited | Fixed safe status, unchanged files/enablement |

## 5. Good / base / bad cases

Good: disabled classification is visible beside successful upstream completion;
history remains inspectable after session eviction. Base: old rows show their
recorded reason and explicitly unknown detail. Bad: interpret `defaulted=false`
as classifier success, combine snapshots, or let a retired 401 log out Suppliers.

## 6. Tests required

`tests/test_routing_inspector.py` covers fixed Luna/Sol fixture answers, failure
versus unmatched, immutable concurrent evidence, legacy rows, recorded config,
retained-only restart/eviction, scoped authenticated cursors, content privacy,
diagnostic credential ownership/bounds/nonmutation. Preserve decision/failover,
records and management regression suites.

`routing-session-inspector.spec.ts` covers selected snapshots, missing content,
scope/paging/stale replies and 12 width/locale/theme combinations.
`routing-session-ownership.spec.ts` covers retired history/detail 200/401,
current 401/reconnect/paging, 1000/1001/1020 sessions and deduplicated terminal
request overflow. `decision-diagnostics.spec.ts` covers explicit probe status,
local ownership, authentication and readiness. These synthetic fixtures do not
certify real upstream connectivity. Keep original failed receipts and independent
REWORK distinct from repaired PASS.

## 7. Wrong vs correct

Wrong: `limited = rows.length >= max && page.has_more`, or preserve an active
history operation when changing views because the hook remains mounted.
Correct: detect discarded unique rows before slicing; retire view-owned reads
on departure while retaining separate live-distribution ownership.

Wrong: store the classifier's mutable last exception or expose its response
body. Correct: carry immutable safe attempts on the specific routing outcome.
