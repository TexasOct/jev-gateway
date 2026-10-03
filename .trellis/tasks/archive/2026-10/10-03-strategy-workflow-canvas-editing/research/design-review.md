# Independent design review

The read-only reviewer returned REWORK for three technical gaps. The parent verified each against source and revised the artifacts before directing implementation changes.

1. `DecisionMatrixStrategy.decide` (`jev_gateway/strategy/matrix.py:63-77`) resets the choice on valid answers and no matching rule. The default is the first ordered policy label with `policy.selection`, while configured fallback handles failed or invalid answers. The prior frontend explanation conflated those paths. Correct the graph, copy and configured preview without changing the runtime.
2. `_validate_options` (`matrix.py:161`) supports only choice questions with at least two nonempty criteria. Do not present score/noul or incomplete criteria as valid routing outputs. Explain and block invalid draft review.
3. `jev_gateway/canvas_layout.py:13` bounds stored positions, node count and encoded bytes. Height-aware arrangement must split or fail explicitly before persistence rather than clamp nodes together. Cover cumulative heights above 20000, 257 nodes and Unicode-heavy layouts; preserve rollback and layout-only writes.

The parent added backend regressions that distinguish valid-no-match and decision-failure behavior with and without rules, using different default/fallback labels and selection modes. Browser acceptance must exercise the corresponding frontend representation.
