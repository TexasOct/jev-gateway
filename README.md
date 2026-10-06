# JEV Gateway

**[English](README.md)** | [简体中文](README.zh-CN.md)

![AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue) ![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue)

JEV Gateway routes OpenAI-compatible chat requests across model providers using configurable
cost, quality, and capability rules. Choose a strategy instead of hard-coding a model, and either
keep a session on one route or reconsider it each turn.

[Quick start](#quick-start) · [Model identity](#model-identity) · [Routing strategies](#routing-strategies) · [HTTP API](#http-api) · [Documentation](#documentation) · [License](#license) · [Development](#development)

## What it does

- Serves `POST /v1/chat/completions` for clients configured with the gateway URL and a catalog model or strategy name.
- Can classify work by task type, scale, and rigor, then select from configured model pools.
- Optionally asks configured decision providers typed choice questions; when no answer is available, routing uses the configured deterministic fallback.
- Supports session pinning and per-turn selection; the shipped `task_aware` strategy uses `fresh` mode.
- Derives a `reasoning_effort` level per route and clamps it to the levels that route accepts.
- Records requests, decisions, outcomes, and provider continuation state in SQLite; recording failures do not fail chat requests.
- Ships a dashboard for live sessions and a small API for routing inspection.

![Request-to-route flow](docs/routing-strategy-map.svg)

## Quick start

Install the CLI on macOS or Linux without cloning the repository. You need
Python 3 available as `python3` for asset verification and `curl`. The installer
uses uv-managed Python 3.12 for the gateway, downloading it if needed:

```bash
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh | sh -s -- --yes
```

The URL selects the latest stable Release's installer. Each installer embeds its
own tag and verifies that tag's wheel against its SHA256 sidecar before installing
it. `--yes` permits installing `uv` if it is missing. To pin a published version
or roll back, use its tagged installer URL:

```bash
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/install.sh | sh -s -- --yes
```

Explicit prerelease tags are supported. Passing `--version 0.1.0` to another
Release's installer makes it verify and run the target tag's installer once.
Missing assets or invalid checksums stop installation; there is no fallback to
`main`. The initial `curl | sh` script runs without a checksum check. For a pinned
download, review, and verification flow, see
[`docs/local-install.md`](docs/local-install.md#verify-installer).

Windows is not supported by the curl installer. See the source checkout or
Docker paths in [`docs/local-install.md`](docs/local-install.md).

For source development, use Python 3.12+, [`uv`](https://docs.astral.sh/uv/), and
Node.js with npm (the release workflow uses Node.js 22). Build the dashboard
before installing from the checkout:

```bash
git clone https://github.com/TexasOct/jev-gateway.git
cd jev-gateway
uv sync --all-groups
npm --prefix frontend install
scripts/build-frontend.sh
```

For this source checkout, initialize the runtime directory with the local
installer. The curl installer has already initialized it. Both preserve existing
configuration and records:

```bash
./scripts/install-local.sh --editable
```

The default configuration contains the `task_aware`, `quality`, and `economy`
strategy plans. It has no provider instances, models, or upstream credentials.
You can start the gateway and configure those later:

```bash
jev start
```

For the source install, use its local launcher:

```bash
~/.local/bin/jev-gateway-local
```

Open `http://127.0.0.1:8000/dashboard` and set a gateway management key in the
initialization form. You can enter the console immediately and add providers
and models later. Saved keys go to the protected `credentials.json` file and are
never returned to the dashboard. Keep your own copy for clients. The connection
key stays in browser memory; reconnect with it after refreshing the page.
First-time browser setup is local only. For a terminal or remote deployment, use `jev setup` to
set the key with a no-echo prompt before opening the dashboard.
If the service is already running, follow CLI setup with `jev config reload`.
File setup and `.env` compatibility are covered in
[credential configuration](docs/credentials.md).
After importing a model, choose the global default model in Settings. All
strategies inherit it when a matched tag has no models and report the result as
Default. Populated tag pools still
use their normal selection rules.

Use Suppliers to save a connection and its upstream credential, then open Models
to discover or manually add models, review metadata and import a selected batch.
General settings owns the gateway access key. Assign models to strategy pools in
Strategy workflow. Dashboard saves activate the configuration;
`jev config reload` also rereads files after manual changes. Until models are
configured, chat requests return `503 setup_incomplete` while the console stays
available.

Once a model is configured, send a first request with your gateway key:

```bash
read -r -s JEV_CLIENT_KEY
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer $JEV_CLIENT_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model": "task_aware", "messages": [{"role": "user", "content": "Summarize this design."}]}'
```

The template disables external decisions, so `task_aware` uses its configured fallback until you enable `decision`. Set `decision.providers[].protocol` to `system_one` for a compatible endpoint; supply `model` only if that endpoint requires it.
`GET /healthz` confirms the process is up. For persistent, container, and wheel installs, see
[`docs/local-install.md`](docs/local-install.md).

Suppliers supports presets and custom LLM or decision connections.
Supplier setup and private-network opt-in are covered
in [`docs/models-config.md`](docs/models-config.md#provider-页与模型导入).

## Model identity

A catalog model is indexed by its provider-qualified ID, `<provider>/<upstream_model>`. The
`providers` block holds transport settings once; each model points at a provider and adds
capabilities, limits, cost, and routing tags:

```json
{
  "providers": [
    {"id": "deepseek", "type": "deepseek", "api_base": "https://api.deepseek.com/v1", "api_key_env": "DEEPSEEK_API_KEY"}
  ],
  "models": [
    {"provider": "deepseek", "upstream_model": "deepseek-flash", "tags": ["task_aware/draft"], "context_window": 1000000}
  ]
}
```

This model's ID is `deepseek/deepseek-flash`. Bare upstream names are not valid manual selections
because they are not globally unique. Full field reference: [`docs/models-config.md`](docs/models-config.md).

## Routing strategies

Every named strategy is also a virtual model name. Send the strategy name in the request body's
`model` field; the default is `task_aware`.

```json
{"model": "quality", "messages": [{"role": "user", "content": "Review this design."}]}
```

Each strategy inherits its settings from the top-level `policy` block and can override `selection`,
`mode`, `labels`, and reasoning rules. Built-in modes are `sticky`, `cached`, `escalate`,
`adaptive`, and `fresh`. Explicit built-in strategy kinds are `policy`, `decision`, and `decision_matrix`. The former `jev` and `jev_matrix` kinds have been removed; update existing catalogs before starting the gateway. A concrete
catalog model ID such as `openai/gpt-5.6-sol` selects that model directly. Omitted `kind` uses `auto` dispatch; see the design reference.

This is a breaking change for old catalogs and Python callers. Replace the top-level `jev` key with `decision` and update `sources` / `default_source` to `providers` / `default_provider` with an explicit protocol. `JevSettings`, `JevSource`, `jev_from_dict`, `Catalog.jev`, `JevClient`, `JevClassifier`, `JevStrategy`, `JevMatrixStrategy`, and the `DecisionSettings.default_source` / `.sources` accessors are gone. Recorded reasons now use `decision:` or `decision_matrix:` instead of `jev:` or `jev_matrix:`; the `X-JEV-Reason` header name is unchanged. See [the configuration migration notes](docs/models-config.md).

Only the request-body `model` field selects a strategy. `?strategy=` returns `400`, and the
`X-JEV-Strategy` request header is ignored for selection. Design and configuration details:
[`docs/routing-design.md`](docs/routing-design.md).

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness and configuration snapshot. |
| `GET` | `/dashboard` | Bundled operator UI for monitoring, providers, and routing configuration. |
| `GET` | `/v1/setup` | Initialization status and optional configuration progress. |
| `POST` | `/v1/setup` | Set the initial management key from a local connection. |
| `GET` | `/v1/models` | Strategy names and catalog model IDs. |
| `GET` | `/v1/routing/policy` | Active policy snapshot. |
| `GET` | `/v1/routing/strategies` | Registered strategies and policies. |
| `POST` | `/v1/routing/preview` | Route a request without serving it. |
| `POST` | `/v1/routing/reload` | Re-read the catalog file. |
| `GET` | `/v1/routing/decisions/{decision_id}` | One retained decision. |
| `GET` | `/v1/routing/sessions` | Live sessions. |
| `GET` | `/v1/routing/sessions/{session_id}` | One live session. |
| `GET` | `/v1/routing/sessions/{session_id}/requests` | Retained requests for a session. |
| `GET` | `/v1/routing/providers/summary` | Retained provider activity. |
| `GET` | `/v1/provider-configuration` | Safe provider configuration, presets, and revision. |
| `PUT` | `/v1/gateway-credential` | Initialize locally or replace the gateway access key without readback. |
| `POST` | `/v1/provider-configuration/validate` | Validate provider changes or confirmed model imports. |
| `PUT` | `/v1/provider-configuration` | Apply provider changes or confirmed model imports. |
| `POST` | `/v1/provider-discovery` | Fetch candidate upstream models without importing. |
| `POST` | `/v1/provider-metadata` | Query metadata suggestions and their sources. |
| `GET` | `/v1/routing/configuration` | Editable routing surface. |
| `POST` | `/v1/routing/configuration/validate` | Validate an overlay without applying it. |
| `PUT` | `/v1/routing/configuration` | Apply an overlay beside `models.json`. |
| `DELETE` | `/v1/routing/configuration` | Reset routing to the baseline file. |
| `GET` | `/v1/dashboard/theme` | Stored dashboard theme seed. |
| `PUT` | `/v1/dashboard/theme` | Store a dashboard theme seed. |
| `DELETE` | `/v1/dashboard/theme` | Reset the dashboard theme. |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completion. |

Successful chat responses carry `X-JEV-Route`, `X-JEV-Provider`, `X-JEV-Model`, `X-JEV-Route-Label`,
`X-JEV-Task-Type`, `X-JEV-Mode`, `X-JEV-Reason`, `X-JEV-Strategy`, `X-JEV-Decision-Id`, and, when
relevant, request, session, switch, reasoning, and switch-blocking headers. Endpoint contracts,
authentication, error codes, and reload semantics: [`docs/http-api.md`](docs/http-api.md).

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/local-install.md`](docs/local-install.md) | Curl, local, container, and wheel installation. |
| [`docs/cli.md`](docs/cli.md) | CLI commands, provider setup, and lifecycle management. |
| [`docs/credentials.md`](docs/credentials.md) | Write-only dashboard setup and file-based server credentials. |
| [`docs/admin-experience.md`](docs/admin-experience.md) | Dashboard settings, supplier connections, model import/editing and canvas workflows. |
| [`docs/models-config.md`](docs/models-config.md) | Every `models.json` field. |
| [`docs/routing-design.md`](docs/routing-design.md) | Routing contracts, strategies, sessions, evidence. |
| [`docs/http-api.md`](docs/http-api.md) | Endpoints, headers, errors, reload. |

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE)
(`AGPL-3.0-or-later`). You may use, modify, and distribute this project under its terms. Section 13
adds the network clause: if you run a modified version as a network service, you must offer the
users of that service the corresponding source code under the same license. Commercial hosting
is allowed, but modifications to the covered program cannot remain closed to those users.

## Development

From the repository root, install the dependencies and build the dashboard
before running the full tests or packaging:

```bash
uv sync --all-groups
npm --prefix frontend install
scripts/build-frontend.sh
uv run pytest -q
uvx pyright
uv build
```

The dashboard under `GET /dashboard` is a Vite + React app in `frontend/`. Its
generated output at `jev_gateway/static/` is ignored by Git. Source installs,
wheel builds, and tests that use the dashboard need the frontend dependencies.
The session-scoped `dashboard_bundle` pytest fixture rebuilds it once with
`npm --prefix frontend run build`; it does not install npm dependencies. Installed
Release wheels already contain the dashboard and need no Node.js.

After changing anything under `frontend/`, rebuild and check it:

```bash
scripts/build-frontend.sh           # build into jev_gateway/static
scripts/build-frontend.sh --check   # fail if the generated bundle is absent or stale
npm --prefix frontend run lint
npm --prefix frontend run test
```

The Dockerfile builds the bundle from `frontend/` in a Node stage before `uv
build`. The release workflow also builds it before the Python tests and wheel,
then validates the wheel's contents. See [`docs/releasing.md`](docs/releasing.md)
for tagged artifact validation and publication steps.

Packaging builds `jev-gateway` and exposes both `jev-gateway` (the foreground server) and `jev` (the management CLI).
