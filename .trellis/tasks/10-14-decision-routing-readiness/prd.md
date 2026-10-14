# Diagnose and expose disabled decision routing

## Goal

Diagnose operator review fallbacks and add explicit decision enable controls with readiness validation and regression coverage.

## Requirements

- Establish why the operator's task_aware requests all use review fallback without exposing secrets or request content.
- Provide an explicit Dashboard operation to enable or disable external decision routing.
- Explain disabled, unconfigured, and missing-credential states before the operator enables routing.
- Reject enabling without a configured decision provider and a resolved credential.
- Preserve explicit disabled settings, configured fallback behavior, other decision settings, and unrelated in-progress changes.

## Acceptance Criteria

- [x] Diagnosis is backed by read-only counts of recent routing decisions and safe configuration facts.
- [x] Validation does not persist or activate the decision toggle; applying it persists and activates with normal revision/rollback safeguards.
- [x] A configured matrix leaves review fallback after an accepted enable operation and valid mocked provider answers; disabling restores local fallback without provider calls.
- [x] Dashboard messages and controls cover both locales, readiness, pending and read-only states.
- [x] Backend tests, frontend tests/lint/build, focused native browser coverage, and Pyright pass.

## Notes

- Operator runtime has decision.enabled=false and no decision providers. Restoring live classification requires actual endpoint/credential configuration; do not invent it or reuse unrelated secrets.
- Integrated the strategy-provider selection branch. Selecting/clearing a strategy provider remains independent of global enablement; selected-provider failure uses the strategy fallback exclusively.
- Final combined verification: backend 3359 passed, 2 skipped; frontend 432 passed; native browser 12 passed, including English and Chinese selection/save/reload/clear flows and the 320px viewport. Pyright, build, lint, and browser TypeScript checks pass; lint retains four existing Fast Refresh warnings.
