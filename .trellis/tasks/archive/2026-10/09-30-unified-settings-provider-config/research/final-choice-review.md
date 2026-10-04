# Final choice-contract review

Independent reviewer `24a98e54-1f59-4e6` returned PASS for the final choice,
overlay, selector and inherited-wire fixes. The reviewer found no required
rework in this scope and read the complete relevant implementation and test
bodies, including the continuation of `RoutingEditor.tsx`.

Overlay shape accepts `{}`, selection-only choices and the existing `tier`
alias for rules and fallback. Unknown keys, simultaneous `label`/`tier`,
non-string values and blank strings remain invalid. Matrix validation checks
label membership and selection modes, normalizing the alias only in its copied
runtime choice.

The overlay validator deep-copies input. Merge copies the baseline and replaces
only supplied sections. Draft construction and payload generation copy choices
without adding labels. The priority-save regression covers selection-only rules,
retained `tier`, empty fallback, disk read-back, applied priority after reload
and unchanged baseline bytes.

`updateChoice()` removes `tier` only when a patch explicitly supplies `label`,
and removes `label` when the patch supplies `tier`. Editing selection preserves
the original name or omitted label. Draft tests cover both rules and fallback
and retain the original draft.

Selectors resolve `label`, then `tier`, then the first configured label through
the shared read-only helper. Advanced controls and inspectors use that result;
explicit change handlers own draft mutations. Projection tests check unchanged
configuration/draft JSON, dirty state and unmodified implicit payload fields.

Inherited-wire highlighting requires path membership and its owning branch.
Tests select either rule or fallback when both share a pool/model, in English
and Chinese at desktop and 320px widths. Inherited destinations remain
display-only; connection classification rejects inherited-edge editing, and
tests retain unchanged membership/default payloads.

The reviewer ran no tests, builds, network requests or real calls, made no edits
and launched no delegate. This review does not certify an installed wheel,
public release or local reset. Execution evidence is recorded separately in the
final gate and installed-business reports. Earlier obsolete wheels remain
historical evidence.
