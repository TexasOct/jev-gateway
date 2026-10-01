# Provider configuration API contract

## Routes and authorization

| Method | Path | Authorization |
| --- | --- | --- |
| GET | `/v1/provider-configuration` | Existing gateway read authorization |
| POST | `/v1/provider-configuration/validate` | Configured gateway key required |
| PUT | `/v1/provider-configuration` | Configured gateway key required |
| POST | `/v1/provider-discovery` | Configured gateway key required |
| POST | `/v1/provider-metadata` | Configured gateway key required |

Commands return 403 `config_writes_disabled` when no gateway key is configured,
401 `invalid_api_key` for an incorrect or missing configured Bearer key, 400
`invalid_configuration` for invalid fields/credentials/references, and 409
`revision_conflict` for an outdated revision. Persistence or activation failure
returns 500 `provider_configuration_failed`. Errors use the existing OpenAI
`{error: {message, type, param, code}}` envelope with fixed public text.

## Configuration snapshot

GET returns exactly these top-level fields:

```ts
type ProviderConfiguration = {
  revision: string;
  write_available: boolean;
  providers: LlmProviderView[];
  decision: {
    enabled: boolean;
    default_provider: string | null;
    timeout_seconds: number;
    providers: DecisionProviderView[];
  };
  models: ModelView[];
  presets: ProviderPreset[];
  provider_types: string[];
  decision_protocols: string[];
};

type LlmProviderView = {
  id: string;
  type: string;
  api_base: string | null;
  api_key_env: string | null;
  has_api_key: boolean;
  display_name: string;
  brand_id: string | null;
  icon_id: string | null;
  allow_private_network: boolean;
  params: Record<string, "[configured]">;
  param_env: Record<string, string>;
};

type DecisionProviderView = {
  id: string;
  protocol: string;
  api_base: string;
  api_key_env: string;
  has_api_key: boolean;
  model: string | null;
  display_name: string;
  brand_id: string | null;
  icon_id: string | null;
};

type ModelView = {
  name: string; // provider/upstream_model
  provider: string;
  upstream_model: string;
  tags: string[];
  api_base: string | null;
  provider_type: string;
  has_api_key: boolean;
  priority: number;
  quality: number;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: ModelCapabilities;
  cost: ModelCost;
  metadata?: ModelMetadata;
};

type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  json_mode: boolean;
  reasoning: boolean;
  temperature: boolean;
  reasoning_effort: string[];
};

type ModelCost = {
  input_per_million: number;
  output_per_million: number;
};
```

Model views represent the effective catalog, including routing overlay tags and
priority. `params` contains markers only. Omit `params` and `param_env` from an
ordinary edit to preserve their original values. Never submit configured markers
as parameter values. `api_key_env` and `param_env` contain declared variable names,
not credential values. Missing display names fall back to the stable provider ID.

Revisions are opaque tokens covering baseline, overlay, and credential-file
contents. A process restart invalidates tokens issued by that process.

Example snapshot, with one preset shown from the preset array:

```json
{
  "revision": "opaque-revision-token",
  "write_available": true,
  "providers": [{
    "id": "work-openai",
    "type": "openai",
    "api_base": "https://api.openai.com/v1",
    "api_key_env": "WORK_OPENAI_KEY",
    "has_api_key": true,
    "display_name": "Work account",
    "brand_id": "openai",
    "icon_id": null,
    "allow_private_network": false,
    "params": {"timeout": "[configured]"},
    "param_env": {}
  }],
  "decision": {"enabled": false, "default_provider": null, "timeout_seconds": 1.5, "providers": []},
  "models": [{
    "name": "work-openai/example-model",
    "provider": "work-openai",
    "upstream_model": "example-model",
    "tags": [],
    "api_base": "https://api.openai.com/v1",
    "provider_type": "openai",
    "has_api_key": true,
    "priority": 0,
    "quality": 0.5,
    "context_window": null,
    "max_output_tokens": null,
    "capabilities": {"tools": true, "vision": false, "json_mode": true, "reasoning": false, "temperature": true, "reasoning_effort": []},
    "cost": {"input_per_million": 1, "output_per_million": 2}
  }],
  "presets": [{
    "kind": "llm", "id": "openai", "display_name": "OpenAI",
    "brand_id": "openai", "icon_id": null,
    "type": "openai", "api_base": "https://api.openai.com/v1",
    "api_key_env": "OPENAI_API_KEY"
  }],
  "provider_types": ["openai", "anthropic", "deepseek"],
  "decision_protocols": ["system_one"]
}
```

