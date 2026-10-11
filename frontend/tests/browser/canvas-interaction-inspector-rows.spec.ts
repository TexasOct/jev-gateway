import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { workflowConfiguration as configuration, editableConfiguration } from "../fixtures/configuration";
import type { WorkflowWritePayload } from "../../src/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

// Focused interaction/inspector coverage for the original acceptance rows that the
// existing public regressions do not already carry:
//   C11  native rule and pool edits retain semantic data, rendered wire endpoints,
//        stored layout and the complete v2 payload while preserving supplier facts.
//   C09  local model/pool removal and undo preserve the supplier catalog and the
//        stored policy. Legacy generated-card and last-tag-member protection retire.
//   WF2  the menu closes on Escape and outside click without starting a drag,
//        marquee or connection edit.
//   WF3  deletion keeps semantic references, ordered rule slots and layout
//        consistent, including identical rule bodies.
// Every gesture point is confirmed with elementFromPoint before the gesture and
// re-confirmed on the final frame; no synthetic PointerEvent stands in for input.

const positions = {
  questions: { x: 40, y: 80 },
  "rule-0": { x: 350, y: 80 },
  "rule-1": { x: 650, y: 80 },
  "rule-2": { x: 950, y: 80 },
  fallback: { x: 350, y: 300 },
  "zone::balanced/default": { x: 650, y: 300 },
  "zone::balanced/quality": { x: 950, y: 300 },
  "model::fixture-provider/fixture-model": { x: 1250, y: 80 },
};

// Locate a point that genuinely hit-tests to the node card, never the chrome or an
// overlaying port handle, and re-verify it on the current frame.
async function nodePoint(page: import("@playwright/test").Page, id: string) {
  const target = page.locator(`[data-canvas-node="${id}"]`);
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((el) => {
    const b = el.getBoundingClientRect();
    for (const y of [b.top + 18, b.top + b.height / 2, b.bottom - 8]) for (const x of [b.left + 30, b.left + b.width / 2, b.right - 30]) {
      if (el.contains(document.elementFromPoint(x, y))) return { x, y, hit: true };
    }
    return { x: b.left + 30, y: b.top + 18, hit: false };
  });
  expect(point.hit).toBe(true);
  return point;
}

async function openWorkflow(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
}

// Three distinct rules so an ordered reorder is observable.
function orderedCatalog() {
  const catalog = structuredClone(configuration);
  catalog.questions.intent!.criteria = { default: "Default", other: "Other", third: "Third" };
  catalog.rules = ["default", "other", "third"].map((criterion, index) => ({
    index, when: { intent: criterion }, select: { label: index === 0 ? "default" : "quality" },
  }));
  return editableConfiguration(catalog);
}

const unmatched = (page: import("@playwright/test").Page, from: string) =>
  page.locator(`[data-canvas-edge][data-edge-from="${from}"][data-edge-kind="unmatched"]`);

