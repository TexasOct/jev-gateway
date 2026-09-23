# Credential-safe policy for upstream error text

Research note for task `09-23-gateway-session-dashboard`. Read-only inspection of the
current uncommitted worktree. No code, tests, or planning artifacts were changed.

## Reproduced leak

A provider exception whose message contains `Authorization: Bearer test-key-small`
reaches three places unchanged:

| Surface | Path | Evidence |
| --- | --- | --- |
| 502 response body | `str(error)` copied into `error.message` | `jev_gateway/gateway.py:976` |
| SQLite `outcomes.error_message` | `error_message=str(error)` passed to `record_outcome` | `jev_gateway/gateway.py:958`, written at `jev_gateway/records.py:964-978` |
| DEBUG traceback logs | `logger.debug(..., exc_info=True)` renders the full traceback | `jev_gateway/gateway.py:971`, rendered at `jev_gateway/logging/config.py:141` (JSON) and `jev_gateway/logging/config.py:84` (pretty and compact) |

The streaming path re-raises instead of building a 502 (`jev_gateway/gateway.py:1019-1020`)
and never passes a message (`jev_gateway/gateway.py:1023-1028`), so it leaks only through
the DEBUG traceback.

The dashboard does not currently read the message. The evidence query selects only
`o.error_type` (`jev_gateway/records.py:1103`), and `_evidence_row` serializes only
`error_type` (`jev_gateway/records.py:821`). The value still sits in the SQLite file.

## What the specs already require

- `error-handling.md:158-159` forbids API keys, prompt bodies, message payloads, and raw
  configuration secrets in logs or error responses.
- `error-handling.md:139-144` asks for a single warning with structured fields plus
  `error_type`, and a DEBUG traceback.
- `logging-guidelines.md:179` says not to log the exception message when it may contain
  request content or credentials, and to prefer `error_type` plus a debug traceback.
- `README.md:331-332` promises that resolved credentials and authorization headers are
  redacted before persistence. That promise currently covers the sanitized LiteLLM
  request, not exception text.

So the code is out of step with docs that were already written. The fix aligns code with
the existing contract rather than changing the contract.

## Recommended policy

Untrusted exception text never crosses a trust boundary. The client, the database, and the
dashboard see gateway-authored text and bounded exception metadata only. The operator log
keeps the traceback, with credential shapes masked at the formatter.

### 1. Client-facing 502 message

Replace `str(error)` at `jev_gateway/gateway.py:976` with a fixed gateway-authored string,
for example `"Upstream provider request failed."`. Keep `type` as the exception class name
(`gateway.py:977`) and `code` as `"upstream_error"` (`gateway.py:978`). Keep the existing
`raise ... from error` chaining at `gateway.py:981` so operators keep the cause.

The fixed string beats a redacted string here. Redaction of arbitrary provider text is a
denylist that has to stay ahead of every provider's error format. A constant is provably
safe, and OpenAI-compatible clients branch on `error.code` and `error.type`, both of which
survive. This is what `error-handling.md:158` already demands.

### 2. Persisted outcome message

Drop the `error_message=str(error)` argument at `jev_gateway/gateway.py:958` so the column
stays NULL for upstream failures. Keep `error_type=type(error).__name__` at
`jev_gateway/gateway.py:957`.

Keep the `outcomes.error_message` column and the `OutcomeRecord.error_message` field
(`jev_gateway/records.py:115`, `jev_gateway/records.py:332`). No migration, and the field
stays available for gateway-authored values later. The producer list is short: `gateway.py:958`
is the only caller that passes a message, and `decision.py:360-399` is the only plumbing.

NULL is better than a redacted string because nothing reads the message. The dashboard
serializes `error_type` only (`jev_gateway/records.py:821`, `jev_gateway/records.py:1103`),
so a stored message adds disk risk with no reader.

### 3. Structured logs and traceback

Leave the warning log as is. It already carries only allowlisted fields
(`jev_gateway/gateway.py:960-970`, `jev_gateway/gateway.py:1010-1018`).

Keep `exc_info=True` at `jev_gateway/gateway.py:971` and `jev_gateway/gateway.py:1019`.
The traceback is the one place with line-level diagnosis, and both specs ask for it
(`error-handling.md:140-141`, `logging-guidelines.md:179`).

Add credential masking at the logging boundary instead. Override
`GatewayFormatter.formatException` in `jev_gateway/logging/config.py` so every rendered
traceback passes through a text redactor. One override covers all three formats:
pretty and compact render the traceback through the base `Formatter.format` call at
`jev_gateway/logging/config.py:84`, and JSON renders it at `jev_gateway/logging/config.py:141`.

Turning `exc_info` off would also stop the leak, but it throws away the traceback the
specs ask for and removes the line numbers an operator needs. Masking keeps both.

### 4. Dashboard output

No code change. Keep `error_message` out of `_evidence_row` (`jev_gateway/records.py:821`)
and out of the evidence query (`jev_gateway/records.py:1103`). Lock that with a test so a
later change cannot reintroduce it.