## Presets

Presets are a flat array, with no nested `provider` object:

```ts
type ProviderPreset = {
  kind: "llm" | "decision";
  id: string;
  display_name: string;
  brand_id: string | null;
  icon_id: string | null;
  type?: string;
  protocol?: string;
  api_base: string | null;
  api_key_env: string;
  model?: string;
};
```

The templates are OpenAI, Anthropic, DeepSeek, optional OpenRouter when its
transport is registered, and System One. Anthropic's template has
`api_base: null`, preserving the CLI's native transport default. System One is:

```json
{
  "kind": "decision", "id": "system_one", "display_name": "System One",
  "brand_id": null, "icon_id": null,
  "protocol": "system_one", "api_base": "",
  "api_key_env": "SYSTEM_ONE_API_KEY"
}
```

Its empty URL is a form placeholder. Saving requires a full evaluation URL.
`model` is optional. System One has no model discovery. Strip preset-only `kind`
before constructing the provider object; the operation carries `kind` separately.
Brand and icon fields do not select the transport or protocol.

## Provider operations and responses

Validation and apply accept exactly `{expected_revision, operations}`. Validation
requires the same revision and full effective catalog checks as apply and writes
no baseline, overlay, or credentials.

```ts
type CredentialAction =
  | {action: "keep"}
  | {action: "set"; value: string}
  | {action: "clear"};

type ProviderOperation =
  | {
      action: "upsert";
      kind: "llm" | "decision";
      provider: Record<string, unknown>;
      credential: CredentialAction;
    }
  | {action: "delete"; kind: "llm" | "decision"; id: string}
  | {action: "import"; provider_id: string; models: ImportModel[]; confirmed: true};
```

Provider writes accept canonical catalog fields. LLM fields are
`id/type/api_base/api_key_env/params/param_env/display_name/brand_id/icon_id/allow_private_network`.
Decision fields are
`id/protocol/api_base/api_key_env/model/display_name/brand_id/icon_id`.
Unknown fields, including read-only `has_api_key`, are rejected. Display fields
may be omitted/null; non-null values must be nonempty strings of at most 160
characters with no control characters. Private-network opt-in is a strict boolean.

Credentials are write-only. Set requires a nonempty single-line value of at most
8 KiB and a declared `api_key_env`. Keep and clear accept no `value`. A shared
credential reference cannot be changed or cleared by one provider operation.
Clear removes assignments for that reference from the local `.env`; an inherited
external value remains available, as with CLI logout. Validation, PUT, GET,
reload, later keep, and candidate query previews use that same fallback and
report effective presence. Candidate clear previews do not write files.
Clear must leave a valid effective catalog; missing required credentials reject
the candidate. Removing an optional LLM credential reference omits it from the
candidate, even when an external value exists, and can clear the old
reference using the existing provider's declaration. Provider deletion does not
cascade into models or silently remove shared credentials.

Unmarked `.env` assignments retain python-dotenv's `override=True` resolution:
parse records in file order, resolve `${NAME}` and `${NAME:-default}` against the
external environment followed by preceding file records, and retain duplicate
assignment and bare-name behavior. Single quoting alone does not disable legacy
interpolation. JEV builds an immutable local mapping without changing
`os.environ`; only declared catalog references supply credentials.