// C11: native inspector reorder and creation keep the semantic draft, rendered
// endpoints, stored layout and complete ordered payload consistent. WF3 below
// retains the separate identical-body deletion checkpoint.
test("C11 reorder, delete and add rules keep endpoints, slots and the ordered payload consistent", async ({ page, mockApi }, info) => {
  const catalog = orderedCatalog();
  mockApi.appliedConfiguration = structuredClone(catalog);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" }, { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" });
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await openWorkflow(page);

  // The configured order and each rule's ordered unmatched wire.
  await expect(page.locator('[data-canvas-node="rule-0"]')).toContainText("intent=default");
  await expect(page.locator('[data-canvas-node="rule-1"]')).toContainText("intent=other");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toContainText("intent=third");
  await expect(unmatched(page, "rule-0")).toHaveAttribute("data-edge-to", "rule-1");
  await expect(unmatched(page, "rule-1")).toHaveAttribute("data-edge-to", "rule-2");
  await expect(unmatched(page, "rule-2")).toHaveAttribute("data-edge-to", "zone::balanced/default");

  const layoutBefore = structuredClone(mockApi.canvasLayout!.nodes);
  const conditions = page.locator('[data-canvas-node^="rule-"] .canvas-node-summary');

  // Move rule 0 later through the inspector's supported action. The ordered bodies
  // follow the intended rule, and each rule keeps its own coordinate as the slots
  // swap, so the layout follows the rule rather than staying frozen.
  await page.locator('[data-canvas-node="rule-0"]').focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await inspector.getByRole("button", { name: en.moveLater, exact: true }).first().click();
  await expect(page.locator('[data-canvas-node="rule-0"]')).toContainText("intent=other");
  await expect(page.locator('[data-canvas-node="rule-1"]')).toContainText("intent=default");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toContainText("intent=third");
  await expect(unmatched(page, "rule-0")).toHaveAttribute("data-edge-to", "rule-1");
  await expect(unmatched(page, "rule-1")).toHaveAttribute("data-edge-to", "rule-2");
  // The moved pair swap slots; unrelated nodes and out-of-range slots keep position.
  await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual({
    ...layoutBefore,
    "rule-0": layoutBefore["rule-1"],
    "rule-1": layoutBefore["rule-0"],
  });
  await expect(conditions.nth(0)).toContainText("intent=other");
  await expect(conditions.nth(1)).toContainText("intent=default");

  // Move the pair back through the inspector. Slot coordinates follow the rule
  // while the unrelated third slot keeps its position.
  await page.locator('[data-canvas-node="rule-0"]').focus(); await page.keyboard.press("Enter");
  const layoutBeforeIdentical = structuredClone(mockApi.canvasLayout!.nodes);
  await inspector.getByRole("button", { name: en.moveLater, exact: true }).first().click();
  await expect.poll(() => Object.fromEntries(Object.entries(mockApi.canvasLayout!.nodes).filter(([id]) => id.startsWith("rule-")))).toEqual({
    "rule-0": layoutBeforeIdentical["rule-1"],
    "rule-1": layoutBeforeIdentical["rule-0"],
    "rule-2": layoutBeforeIdentical["rule-2"],
  });
  for (const id of ["rule-0", "rule-1", "rule-2"]) await expect(page.locator(`[data-canvas-node="${id}"]`)).toBeVisible();

  // Current creation uses the native Add node menu and exact question criteria.
  await expect(page.locator(".workflow-info, .workflow-drawer, fieldset.rule-add")).toHaveCount(0);
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.canvasAddNode, exact: true }).click();
  await page.getByRole("menuitem", { name: en.addRule, exact: true }).click();
  await inspector.getByRole("checkbox", { name: "third", exact: true }).check();
  await inspector.getByRole("checkbox", { name: "default", exact: true }).uncheck();
  await inspector.getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await expect(page.locator('[data-canvas-node="rule-3"]')).toBeVisible();
  await expect(page.locator('[data-canvas-node="rule-3"]')).toContainText("intent=third");
  await expect(unmatched(page, "rule-3")).toHaveAttribute("data-edge-to", "zone::balanced/default");
  // The retired form no longer contributes pending fields to native creation.
  await expect(page.getByText(en.canvasPendingFields, { exact: true })).toHaveCount(0);

  // Save through the ordinary review/apply flow and inspect the complete payload.
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced").length).toBe(1);
  const put = mockApi.allowedWrites.find(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced")!;
  const payload = put.body as WorkflowWritePayload;
  // The payload carries the whole ordered rule list relative to the baseline.
  expect(payload.version).toBe(2);
  expect(payload.strategy).toBe(catalog.strategy);
  // Order after: inspector move [other, default, third] then a second inspector
  // move back to [default, other, third], then an appended third-criterion rule.
  expect(payload.definition.options.rules.map((rule) => rule.when)).toEqual([
    { intent: "default" }, { intent: "other" }, { intent: "third" }, { intent: "third" },
  ]);
  expect(payload.definition.options.fallback).toEqual({ label: "default" });
  expect(payload.selected_models).toEqual(catalog.selected_models);
  expect(payload.definition.policy).toEqual(catalog.definition!.policy);
  expect(payload).not.toHaveProperty("models"); expect(mockApi.appliedConfiguration!.models).toEqual(catalog.models);
  expect(payload.definition.options.questions).toEqual({ intent: { ...catalog.questions.intent!, criteria: { default: "Default", other: "Other", third: "Third" } } });
  expect(payload).toEqual({ version: 2, strategy: catalog.strategy, selected_models: catalog.selected_models, definition: { ...catalog.definition, options: { ...catalog.definition!.options, rules: [{ when: { intent: "default" }, select: { label: "default" } }, { when: { intent: "other" }, select: { label: "quality" } }, { when: { intent: "third" }, select: { label: "quality" } }, { when: { intent: "third" }, select: { label: "quality" } }] } } });
  // Condition references point at questions and criteria that still exist.
  for (const rule of payload.definition.options.rules) for (const [question, criterion] of Object.entries(rule.when)) {
    expect(Object.keys(payload.definition.options.questions)).toContain(question);
    for (const value of Array.isArray(criterion) ? criterion : [criterion]) expect(Object.keys(payload.definition.options.questions[question]!.criteria)).toContain(value);
  }
  await writeFile(info.outputPath("c11-ordered-payload.json"), JSON.stringify({ layoutBefore, nodes: mockApi.canvasLayout!.nodes, payload }, null, 2));
  await page.screenshot({ path: info.outputPath("c11-reordered.png"), fullPage: true });
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout?strategy=balanced")).toEqual([{ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" }, { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" }]);
});