The `storage.error` text that the dashboard does show (`jev_gateway/records.py:682`,
`jev_gateway/records.py:1438`, surfaced at `gateway.py:525` and consumed at
`dashboard.py:43`) carries storage failures, not provider exceptions, so the repro path
does not reach it. It stays in scope only as a general rule.

## Redaction helper

`sanitize_upstream_payload` cannot be reused for this. It takes a `Mapping`
(`jev_gateway/records.py:496-501`) and redacts by field name, so it cannot process a free
string.

Add a small `redact_secret_text(text: str) -> str` in `jev_gateway/records.py`, next to the
existing vocabulary so both redactors share one word list:

- `_SECRET_PARTS` at `jev_gateway/records.py:439`
- `_secret_field` at `jev_gateway/records.py:463-478`
- the `_SAFE_TOKEN_COUNT_FIELDS` exemption at `jev_gateway/records.py:440-446`, applied at
  `jev_gateway/records.py:464-466`, which keeps `max_tokens` and `total_tokens` from being
  over-redacted.

The redactor should mask at least `Authorization:` header values, `Bearer <token>`,
`sk-`-style API keys, and `name=value` or `name: value` pairs where the name matches the
secret vocabulary. If the process registers the resolved credential values, literal
matching those values is the strongest layer and costs one set. The gateway already builds
that set at `jev_gateway/gateway.py:932`.

## Backward compatibility

- One deliberate test change. `tests/test_gateway.py:746` asserts
  `"exploded" in response.json()["error"]["message"]`. It must become an assertion that the
  fixed message appears and that no upstream text does.
- Clients lose the upstream wording in the 502 body. Impact is display only, since
  `error.code` and `error.type` stay.
- `outcomes.error_message` becomes NULL for upstream failures going forward. The schema and
  the dataclass are unchanged, so no migration runs.
- Log tracebacks render a mask in place of credential values. Module names, line numbers,
  and exception types remain.
- Databases written before the fix still hold raw text. The policy cannot un-write them.
  A one-time scrub or a documented note is worth a separate change; keep it out of the
  smallest fix.
- Optional hardening: `error_type` uses `type(error).__name__` at
  `jev_gateway/gateway.py:957`, `967`, and `977`, and it crosses both the response and the
  disk boundary. Clamp it to `[A-Za-z0-9_]{1,64}` before use.
- The change needs no spec rewrite. It brings code in line with `error-handling.md:158`,
  `logging-guidelines.md:179`, and `README.md:331-332`. A one-line spec note that outcomes
  store `error_type` only would close the loop.

## Regression tests

1. `tests/test_gateway.py`, replace or extend `test_upstream_failure_becomes_a_gateway_error`
   at line 728. Completion raises `RuntimeError("Authorization: Bearer test-key-small")`.
   Assert 502, `error.code == "upstream_error"`, the fixed message, and that
   `test-key-small` and `Bearer` appear nowhere in `response.text`.
2. `tests/test_gateway.py`, SQLite check after the same call, in the style of
   `tests/test_records.py:88`. Read `error_message, error_type` from `outcomes` and
   assert NULL plus `"RuntimeError"`. Then read the database file bytes and assert
   `b"test-key-small" not in data`, which catches any other column.
3. `tests/test_gateway.py`, dashboard detail, in the style of `tests/test_gateway.py:1006-1050`.
   Assert the session-requests body contains no `test-key-small` and no `Bearer`, and that
   `"error_message"` is absent from the serialized response.
4. `tests/test_logging_config.py`, new test. Build `GatewayFormatter` in pretty, compact,
   and json and format a record whose `exc_info` carries the credential message. Assert the
   credential is absent in all three outputs and the mask marker is present. This exercises
   `jev_gateway/logging/config.py:84` and `jev_gateway/logging/config.py:141`.
5. `tests/test_gateway.py`, `caplog` at DEBUG. Drive the failed request and assert no
   captured record contains the credential. The existing logging test at
   `tests/test_logging_config.py:60-78` only checks an unlisted `extra` field, not exception
   text.
6. `tests/test_records.py`, new unit test for `redact_secret_text`. Mask
   `Authorization: Bearer sk-abc`, `api_key=xyz`, `token=...`, and `password=...`. Leave
   `max_tokens` and `total_tokens` untouched, matching `jev_gateway/records.py:440-446`.
   Leave ordinary text unchanged.
7. `tests/test_gateway.py`, streaming failure. The iterator raises with the credential.
   Assert no log record carries it and `outcomes.error_message` stays NULL, which
   `jev_gateway/gateway.py:1023-1028` already guarantees.
8. Optional: a dashboard storage-degraded test asserting that `storage.error` text cannot be
   influenced by a provider exception.

## Scope note

This policy is independent of the R8 provider-summary endpoint, but it should land first.
R8 adds another dashboard surface that reads the same evidence tables, and it would inherit
the leak if it were built on the current storage behaviour.