Managed set operations use dotenv single-quoted assignments, escaping backslashes
and single quotes. If the value contains `${`, the assignment has the exact
trailing comment `# jev-managed-literal-v1`, separated from the quoted value by
one space. For example, `FIXTURE_KEY='fake-${BASE_KEY}' # jev-managed-literal-v1`
resolves to the literal `fake-${BASE_KEY}`. JEV recognizes the marker at the end
of the parsed record and skips variable expansion for that record only. Values
without `${` need no marker. Unmarked records keep their existing interpretation;
set/clear replaces all assignments for the selected name without changing other
records. The marker is a JEV convention in the same `.env`, not a separate secret
source; generic dotenv interpolation does not implement it.

CLI addition checks the same shared-reference helper as management writes and
login/logout before setting a key. References in gateway, either provider list,
and provider `param_env` prevent an isolated change to a shared variable.

CLI show, validate, doctor, reload, status and start capture the document and
immutable credential mapping together under `configuration_read_lock`. Safe
projections and validation consume that mapping directly. Reload and startup
health polling use the captured address and resolved key; health probes retain
their existing env-name interface and accept an explicit resolved-key override.
`load_catalog_env` returns a mapping for compatibility and does not populate
`os.environ`. An unresolved journal rejects CLI reads/probes with the fixed safe
`configuration_recovery_required` error before consuming mixed files.

Startup, management reads/queries/commands, and routing read/validate/apply/reset
take the cooperative file lock before checking for an unresolved
`.provider-configuration.recovery` journal and before consuming catalog or
credential files. Reload takes the runtime reload lock first and retains both
locks through read, preparation, and activation. Normal readers wait for a CLI
transaction to finish. An unresolved journal blocks startup and returns safe
configuration errors before any discovery/metadata adapter call. Management
returns 500 `provider_configuration_failed` with fixed public text; reload and
routing configuration return 400 `invalid_configuration` with the fixed recovery
message. Reload retains the previous active catalog; requests using healthy
memory state can continue serving. Manual repair is required; no automatic
recovery is provided. An owning activation callback can reenter reads only after
all replacements have completed, while it still holds the cooperative lock.

Validation/PUT responses contain all snapshot fields plus:

```ts
type ProviderCommandResult = ProviderConfiguration & {
  valid: true;
  applied: boolean; // false for validate, true for successful PUT
  imported: number;
  skipped: number;
};
```

The validation revision remains the current disk revision. Successful PUT returns
the new revision and effective provider/model views. Credentials never appear in
either response. The routing overlay remains unchanged.

## Model import

```ts
type ImportModel = {
  provider?: string; // if supplied, must equal operation.provider_id
  upstream_model: string;
  tags?: string[];
  priority?: number;
  quality?: number;
  context_window: number | null;
  max_output_tokens: number | null;
  capabilities: ModelCapabilities;
  cost: ModelCost;
  metadata?: ModelMetadata;
};
```

Import requires all five capability booleans, an explicit effort list, both finite
nonnegative prices, and both limits as null or positive integers. The operation
must carry `confirmed: true`. Old catalog omission defaults remain valid for old
files; they do not substitute for these import requirements. Qualified IDs are
derived from `provider_id/upstream_model`. Existing IDs are skipped without
changing values, metadata, tags, priority, or overlay membership. Cost values use
USD per million tokens. Optional tags, priority, and quality follow existing
catalog rules and are not inferred from online sources.

## Persistent model metadata

The canonical `models[].metadata` envelope and model-view metadata use this exact
schema. Every object level rejects unknown keys.

