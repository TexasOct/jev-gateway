# Task-type router acceptance

The approved `task_type_router` is installed in the running local JEV Gateway.
It is an independent selectable virtual model; the existing default remains
`task_aware`. The unchanged installed application is version0.1.12.

## Installed policy

| Task | Complexity | Pool | Concrete model |
| --- | --- | --- | --- |
| doc | any valid choice | doc | openai/gpt-6-luna |
| research | any valid choice | research | openai/gpt-6-luna |
| general | any valid choice | general | deepseek/deepseek-flash |
| review | low/medium | review | deepseek/deepseek-flash |
| review | high/unknown | review_complex | openai/gpt-6.1-sol |
| code | low/medium | code | openai/gpt-6-luna |
| code | high/unknown | code_complex | openai/gpt-6.1-sol |
| operator | any valid choice | operator | openai/gpt-6.1-sol |
| classifier failure | unavailable/disabled/invalid | fallback | openai/gpt-6.1-sol |

The two questions run in one evaluation through the existing `system_one`
provider. Fresh mode permits per-request task changes. Explicit selected model
membership contains only these three existing enabled models, with confirmed
configured tool/JSON capabilities and present credentials. Reasoning mode is
`preserve`; the new policy does not impose its own reasoning level.

The reusable write body is `strategy.json`. Its canonical JSON digest is
`c703235c80874ac57bae250e220c341668a156fed36fbbfd7ee1a56304d1565a`.

## Native validation

- The installed strict catalog parser and strategy registry accepted the candidate
  before any runtime write. Network/process launch was blocked during local checks.
- All24 task/complexity combinations passed for both text and tools/JSON request
  shapes:48 routes. Four degraded classifications chose the distinct fallback;
  three fresh-session transitions and one manual bypass also passed, totaling56.
- Authenticated creation, scoped validation and apply returned success, with no
  warnings. Readback and the persisted v2 entry match the accepted definition.
- Normal reload preserved the strategy and its virtual-model list entry.
- Ten real synthetic classification previews passed, including low/medium/high/
  unknown code and routine/complex review. All requests carried a synthetic tool
  descriptor; tool availability did not force operator classification. Classifier
  evidence was accepted and local rules matched in every case. Native exit0,
  total7.77 seconds. No chat generation or private prompt was submitted.

## Ownership and preservation

- Seven protected runtime-file digests/modes are identical, including baseline,
  credentials and theme. Only the routing overlay and the configuration owner's
  layout representation are allowed to change.
- `task_aware`, `quality` and `economy` retain their semantic policies, selected
  membership and canvas layouts. Global defaults and supplier model records match.
- SQLite integrity is `ok`. Every original row digest/multiplicity in requests,
  decisions, outcomes, upstream_requests and config_versions survives; normal live
  traffic and the two successful configuration publications may add rows.
- Provider continuation state is an explicitly bounded mutable cache. Live traffic
  appends and prunes it through `record_assistant_continuation` and
  `_prune_continuations`; its unchanged limits were verified. It is not claimed as
  immutable history. The initial overly broad cache-row assertion is retained
  separately, along with the table-digest investigation and source explanation.
- The service stayed running and healthy. No restart, package upgrade, provider
  modification, backup, Git staging or unrelated-source edit was required.

Private evidence is under `.trellis/.runtime/task-type-router/`: local validation,
write events, install readback, native live-preview exit, individual safe classifier
answers and preservation receipts. The first helper credential-field lookup error
and the first unnecessary idle-traffic guard are retained separately; neither
performed a runtime configuration mutation.

## Use

Select `task_type_router` in the Dashboard strategy selector. API callers select
the same registered virtual model through the request body:

```json
{
  "model": "task_type_router",
  "messages": [
    {"role": "user", "content": "请实现一个边界明确的小改动，并补对应测试。"}
  ]
}
```

The management `?strategy=` selector is not a chat selector. Existing callers
using `task_aware` keep that strategy until they select the new model.

## Spec review and repository scope

The existing named-workflow, typed-classification, evidence and bounded-continuation
contracts already cover this configuration. No API, schema, engine or frontend
contract changed, so no executable-spec edit or package rebuild is warranted.
The focused parser/registry/routing and live-owner checks above validate the new
configuration; unchanged release-wide Python/TypeScript suites were not replayed.

This task directory is the only new persistent repository work. Existing README,
project-structure, glossary and provider-onboarding work belongs to other activity
and remains outside this task. Repository commit/archival is pending bookkeeping;
the local application write and its acceptance are complete.
