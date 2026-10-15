# Implementation plan

User approval: "开始实现", followed by emphasis on appropriate UI design. The final proposal is unchanged in scope.

## Ownership board

| Stage | cwd | Exclusive contract/files | Isolation | Gate/handoff |
| --- | --- | --- | --- | --- |
| Backend | primary checkout, serial sole writer | Python routing/evidence/history/diagnostic modules, Python tests and associated docs; no frontend | no concurrent source writer; clean baseline 6fbd3a7 | focused pytest + Pyright; durable backend-contract.md and report |
| Frontend | same checkout after backend handoff | frontend source/tests and UI-associated docs; no Python | serial sole writer on accepted backend result | lint/test/build, synthetic browser screenshots and interaction receipts |
| Integration/check | same checkout after component handoffs | integration fixes only, scoped by findings | sole writer if fixes needed | complete applicable tests, fresh independent review and native diagnostics |

## Ordered work

- [x] Diagnose and repair current operational enablement/endpoint errors using existing management API (preceding turn).
- [x] Create task/artifacts after approval; preserve the reviewed research.
- [x] Start task with populated context manifests.
- [x] Backend: add immutable classifier attempt/result evidence with compatibility for injected makers; propagate rule/default/bypass provenance to records.
- [x] Backend: add safe recorded-configuration context, bounded retained-session access and explicit synthetic decision diagnostics. Prove auth, history after eviction, legacy rows, safe errors and nonmutation.
- [x] Freeze the backend API/status/selector contract and focused receipts in research/backend-contract.md.
- [x] Frontend: redesign the monitoring session workspace and request/content details, then integrate typed evidence/history/diagnostics with existing ownership guards.
- [x] Frontend: validate desktop/narrow, locales/themes, keyboard/paging/errors/context reading with isolated browser fixtures and screenshots.
- [x] Independent integrated check; fix valid findings and rerun their affected gates.
- [x] Update executable contracts/specs and report exact completed scope, validation, remaining installation/release state.

Implementation accepted after independent recheck `6a7f1845-ad95-43e2-9de3-6e34ce58b137` (PASS) and committed as `3c3dc7caea6bdbc4188284f86867c128ce5986ef`. The user authorized task archival, stable0.1.11 publication and local overwrite installation without backups. The task is archived; publication/install observations follow in `acceptance.md`. Original detailed receipts remain under local `research/`.

## Commands

- Backend iteration: `LITELLM_LOCAL_MODEL_COST_MAP=True uv run pytest -q` with relevant decision/strategy/records/dashboard/diagnostics test files, then `uvx pyright`.
- Frontend: `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build`; TypeScript/browser commands from existing project owners.
- Final: complete `uv run pytest -q`, `uvx pyright`, frontend lint/test/build, relevant browser owners and `uv build` after fresh assets. Record full-suite/environment failures distinctly.
- Native LSP diagnostics probe changed authored Python/TS paths after CLI verification; empty cached diagnostics are not proof.

## Constraints

No agent commits, pushes, releases, changes operator HOME, accesses real message bodies, or starts generation calls. Backend and frontend writers remain sequential. Parent owns task/spec integration and final acceptance. Report failed native commands without hiding them behind reruns. Request a checkpoint on genuine context/tooling blockage; preserve partial source before any replacement.