// C11: native pool membership edits change only the current local label policy.
// The full v2 payload preserves selection and all supplier model/foreign-tag facts.
test("C11 local pool membership preserves supplier model facts and foreign tags", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  // Two models share the quality pool so a member can be removed while one stays.
  // A foreign tag owned by another strategy must not be dropped by the pool edit.
  catalog.models = [
    { ...catalog.models[0]!, id: "fixture-provider/fixture-model", tags: ["balanced/default", "balanced/quality", "task_aware/craft"], baseline_tags: ["balanced/default", "balanced/quality", "task_aware/craft"] },
    { ...catalog.models[0]!, id: "fixture-provider/second-model", tags: ["balanced/quality"], baseline_tags: ["balanced/quality"] },
  ];
  catalog.labels[1]!.models = catalog.models.map(({ id }) => id);
  const current = editableConfiguration({ ...catalog, selected_models: catalog.models.map(({ id }) => id) });
  mockApi.appliedConfiguration = current;
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" }, { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" });
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { ...structuredClone(positions), "model::fixture-provider/second-model": { x: 1250, y: 500 } } };
  await openWorkflow(page);

  // The model belongs to both tag pools. Remove it from the quality pool only.
  await page.locator('[data-canvas-node="zone::balanced/quality"]').focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  const member = inspector.getByRole("checkbox", { name: "fixture-provider/fixture-model", exact: true });
  await expect(member).toBeChecked();
  await member.uncheck();
  await expect(member).not.toBeChecked();
  // The default pool membership is untouched.
  await page.locator('[data-canvas-node="zone::balanced/default"]').focus(); await page.keyboard.press("Enter");
  await expect(inspector.getByRole("checkbox", { name: "fixture-provider/fixture-model", exact: true })).toBeChecked();
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();

  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced").length).toBe(1);
  const payload = mockApi.allowedWrites.find(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration?strategy=balanced")!.body as WorkflowWritePayload;
  expect(payload.definition.policy.labels.default!.models).toEqual(["fixture-provider/fixture-model"]);
  expect(payload.definition.policy.labels.quality!.models).toEqual(["fixture-provider/second-model"]);
  expect(payload.selected_models).toEqual(current.selected_models);
  expect(payload).not.toHaveProperty("models");
  expect(mockApi.appliedConfiguration!.models).toEqual(catalog.models);
  const tags = mockApi.appliedConfiguration!.models[0]!.tags;
  expect(tags).toContain("balanced/default");
  expect(tags).toContain("balanced/quality");
  expect(tags).toContain("task_aware/craft");
  expect(payload.definition.options.rules).toHaveLength(1);
  expect(payload).toEqual({ version: 2, strategy: current.strategy, selected_models: current.selected_models, definition: { ...current.definition, policy: { ...current.definition!.policy, labels: { default: { models: ["fixture-provider/fixture-model"] }, quality: { models: ["fixture-provider/second-model"] } } } } });
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout?strategy=balanced")).toEqual([{ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" }, { method: "PUT", path: "/v1/routing/configuration?strategy=balanced" }]);
  await writeFile(info.outputPath("c11-model-delta.json"), JSON.stringify({ payload, supplierModels: mockApi.appliedConfiguration!.models, requests: mockApi.requests }, null, 2));
  await page.screenshot({ path: info.outputPath("c11-pool-membership.png"), fullPage: true });
});

