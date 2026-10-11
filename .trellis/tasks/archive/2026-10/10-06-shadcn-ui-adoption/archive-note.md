# Archive disposition

The operator requested archival followed by a scoped commit on 2026-10-11. Construction uses B throughout the dashboard. All four child deliveries passed their independent reviews, and parent criteria A1 through A8 are accepted. E1 is PASS by operator manual confirmation `验收通过`; see `e1-manual-acceptance.md`.

The retained current-candidate receipts contain 755 passing browser identities, 409 frontend units and 3212 Python tests. These results bind the accepted working candidate, including inherited business changes. The selected B-only commit tree receives its own relevant verification; it must not inherit those exact full-suite claims without matching source.

Historical children:

- `10-06-shadcn-foundation`
- `10-06-shadcn-primitives`
- `10-06-shadcn-config-surfaces`
- `10-06-shadcn-operational-surfaces`

At initial archival, the Git commit followed the move. `commit-plan.md` records that scope, including the E1 follow-up and mixed supplier browser file. Inherited metadata, locales, backend changes and source-adoption cases remained uncommitted at that point. Original failure and review receipts remain unchanged. Release and operator service changes were outside that initial closure.

The operator subsequently authorized including all remaining changes in 0.1.5, publication and the local upgrade. These are complete; see [the release and upgrade record](release-0.1.5.md). The original archive and acceptance receipts retain their historical source bindings.
