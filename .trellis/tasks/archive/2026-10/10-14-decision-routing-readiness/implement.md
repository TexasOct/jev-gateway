# Execution

1. Retain safe runtime diagnosis and existing dirty-source snapshots.
2. Write a failing transaction-to-real-matrix regression for enabling and disabling decision routing. Cover invalid operation shapes, absent providers/credentials and multi-operation credential resolution.
3. Implement the new operation in the provider configuration owner.
4. Add the decision readiness control, shared operation type and English/Chinese copy. Add static control tests and native browser interactions using existing supplier fixtures.
5. Run focused backend/frontend/native-browser tests, then required full backend and frontend checks plus Pyright/build.
6. Update provider configuration and decision documentation/spec contracts, and preserve source-bound results.

All implementation and source verification steps are complete. Integration with
`work/strategy-decision-provider-selection` retains explicit global enablement,
exclusive strategy selection, and legacy unselected failover. The combined API
regression traverses workflow validation/apply/reload, enablement, selected-model
calls, selected-provider failure, clearing selection, and disabling. Native
browser coverage saves and clears the selection independently of enablement in
both locales. See `research/final-verification.md` for command receipts and the
remaining operator configuration requirement.
