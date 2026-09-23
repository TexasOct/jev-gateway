# Backend development guidelines

> Coding and review conventions for the JEV Gateway Python backend.

## Overview

JEV Gateway is a Python 3.10+ FastAPI service in the flat `jev_gateway`
package. It presents an OpenAI-compatible API, selects provider-qualified models
through pluggable routing strategies, and stores routing evidence in SQLite on a
best-effort basis.

These files document conventions verified against the current source and tests.
Product behavior and configuration details remain in `README.md` and `docs/`.

## Guidelines index

| Guide | Description | Status |
| --- | --- | --- |
| [Directory structure](./directory-structure.md) | Module ownership, extension points, imports, and naming | Complete |
| [Decision providers](./decision-providers.md) | Decision config, protocol adapters, compatibility, failover, and validation | Complete |
| [Database guidelines](./database-guidelines.md) | SQLite schema, writer queue, migrations, and retention | Complete |
| [Error handling](./error-handling.md) | Domain exceptions, OpenAI error envelopes, and degradation | Complete |
| [Quality guidelines](./quality-guidelines.md) | Types, tests, forbidden patterns, and verification | Complete |
| [Logging guidelines](./logging-guidelines.md) | Structured fields, formats, levels, and sensitive data | Complete |

## Product references

- [`README.md`](../../../README.md): product entry point, quick start, endpoint
  quick reference, and documentation index
- [`README.zh-CN.md`](../../../README.zh-CN.md): Simplified Chinese mirror of
  `README.md`
- [`docs/routing-design.md`](../../../docs/routing-design.md): routing contracts,
  strategy behavior, sessions, reasoning, and evidence semantics
- [`docs/models-config.md`](../../../docs/models-config.md): complete
  `models.json` field reference
- [`docs/http-api.md`](../../../docs/http-api.md): HTTP endpoint contracts, response
  headers, error codes, and reload semantics
- [`docs/local-install.md`](../../../docs/local-install.md): installation and
  operational checks

## Documentation conventions

`README.md` is the canonical English entry point, and `README.zh-CN.md` mirrors
it. Keep the two in step: identical heading order and levels, identical code
blocks except translated comments, and identical relative link targets. Change
the English file first, then follow with the Chinese one.

Deep configuration and behavior detail belongs under `docs/`, one topic per file.
`README.md` carries the positioning, the quick start, and the shortest useful
reference, then links out. Keep a topic in exactly one place so the two languages
cannot drift apart.

## Pre-development checklist

1. Read [Directory structure](./directory-structure.md) and identify the owner
   module for the change.
2. Read the domain guide for the affected boundary: database, error handling, or
   logging.
3. Read [Quality guidelines](./quality-guidelines.md) before changing Python or
   tests.
4. For routing or configuration behavior, read the relevant product reference
   and trace the contract through catalog parsing, strategy selection, gateway
   presentation, evidence recording, and tests. For decision-provider changes,
   also read [Decision providers](./decision-providers.md).
5. Search for an existing helper, registry, protocol, or test builder before
   adding another implementation.

## Quality check

Before considering a backend change complete:

- Confirm the change respects the package facades and extension registries.
- Confirm errors and logs contain no secrets or request content.
- Confirm evidence-storage failure cannot gate normal request serving.
- Add focused tests for success, invalid input, and degraded behavior where
  relevant.
- Run `uv run pytest -q` and `uvx pyright`.
- Run `uv build` when packaging, dependencies, or the entry point may be affected.
- Update `README.md`, `README.zh-CN.md`, or `docs/` when the public routing or
  configuration contract changes.

All Trellis spec documentation is written in English to match code comments,
docstrings, log messages, and errors.
