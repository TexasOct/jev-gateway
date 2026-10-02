# Independent source rework review

REWORK. The independent read-only reviewer found two remaining P2 defects in the
source identified below. The original six findings' primary fixes, including
the parent's session-list projection, were connected. This review does not
certify an installed artifact or public release.

The final report was recovered from the completed reviewer's actual JSONL output,
agent `becf72e6-7909-46e`, final message at `2026-10-02T11:28:53.982Z`.
The reviewer read the complete humanizer skill and applied its embedded pass.
It ran read-only commands and `git diff --check`, which exited 0. It did not run
tests, builds, real requests or network operations, read credentials, or edit
delivery files. The parent persisted this report after recovering the expired
agent's output.

## P2: actual LiteLLM stream cleanup interface

`jev_gateway/gateway.py:1580` sets `stream_response_closed` before looking only for
`response.close()`. Actual installed `CustomStreamWrapper` exposes asynchronous
`aclose()`, with no synchronous `close()`:

| Installation | LiteLLM version | Interface |
| --- | --- | --- |
| Repository `.venv`, matching `uv.lock` | 1.102.0 | `async def aclose`, source line 407 |
| Earlier real installed acceptance | 1.103.2 | `async def aclose`, source line 381 |

The reviewer read installed source and METADATA and checked class methods with
AST. The wrappers' destructors handle correlation context rather than closing
the provider stream. `aclose()` owns completion-stream cleanup and shields
AnyIO cancellation. A synchronous completion iterator can still be this wrapper.

A faithful reproduction uses a synchronous iterator exposing only `aclose()`,
then disconnects or fails an ASGI send after a data frame. The current gateway
cleans activity and records failure but never invokes the actual cleanup
interface. Its once-only marker blocks another attempt. The synthetic
`SDKStream` at `tests/test_stream_evidence.py:26` has synchronous `close()`, so
existing close-count assertions miss this interface gap.

Repair requires awaited asynchronous cleanup at the response boundary,
compatibility with synchronous close, once-only behavior, cancellation shielding,
safe logging and coordination with an executing worker iterator. Regressions
must cover normal exhaustion, SDK failure, disconnect, ordinary send failure,
`[DONE]` send failure and terminal-frame send failure. Failed paths must continue
to omit successful capture. Real billed requests are unnecessary to prove the
interface invocation.

## P2: implicit first-label configured paths

`frontend/src/features/routing/model/draft.ts:344` resolves only explicit
`rule.select.label` and `draft.fallback.label`. The configured projection at
`model/configured-route-flow.ts:50` therefore lacks a match edge for legal
selection-only choices and empty fallback. Backend `matrix.py:72` chooses the
first configured label when omitted. Its validator accepts those choices and
routing configuration preserves the original options.

```json
{
  "labels": {"missing": {"tag": "route/missing"}},
  "defaults": {"default_model": "p/global"},
  "rules": [{"when": {"intent": "code"}, "select": {"selection": "quality_first"}}],
  "fallback": {}
}
```

With configured untagged model `p/global`, backend rule and fallback select
`missing`, then inherit the global model. The old configured view instead has
`poolId: null`, no models and `defaulted: false`, so it cannot trace that path.
Monitoring's `matrixChoiceLabel()` already resolves the implicit first label,
creating inconsistent explanations between views.

Repair requires a shared read-only effective-choice resolver with first-label
and legacy `tier` compatibility. It must not materialize inferred labels,
global models or membership into the draft or overlay. Test selection-only rule,
empty fallback and cleared default, with unchanged draft and overlay tags.

## Confirmed fixes and scope

The reviewer read PRD, design, implement, initialization/provider/dashboard/error/
quality specs, four dispatched research reports, critical source consumers and
regression tests. These points were confirmed by source reading:

- Dotenv original bindings preserve untouched CRLF, comments, order and multiline
  values, including lines inside a value that resemble the selected assignment.
  Required separators for appended assignments follow the contract.
- Selection source survives escalation, outcomes, decisions, previews, sessions
  and retained signals. Matrix `replace()` retains it while prefixing reasons.
  Session source survives 40-event eviction; old-state inference is compatibility.
- Global reasoning uses policy fallback after excluding ordinary label/tier
  effort mappings. Literal `default` continues to use its own mappings.
- Records expose strict JSON booleans only. Dashboard lists retain live source
  when appropriate and remove it when adopted retained evidence lacks source.
- Explicit-label inheritance edges exist, have no editing handle, reject
  reconnect/remove and never enter overlay membership. Existing guards remain.
- Formatter context separates reserved fallback from literal `default` across
  overview, lists, detail-only overview and trace; raw JSON remains canonical.
- SSE success requires exhaustion, finish reason and terminal ASGI delivery.
  Capture/outcome follow that condition. Usage-only chunks preserve finish reason;
  native model is observed before echo. SDK/send/disconnect/incomplete paths do
  not finalize successful capture.
- Naturally exhausted incomplete streams may retain the encoder's `[DONE]`
  behavior, but record failure and no completed continuation. Durable replay
  still uses supplied assistant history. Forwarding `previous_response_id` does
  not prove opaque-ID-only reconstruction.

The reviewer did not rerun attributed delegate gates. Last-read source hashes:

```text
6e878c7e5c53bb3b75aedd18c84994d029f0aefc201e142c7d9c40069e0c5b77  jev_gateway/gateway.py
d6e925b48586ab15ae38b59ad8e24ddb53f372c4a79cd17c8dab561eb736de3b  jev_gateway/dashboard.py
beece9e2282eb279220e0493833bf2ea024a2cadeae042a76fb82e7daf90be1f  frontend/src/features/routing/model/draft.ts
363a8e6156515a85682dbf76222a8d3f82c3b6ede591c2c38bc4a615d647e234  frontend/src/features/routing/model/configured-route-flow.ts
```

Both repairs, final full gates, static rebuild, fresh wheel parity, native/real
acceptance, Ubuntu/macOS publication gates and public reinstall remain parent
integration work. There is no external decision blocker.
