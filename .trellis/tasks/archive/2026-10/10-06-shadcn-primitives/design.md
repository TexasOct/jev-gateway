# Shared primitives design

Own generated registry sources under `frontend/src/shared/ui/primitives`, public wrappers under `shared/ui`, and only the global control defaults necessary for these controls. Consume foundation's accepted CLI, token and alias contract.

Avoid parallel skins: wrappers forward/re-export official styling and add narrowly documented compatibility, including default button type and preserved event/ref/form semantics. Keep React Refresh exports compatible with the existing separated variant module. Labels/help/errors remain associated with their field; alert roles remain caller-owned where needed.

Use official NativeSelect for existing simple selects. Keep unknown/true/false and empty/null sentinel values. A Switch represents only an existing boolean toggle; Checkbox selection/indeterminate values must remain distinguishable. Retain native color control and graph-specific interactions.

Reuse the latest accepted Radix Dialog API. Parents still decide whether dismissal is allowed; the shared wrapper handles modal presentation and accepted focus/suspension behavior. Menus and tooltips must obey modal focus/layer/dismiss ordering. Canvas coordinate menus are outside generic primitive ownership.

Use parent matrix behavior tests and computed styles to detect base CSS conflicts and geometry regressions. If a primitive cannot preserve a behavior, record a specific compatibility adapter and receipt instead of hiding it with global CSS or reducing the assertion.