```ts
type MetadataFieldName =
  | "tools" | "vision" | "json_mode" | "reasoning" | "temperature"
  | "reasoning_effort" | "context_window" | "max_output_tokens"
  | "input_per_million" | "output_per_million";

type MetadataSource = {
  id: string;
  source?: string;
  url?: string;
  fetched_at?: string;
  source_updated_at?: string;
  provider_id?: string;
  model_id?: string;
  unit?: string;
  field_path?: string;
  source_unit?: string;
  applicable?: boolean;
  schema_revision?: string;
  canonical_model_id?: string;
  source_reasoning_effort?: Array<string | null>;
  fields?: Partial<Record<MetadataFieldName | "max_input_tokens" | "structured_output", {
    value: boolean | Array<string | null> | number | null;
    source_field: string;
    unit?: string;
    source_unit?: string;
  }>>;
  pricing?: ProjectedPricing;
};

type MetadataConfirmation = {
  confirmed_at?: string;
  method?: string;
};

type MetadataFieldEvidence = MetadataConfirmation & {
  status: "known" | "unknown" | "conflict" | "confirmed";
  value?: boolean | string[] | number | null;
  source_ids?: string[];
};

type ModelMetadata = {
  version: 1;
  sources?: MetadataSource[];
  fields?: Partial<Record<MetadataFieldName, MetadataFieldEvidence>>;
  confirmation?: MetadataConfirmation;
};
```

Rules:

- Sources contain at most 32 items. Each requires a unique nonempty `id`.
  Source text values are strings of at most 512 characters without control
  characters. The encoded metadata envelope is bounded to 256 KiB.
- Query normalization preserves one source record per upstream evidence source.
  It maps `source_provider` to `provider_id` and `source_model` to `model_id`, adds
  a source ID, and retains `source`, applicability, all allowlisted source fields,
  both units, schema revision, canonical association, raw effort, and pricing.
  Native discovery uses `source: "native_listing"`; public sources are
  `models_dev`, `models_dev_catalog`, `openrouter`, and `litellm_snapshot`.
- Reference-only sources remain in the persistence envelope with
  `applicable: false`. They can support a recorded manual confirmation but do not
  supply a known serving value automatically. Conflicting sources remain intact.
- `sources[].fields` accepts the ten managed field names plus `max_input_tokens`
  and `structured_output`. These two reference fields do not become combined
  context-window or JSON-mode confirmation automatically. Source capability
  values require bool/null; source limits require nonnegative integer/null;
  source costs require finite nonnegative number/null. Source effort arrays have
  at most 16 bounded string/null entries and preserve unsupported upstream levels.
- `source_reasoning_effort` also preserves at most 16 bounded string/null entries.
  Normalized runtime `reasoning_effort` still requires supported routing levels.
- Source URLs must use HTTPS, have a hostname, and contain no userinfo, query, or
  fragment. URLs identify evidence; the persistence parser does not fetch them.
- `source_ids` contains at most 32 string references to `sources[].id`.
- Confirmation strings contain at most 160 characters. Timestamp strings describe
  retrieval, source declarations, or user confirmation separately; they are not
  automatically substituted for each other.
- A field's non-null value must match its field type: strict bool for capabilities,
  a valid effort list, positive integer limits, or finite nonnegative prices.
- A field marked `confirmed` must have `value`, and that value must equal the
  corresponding imported `cost`, `capabilities`, or limit value. Confirmed null
  limits must equal the imported null limits.
- Query evidence remains separate from runtime confirmation. To confirm a source
  value, preserve its source references, set that field's status to `confirmed`,
  and record its method/time. A manual edit may retain original source evidence
  while recording the selected confirmed value and `method: "manual"`.
- Import persists the validated envelope; configuration GET and successful PUT
  return it. Importing an old record without metadata does not invent provenance.

Projected price evidence uses this shape:

```ts
type ProjectedPrice = {value: number | null; unit: "USD/M tokens" | "USD/source unit"};
type ProjectedPriceCondition = {
  condition?: {type: "context"; size: number};
  min_prompt_tokens?: number;
  utc_start?: number;
  utc_end?: number;
  utc_days?: Array<"monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday">;
  condition_fields?: Array<"context" | "context_length" | "time" | "start_time" | "end_time">;
  context?: number;
  context_length?: number;
  time?: string;
  start_time?: string;
  end_time?: string;
  unrecognized_conditions?: boolean;
  threshold_unverified?: boolean;
};
type ProjectedPricing = Record<string, unknown> & {
  tiers?: Array<ProjectedPriceCondition & Record<string, unknown>>;
  overrides?: Array<ProjectedPriceCondition & Record<string, unknown>>;
  context_over_200k?: ProjectedPriceCondition & Record<string, unknown>;
};
```