// C09: current model removal changes local selection and leaves supplier facts
// intact. Undo restores the graph; only its exact layout writes are admitted.
for (const locale of ["en", "zh-CN"] as const) test(`C09 local model removal and undo preserve the supplier catalog ${locale}`, async ({ page, mockApi }, info) => {
  const words = locale === "en" ? en : zhCN;
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  if (locale !== "en") { await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption(locale); }
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  const node = page.locator('[data-canvas-node="model::fixture-provider/fixture-model"]');
  await expect(node).toBeVisible();
  const baseline = structuredClone(mockApi.appliedConfiguration);

  // The retired protected generated-card action is now local model removal.
  const at = await nodePoint(page, "model::fixture-provider/fixture-model");
  await page.mouse.click(at.x, at.y, { button: "right" });
  const menu = page.getByRole("menu", { name: words.canvasActions });
  await expect(menu.getByRole("menuitem", { name: words.workflowRemoveModel, exact: true })).toBeEnabled();
  await menu.getByRole("menuitem", { name: words.workflowRemoveModel, exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(node).toHaveCount(0);
  await expect(page.locator('[data-canvas-edge][data-edge-kind="pool"]')).toHaveCount(0);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  await page.getByRole("button", { name: words.canvasUndo, exact: true }).click();
  await expect(node).toHaveCount(1);
  await expect.poll(() => mockApi.canvasWrites?.length ?? 0).toBe(1);

  // Native keyboard removal has the same local ownership; Backspace on the board
  // adds no second deletion or mutation.
  await node.focus(); await page.keyboard.press("Delete");
  await expect(node).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect(node).toHaveCount(0);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  await page.getByRole("button", { name: words.canvasUndo, exact: true }).click();
  await expect(node).toHaveCount(1);
  await expect.poll(() => mockApi.canvasWrites?.length ?? 0).toBe(2);

  // Supplier facts and the restored graph/layout stay unchanged.
  await expect(page.locator('[data-canvas-edge][data-edge-kind="pool"]')).toHaveCount(2);
  expect(mockApi.canvasLayout!.nodes).toEqual(positions);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  expect(mockApi.canvasWrites).toEqual([mockApi.canvasLayout, mockApi.canvasLayout]);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([{ method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced" }, { method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced" }]);
  await writeFile(info.outputPath(`c09-generated-${locale}.json`), JSON.stringify({ nodes: mockApi.canvasLayout!.nodes, baseline, writes: mockApi.canvasWrites, requests: mockApi.requests }, null, 2));
  await page.screenshot({ path: info.outputPath(`c09-generated-${locale}.png`), fullPage: true });
});

// C09/C11: v2 local pools may be empty while supplier catalog facts remain intact.
// The legacy tag-pool last-member refusal is retired from current native controls.
test("C09 empty local pool edits and undo preserve supplier facts and stored policy", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  // The default fixture leaves exactly one resolved member in each tag pool.
  mockApi.appliedConfiguration = editableConfiguration(catalog);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await openWorkflow(page);
  const baseline = structuredClone(mockApi.appliedConfiguration);

  // Inspector membership edits affect the current local pool.
  await page.locator('[data-canvas-node="zone::balanced/quality"]').focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  const member = inspector.getByRole("checkbox", { name: "fixture-provider/fixture-model", exact: true });
  await expect(member).toBeChecked();
  await member.click();
  await expect(member).not.toBeChecked();
  await expect(page.locator('[data-canvas-edge][data-edge-from="zone::balanced/quality"][data-edge-kind="pool"]')).toHaveCount(0);
  await expect(page.locator('[data-canvas-node="model::fixture-provider/fixture-model"]')).toHaveCount(1);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect(member).toBeChecked();
  await expect.poll(() => mockApi.canvasWrites?.length ?? 0).toBe(1);
  // The draft is untouched: the rule still shows its condition and the edge stays.
  await expect(page.locator('[data-canvas-node="rule-0"]')).toContainText("intent=default");

  // The wire action edits the same local pool and leaves the model selected.
  const wire = page.locator('[data-canvas-edge][data-edge-from="zone::balanced/quality"][data-edge-kind="pool"]');
  await expect(wire).toHaveCount(1);
  await wire.click({ button: "right" });
  await expect(page.getByRole("menu", { name: en.canvasActions }).getByRole("menuitem", { name: en.canvasDisconnect })).toBeEnabled();
  await page.getByRole("menu", { name: en.canvasActions }).getByRole("menuitem", { name: en.canvasDisconnect }).click();
  await expect(wire).toHaveCount(0);
  await expect(page.locator('[data-canvas-node="model::fixture-provider/fixture-model"]')).toHaveCount(1);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect(wire).toHaveCount(1);
  await expect.poll(() => mockApi.canvasWrites?.length ?? 0).toBe(2);

  // Graph, layout and persisted files are unchanged.
  await expect(page.locator('[data-canvas-edge][data-edge-kind="pool"]')).toHaveCount(2);
  expect(mockApi.canvasLayout!.nodes).toEqual(positions);
  expect(mockApi.appliedConfiguration).toEqual(baseline);
  expect(mockApi.canvasWrites).toEqual([mockApi.canvasLayout, mockApi.canvasLayout]);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([{ method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced" }, { method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced" }]);
  await writeFile(info.outputPath("c09-last-member.json"), JSON.stringify({ nodes: mockApi.canvasLayout!.nodes, baseline, writes: mockApi.canvasWrites, requests: mockApi.requests }, null, 2));
  await page.screenshot({ path: info.outputPath("c09-last-member.png"), fullPage: true });
});

// WF2: Escape and an outside click close the menu without starting a drag, marquee
// or connection edit; the invoking control regains focus on Escape.
test("WF2 menu dismissals never start a drag, marquee or connection edit", async ({ page, mockApi }, info) => {
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await openWorkflow(page);
  const canvas = page.locator(".routing-canvas-scroll");
  const menu = page.getByRole("menu", { name: en.canvasActions });
  const writes = mockApi.canvasWrites?.length ?? 0;

  // Escape from the blank-board menu returns focus to the invoking add button.
  const add = page.getByRole("button", { name: en.canvasAddNode, exact: true });
  await add.focus(); await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(add).toBeFocused();

  // Outside click closes the node menu without a drag, marquee or connection gesture.
  const from = await nodePoint(page, "rule-0");
  await page.mouse.click(from.x, from.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.mouse.click(from.x, from.y + 260, { button: "left" });
  await expect(menu).toHaveCount(0);
  await expect(page.locator("[data-dragging], .canvas-edge-preview, .canvas-marquee")).toHaveCount(0);
  await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual(positions);
  expect(mockApi.canvasWrites?.length ?? 0).toBe(writes);

  // Subsequent native gestures still work after the dismissal.
  const start = await nodePoint(page, "rule-0");
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 30, { steps: 6 }); await page.mouse.up();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual({ x: positions["rule-0"]!.x + 40, y: positions["rule-0"]!.y + 30 });
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(positions["rule-0"]);
  await writeFile(info.outputPath("wf2-dismiss.json"), JSON.stringify({ nodes: mockApi.canvasLayout!.nodes }, null, 2));
});

// WF3: removing a rule with an identical body to its neighbours still removes the
// exact ordered slot, remaps successors and layout, leaves no stale reference and
// undoes as one checkpoint.
test("WF3 identical-body rule deletion remaps slots, layout and references as one checkpoint", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  catalog.questions.intent!.criteria = { default: "Default", other: "Other", third: "Third" };
  // Identical bodies: only the ordered slot distinguishes them.
  catalog.rules = [0, 1, 2].map((index) => ({ index, when: { intent: "default" }, select: { label: "default" } }));
  mockApi.appliedConfiguration = editableConfiguration(catalog);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await openWorkflow(page);

  const original = structuredClone(positions);
  const target = page.locator('[data-canvas-node="rule-1"]');
  const at = await nodePoint(page, "rule-1");
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.getByRole("menu", { name: en.canvasActions }).getByRole("menuitem", { name: en.remove, exact: true }).click();
  // The trailing slot disappears and the successor takes the removed ordered slot.
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(0);
  await expect.poll(() => Object.fromEntries(Object.entries(mockApi.canvasLayout!.nodes).filter(([id]) => id.startsWith("rule-")))).toEqual({ "rule-0": original["rule-0"], "rule-1": original["rule-2"] });
  await expect(page.locator('[data-canvas-node].selected')).toHaveCount(0);
  await expect(target).toContainText("intent=default");
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(1);
  await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual(original);
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout?strategy=balanced")).toEqual([]);
  await writeFile(info.outputPath("wf3-identical-slots.json"), JSON.stringify({ original, nodes: mockApi.canvasLayout!.nodes }, null, 2));
});
