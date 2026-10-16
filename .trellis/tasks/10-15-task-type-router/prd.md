# Task-type and complexity routing strategy

## Goal

Implement the approved DeepSeek/Luna/Sol task-type and complexity routing design and add it to the local JEV Gateway using managed configuration APIs.

## Requirements

- Add an independent named strategy, `task_type_router`, to the running local
  application using the existing supported configuration owner.
- Classify `task_type` as doc, research, general, review, code or operator and
  `complexity` as low, medium, high or unknown in one classification request.
- Route doc/research to Luna; general and low/medium review to the current local
  DeepSeek; low/medium code to Luna; high/unknown code and review to Sol; operator
  to Sol. Keep classification failure on a distinct fallback label bound to Sol.
- Judge complexity by impact scope, implementation certainty and validation
  difficulty. A clearly specified multi-file feature can remain medium.
- Resolve provider-qualified model IDs from the live catalog and bind only the
  existing enabled models. Reuse the configured decision provider by ID.
- Reevaluate requests with fresh routing so a session can change task type.
- Preserve other strategies, their default selection and layout, supplier model
  records, credentials, baseline configuration, theme and stored request history.
- Keep all credentials and existing request bodies out of reports and artifacts.
- Preserve unrelated dirty README, project-structure and provider-onboarding work.

## Approved Scope

The user reviewed successive rendered sketches, requested DeepSeek for general
and review work, requested complexity-based Luna/Sol coding selection, and then
explicitly authorized implementation and local application write. This task
implements that accepted design without another planning approval round.

## Acceptance Criteria

- [x] A reusable secret-free v2 strategy payload contains the intended bindings.
- [x] Installed catalog/registry validation accepts the new definition.
- [x] All 24 valid task/complexity combinations select the intended model; failed
  or invalid classification selects the separately identified Sol fallback.
- [x] Authenticated management validation succeeds before apply.
- [x] The strategy is installed, visible in the strategy and model lists, and
  persists through a normal configuration reload.
- [x] Synthetic live routing previews demonstrate all three model destinations,
  including low/medium versus high/unknown code and routine versus complex review.
- [x] Baseline/credentials/theme and unrelated strategy/layout ownership checks
  pass; existing history remains intact and the service stays healthy.

## Out of Scope

- Adding suppliers, downloading models, changing provider endpoints/keys,
  changing the existing application default, editing engine/UI behavior, release
  publication, installation upgrades or unrelated documentation changes.
