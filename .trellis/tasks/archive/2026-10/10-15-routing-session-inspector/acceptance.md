# Routing/session inspection acceptance

Implementation accepted on `feat/routing-session-inspector`, based on `6fbd3a7`.
Source commit: `3c3dc7caea6bdbc4188284f86867c128ce5986ef`.
The user subsequently authorized completion, archival, publication of the next
stable version and local overwrite installation, explicitly without backups.
Version preparation selects `0.1.11`; only the root project version changes in
the dependency lock. Publication and local installation are pending at archival.

## Accepted scope

- Immutable classification evidence distinguishes accepted answers, disabled or
  unavailable providers, safe transport failures, rule matches, unmatched strategy
  defaults and classification fallback. Model defaults and reply outcomes remain
  independent. Existing evaluator injection and routing/pool behavior are retained.
- Historical sessions use authenticated bounded retained scope, signed cursors,
  separate memory presence and recording-time configuration context. Missing old
  evidence remains unknown; listing metadata does not disclose request bodies.
- Monitoring leads with current/retained sessions and compact request selection.
  Wide details explain the chosen model before technical evidence and render a
  selected inbound context snapshot by role. Snapshots are never concatenated or
  presented as captured final assistant replies.
- Explicit provider diagnostics use fixed synthetic content, credential ownership
  and bounded safe networking. They do not enable classification, save settings,
  generate chat or expose raw upstream prose.
- Desktop/narrow layouts, both locales/themes, native keyboard/focus, paging,
  stale responses and local caps were verified with synthetic fixtures.

## Verification

Parent gates: backend3405 passed/2 skipped; CLI Pyright zero errors/warnings;
frontend446 unit tests,212 preview browser cases and9 cloud cases passed.
Frontend lint has zero errors/four existing Fast Refresh warnings; production
build, browser TypeScript and Python packaging passed. Wheel inspection verified
96 package/static/template files against current source.

The original independent review found two P2 defects. Both were repaired:
view-owned history/detail requests retire on departure, including stale401 and
finalizers; terminal-page overflow is computed after deduplication and before
slicing even when `has_more=false`. Independent recheck
`6a7f1845-ad95-43e2-9de3-6e34ce58b137` returned PASS, reran all nine decisive
browser regressions and verified47 source hashes plus nine gate-log hashes.
There are no remaining required P1/P2 in that review scope.

Three unrelated integration failures were reproduced at the same definitions on
isolated baseline `6fbd3a7`; they are not counted as passing. Native LSP import
resolution findings and27 inconclusive paths remain an analyzer environment
limitation, not a clean LSP gate. Synthetic evidence does not certify real
upstream connectivity. Retained history remains bounded and best effort.

Detailed original logs, screenshots, failed/time-out attempts, source fingerprints
and native review reports are retained locally under `research/`, excluded from
Git by the repository's existing rules. This tracked summary contains no
operator configuration, credentials, private prompts or raw upstream content.
