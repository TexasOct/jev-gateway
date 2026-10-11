# Approved migration acceptance exceptions

## Current E1 disposition

On 2026-10-11, after the interactive native-menu acceptance page was handed over,
the operator replied "验收通过". E1 is **PASS by operator manual acceptance** for
the source-bound current candidate. The previously open observation is closed;
the original automated failures remain failed historical evidence. This does not
create a passing Playwright receipt or extend the observation to unreported
browsers, public installed environments or unrelated behavior.

The current record is [e1-manual-acceptance.md](e1-manual-acceptance.md), with
machine-readable custody in `research/e1-operator-acceptance.json`.

## Original E1 exception: native select popup first Escape

The operator explicitly approved this exception by replying “同意” to the proposal
to leave native select popup-first dismissal unverified and continue the B page
migration. This approval applies to this shadcn migration only.

The unresolved observation is whether the first Escape closes an open browser/OS
native select popup while preserving the surrounding Radix Dialog. It remains
**UNVERIFIED**. Approval does not establish that the product behavior passes.

The independent Primitives review found no concrete production defect. Its
supplemental popup probe establishes `:open=true`, but Playwright Escape leaves
the popup open through the original 5000ms predicate deadline. A plain native
select without React, Radix or Dialog reproduces the same failure in the same
installed Chromium runner. Both failures, fixture/runner identities and source
hashes remain in the Primitives research receipts.

Evidence:

- `../10-06-shadcn-primitives/check-handoff.md`: original BLOCKED review.
- `../10-06-shadcn-primitives/research/check-validation.json`: source and runner identities.
- `../10-06-shadcn-primitives/research/check-popup.log`: production popup probe.
- `../10-06-shadcn-primitives/research/check-popup-control.log`: plain-select control.

The exception removes only this missing native-popup observation as a blocker to
P2, downstream construction and parent A5/A8 acceptance. The reviewer must still
verify all other applicable criteria and record the final result as passing the
approved scope with E1 unverified. Final handoffs and the parent report must carry
the exception explicitly; they may not claim every original behavior was proven.

Preserve existing native select values, events, form/keyboard semantics, native
popup behavior, and Radix guarded dismissal/focus/auth ownership. Keep every
existing assertion, normal deadline and zero retries. The two additive `.check.ts`
diagnostics retain their failures and separate configuration; they do not replace
or weaken the normal browser suite. Do not add native-menu/HID harnesses or a
production workaround for the runner limitation. A concrete new product defect
still requires repair and cannot be waived under E1.

Historical admin exceptions remain separate. No staging, commit, publication,
version bump or real operator configuration change is authorized here.