`Record<string, unknown>` expresses dynamic price names for TypeScript consumers;
the server does not accept arbitrary keys. Root price names are `input`, `output`,
`reasoning`, `cache_read`, `cache_write`, `input_audio`, `output_audio`, `prompt`,
`completion`, `input_cache_read`, `input_cache_write`, `web_search`, `request`,
`image`, and `internal_reasoning`, plus keys matching:

```text
(?:(?:input|output)_cost_per_token(?:_(?:above_\d+k_tokens|batches|cache_hit|flex|priority))*|cache_(?:creation|read)_input_(?:audio_)?token_cost(?:_(?:above_\d+k_tokens|above_\d+hr|flex|priority))*|citation_cost_per_token)
```

Each price name maps to `ProjectedPrice`. A pricing object has at most 256 keys;
`tiers` and `overrides` each have at most 32 entries, whose price names follow the
same whitelist. Conditions occur only inside a tier/override/legacy context tier,
and no nested arrays of tiers are allowed. Numeric conditions are finite and
nonnegative; prompt thresholds, UTC numeric times and context-tier sizes are
integers. Weekday lists have at most seven entries, condition-field lists at most
five. Time strings match `[0-9T:Z+./\- ]{1,64}`. Marker flags are strict booleans.
Unknown pricing/condition keys are rejected; raw upstream pricing is not accepted.

Example confirmation envelope:

```json
{
  "version": 1,
  "sources": [{
    "id": "models_dev-0",
    "source": "models_dev",
    "url": "https://models.dev/api.json",
    "provider_id": "openai",
    "model_id": "example-model",
    "fetched_at": "2026-09-30T10:00:00Z",
    "field_path": "cost.input",
    "unit": "USD/M tokens",
    "applicable": true,
    "fields": {"input_per_million": {"value": 1, "source_field": "cost.input", "unit": "USD/M tokens", "source_unit": "USD/M tokens"}},
    "pricing": {"input": {"value": 1, "unit": "USD/M tokens"}}
  }],
  "fields": {
    "input_per_million": {
      "status": "confirmed", "value": 1,
      "source_ids": ["models_dev-0"],
      "confirmed_at": "2026-09-30T10:01:00Z", "method": "source"
    },
    "context_window": {
      "status": "confirmed", "value": null, "source_ids": [],
      "confirmed_at": "2026-09-30T10:01:00Z", "method": "manual"
    }
  },
  "confirmation": {"confirmed_at": "2026-09-30T10:01:00Z", "method": "reviewed"}
}
```

## Discovery and metadata queries

Both queries require exactly one provider selector: an existing LLM
`provider_id`, or a transient canonical LLM `provider` object. They may also carry
a write-only `credential` action. Keep is the default. Set overlays only the
candidate credential mapping. Neither query saves the candidate or credential.

Discovery body:

```json
{"provider_id": "work-openai"}
```

Candidate discovery body:

```json
{
  "provider": {
    "id": "local-models", "type": "openai",
    "api_base": "http://127.0.0.1:11434/v1",
    "api_key_env": "LOCAL_MODEL_KEY", "allow_private_network": true
  },
  "credential": {"action": "set", "value": "fixture-write-only-key"}
}
```

Discovery response:

```ts
type DiscoveryResult = {
  provider_id: string | null;
  supported: boolean;
  complete: boolean;
  items: Array<{
    upstream_model: string;
    qualified_id: string;
    imported: boolean;
    metadata: MetadataCandidate;
    metadata_envelope: ModelMetadata;
  }>;
  warnings: string[];
};
```

