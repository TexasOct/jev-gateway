# Native layout and overlay rework

The native suites exposed a fixture constraint and two application defects. The
failed suites remain in the protected acceptance cache; none is reclassified as
a pass.

`native-close-layout/suite-20261002T135044.567587Z.json` failed the rework and
layout flows because its CSS assertion required `gridColumnStart: "1"` even
when the narrow information body spans both columns. The helper now checks the
body's actual bounded width, height, scroll behavior and row placement, and
accepts `span 2` only at the narrow viewport with full-width boundary checks.
Geometry uses the numeric-only `information` field so the request-body privacy
scrubber does not omit it. Request-body redaction remains in place.

That suite also found two active inherited wires when a rule and fallback shared
one pool/model. `ConfiguredRouteFlow` now scopes each rendered inherited wire to
its owning branch. Source unit and bilingual desktop/narrow browser regressions
verify that selecting either branch leaves the other wire idle without writing
an overlay.

The next suite, `native-close-layout/suite-20261002T141633.444355Z.json`, passed
baseline setup, both key boundaries, source/retained routing checks and layout.
Its implicit-choice flow failed before the confirmation dialog appeared. Source
inspection found that matrix options accept selection-only choices, `{}` and
the existing `tier` alias, while overlay validation rejected the alias and empty
fallback. `routing_overlay.py` now accepts those legal shapes and still rejects
unknown keys, invalid values and simultaneous `label`/`tier`. Merge and reload
preserve the original choice fields. Explicit label editing removes its former
alias; viewing a choice or editing selection does not infer a label.

The earlier source candidate at wheel SHA256
`3fcf4d3e5f55b818f9c3235660d3090fddcd6191ec1b5218604a616b9197bb5f`
passed 265 frontend unit tests, 120 browser tests and package validation, with
54 package files matching that source. It predates the overlay fix and is not
the release candidate. Final frozen-source gates and rebuilt installed acceptance
are recorded separately by the current gate run.
