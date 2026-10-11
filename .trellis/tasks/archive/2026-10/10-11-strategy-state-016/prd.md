# Strategy-local workflow state

Parent: `.trellis/tasks/10-11-workflow-model-nodes-016`. Start after optional-model acceptance.

Own R2/R3 and A2-A4 durable state contracts: named editable workflows; explicit selected-model IDs; isolated policy and layout; runtime candidate scope; migration; read/validate/apply/reset/list/create/delete APIs; frontend DTO/client/pure draft/graph helpers. UI controls are owned by the following child.

Pass requires backend tests for v1 compatibility, partial models in strategy selection, distinct strategy rules/layouts, create/delete/default guards, invalid IDs/shape/references, no cross-strategy/global-provider writes, rollback and node removal preserving supplier models. Pure frontend draft/graph/history tests must distinguish an empty selection from legacy absence and retain only referenced legacy nodes.