`metadata` is the adapter's read-only candidate evidence. `metadata_envelope` is
the normalized persistence shape, suitable for carrying into confirmation.
System One stays in manual configuration and is not an LLM discovery selector.

Metadata lookup body:

```json
{"provider_id": "work-openai", "upstream_models": ["example-model"], "refresh": false}
```

`upstream_models` is a nonempty list of at most 1000 nonempty strings, each at most
512 characters. Refresh is a strict bool and defaults to false. Lookup returns:

```ts
type MetadataQueryResult = {
  items: Array<MetadataCandidate & {
    upstream_model: string;
    metadata: ModelMetadata;
  }>;
  fetched_at: string | null;
  stale: boolean;
  warnings?: string[];
};

type MetadataCandidate = {
  fields: Record<MetadataFieldName, boolean | string[] | number | null>;
  sources: CandidateSource[];
  warnings: string[];
};

type CandidateSource = {
  source: string;
  source_provider: string;
  source_model: string;
  fetched_at: string;
  applicable: boolean;
  fields: Record<string, {
    value: boolean | Array<string | null> | number | null;
    source_field: string;
    unit?: string;
    source_unit?: string;
  }>;
  url?: string;
  source_updated_at?: string;
  schema_revision?: string;
  canonical_model_id?: string;
  source_reasoning_effort?: Array<string | null>;
  pricing?: ProjectedPricing;
};
```

Candidate sources may include additional safe evidence fields such as
`max_input_tokens` or `structured_output`; these are not automatically substituted
for the managed combined-window or JSON-mode fields. `pricing` carries bounded
conditional/cache/tier evidence for review and is not the persisted runtime cost
pair. Reference-only sources remain visible in the query, with
`applicable: false`; they do not prefill confirmed serving prices.

Example source evidence and normalized output for one lookup item:

```json
{
  "upstream_model": "example-model",
  "fields": {
    "input_per_million": 1, "output_per_million": null,
    "tools": null, "vision": null, "json_mode": null,
    "reasoning": null, "temperature": null, "reasoning_effort": null,
    "context_window": null, "max_output_tokens": null
  },
  "sources": [{
    "source": "models_dev", "source_provider": "openai",
    "source_model": "example-model", "fetched_at": "2026-09-30T10:00:00Z",
    "applicable": true, "url": "https://models.dev/api.json",
    "fields": {"input_per_million": {"value": 1, "source_field": "cost.input", "unit": "USD/M tokens"}}
  }],
  "warnings": [],
  "metadata": {
    "version": 1,
    "sources": [{
      "id": "models_dev-0", "source": "models_dev", "provider_id": "openai", "model_id": "example-model",
      "url": "https://models.dev/api.json", "fetched_at": "2026-09-30T10:00:00Z",
      "applicable": true,
      "fields": {"input_per_million": {"value": 1, "source_field": "cost.input", "unit": "USD/M tokens"}}
    }],
    "fields": {
      "input_per_million": {"status": "known", "value": 1, "source_ids": ["models_dev-0"]},
      "output_per_million": {"status": "unknown", "value": null, "source_ids": []},
      "tools": {"status": "unknown", "value": null, "source_ids": []},
      "vision": {"status": "unknown", "value": null, "source_ids": []},
      "json_mode": {"status": "unknown", "value": null, "source_ids": []},
      "reasoning": {"status": "unknown", "value": null, "source_ids": []},
      "temperature": {"status": "unknown", "value": null, "source_ids": []},
      "reasoning_effort": {"status": "unknown", "value": null, "source_ids": []},
      "context_window": {"status": "unknown", "value": null, "source_ids": []},
      "max_output_tokens": {"status": "unknown", "value": null, "source_ids": []}
    }
  }
}
```

  for import, copy the item's normalized `metadata`, preserve its `sources`, and
record confirmed field values alongside the full explicit routing values. Query
refresh never changes the effective catalog or existing confirmation records.
