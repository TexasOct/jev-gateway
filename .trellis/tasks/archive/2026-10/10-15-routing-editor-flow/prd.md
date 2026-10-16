# Routing editor flow

## Goal

Make the routing canvas and its inspector readable and convenient for the task-type/complexity workflow shown by the user.

## Requirements

- Represent the combined classified answer set with one normal output and a separate failure path.
- Show ordered rules with readable conditions, destinations, and a clear continuation to the next rule.
- Reduce repeated labels, colored borders, oversized port decoration and duplicate actions.
- Let operators switch between question definitions and understand AND/OR condition semantics while editing.
- Preserve strategy-scoped drafts, rule order, explicit empty-label repair, native pointer/keyboard actions, layout persistence, history, validation and review.
- Preserve existing dirty source and unrelated configuration/documentation work.

## Acceptance

- Criterion growth does not multiply identical entry wires or increase the question card height.
- Default no-match and classification failure remain distinct paths.
- Native connection repair, rule editing, question switching, history and layout gestures work.
- Desktop and narrow layouts remain accessible in English/Chinese and light/dark themes.
- Frontend lint, type/build, units and focused browser checks pass.

The user's request to start improving the editor authorizes implementation. Local runtime configuration, dependencies and release publication are outside this task.
