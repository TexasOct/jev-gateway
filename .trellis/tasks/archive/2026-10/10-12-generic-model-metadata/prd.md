# Generic model metadata automatic fill

## Goal

Automatically fill generic model prices and explicitly declared parameters when the selected brand and upstream model ID match public catalog data. A custom serving host must not leave otherwise available suggestions empty.

## Background and authorization

- The installed JEV Gateway 0.1.6 returns populated Models.dev evidence for `gpt-6.1-sol`, but the configured OpenAI-compatible proxy receives null automatic fields because its host differs from `api.openai.com`.
- A read-only query against the running service reproduced this result. Changing only the query candidate's `api_base` to the official endpoint returned 11 of 12 automatic fields from the same source timestamps. `json_mode` remained unknown. The runtime models and credential files were unchanged.
- The user explicitly chose generic prices as the automatic standard without an official-host requirement. After reviewing the scope covering prices and other explicit parameters, the user authorized task creation and implementation with `创建任务并开始`.

## Requirements

- R1: Match generic Models.dev provider rows and LiteLLM fallback rows by the selected source brand/provider and exact upstream model ID, independently of `api_base` host, path and port. Retain supported transport compatibility and exact ID matching.
- R2: Automatically suggest available input, output, cache-read and cache-write base prices, context window, maximum output, and explicitly declared supported capability/effort fields using existing field projection and unit rules.
- R3: Preserve source identity, retrieval/update times, canonical association, original evidence and tier/conditional pricing. Canonical model rows continue to supply only absent nonprice facts; provider overrides retain precedence and overridden canonical facts remain reference evidence.
- R4: Preserve unknown/null versus false/zero/empty-list distinctions, independent-source conflicts, source failure states, and manual field ownership. Refresh must not overwrite manual values or fabricate missing facts. A `structured_output` declaration alone does not certify `json_mode`.
- R5: Keep public metadata requests credential-free and retain existing network validation. Preserve endpoint-specific OpenRouter native-source selection as a separate concern from generic catalog applicability.
- R6: Update the relevant backend contract, product documentation and tests so the generic-price standard is explicit. Existing frontend automatic prefill must accept the new applicable source suggestions and preserve manual fields.

## Acceptance Criteria

- [x] AC1 / R1-R2: A synthetic OpenAI provider using a custom host and exact `gpt-6.1-sol` fixture receives input `2`, output `10`, cache-read `0.1`, cache-write `2.5`, context `1050000`, maximum output `128000`, and declared capabilities/effort automatically.
- [x] AC2 / R1: The same generic source rows produce the same suggestions under official and custom addresses; a wrong brand, incompatible transport or nonexact model ID cannot acquire unrelated facts.
- [x] AC3 / R3-R4: Canonical overrides, independent source conflicts, missing values and explicit false/zero remain correctly represented; `json_mode` stays null for structured-output-only evidence.
- [x] AC4 / R4-R6: Backend HTTP metadata and persistence envelopes expose known values and source IDs, and frontend prefill fills untouched fields while retaining manual values. Existing reference-source adoption remains available for genuine reference evidence.
- [x] AC5 / R3-R5: Tier/conditional pricing remains inspectable and does not replace base prices; public catalog requests receive no upstream credentials; native OpenRouter source selection retains its intended endpoint boundary.
- [x] AC6 / R6: Focused metadata/API/frontend regressions, required backend suite, Pyright and applicable frontend checks pass. A fresh independent review reports no blocking findings.

Source acceptance is recorded in [acceptance.md](acceptance.md), including the
original failed regression, native gate receipts, initial REWORK and final PASS.
The accepted files have been transferred to the main working tree. Commit,
archive, installation and release actions remain outside this source delivery.

## Scope exclusions

- No fuzzy model matching, alias guessing, new metadata vendors, request/response schema changes, or changes to routing cost formulas.
- No operator credential/configuration edits, local package installation, daemon restart, version bump or release publication.
- No edits to unrelated routing-canvas changes currently present in the main checkout.

## Delivery boundary

- Implement and verify on `fix/generic-model-metadata` in `/Users/texas/Workspace/jev-gateway-generic-metadata`, based on `de81708688854b9766504ff851b12df142221093`.
- After review, transfer only task-owned changed files into the main checkout after verifying their original bytes. Preserve unrelated staged and working changes.
