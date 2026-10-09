import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

// Focused interaction/inspector coverage for the original acceptance rows that the
// existing public regressions do not already carry:
//   C11  rule add/delete/reorder through the supported editors, comparing semantic
//        data, rendered wire endpoints and stored layout after every command, plus
//        the complete ordered save payload and model deltas relative to baseline.
//   C09  a generated catalog card cannot masquerade as an independently removed
//        policy object, and a protected group member cannot bypass its restriction.
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
  return catalog;
}

const unmatched = (page: import("@playwright/test").Page, from: string) =>
  page.locator(`[data-canvas-edge][data-edge-from="${from}"][data-edge-kind="unmatched"]`);

// C11: reorder through the inspector's supported action and the row grip keyboard
// sensor, delete an ordered slot through the menu, then save. After every command
// the semantic draft, the rendered endpoints, the stored layout and the complete
// ordered payload must stay consistent.
test("C11 reorder, delete and add rules keep endpoints, slots and the ordered payload consistent", async ({ page, mockApi }, info) => {
  const catalog = orderedCatalog();
  mockApi.appliedConfiguration = structuredClone(catalog);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
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
  const conditions = page.locator(".rule-condition");

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
  await expect(conditions.nth(0)).toContainText("intent = other");
  await expect(conditions.nth(1)).toContainText("intent = default");

  // Reorder rules with identical bodies through the supported inspector action.
  // Even though the bodies are identical, slot coordinates follow the intended
  // rule (the pair's coordinates swap), never a shared constant.
  await page.locator('[data-canvas-node="rule-0"]').focus(); await page.keyboard.press("Enter");
  const layoutBeforeIdentical = structuredClone(mockApi.canvasLayout!.nodes);
  await inspector.getByRole("button", { name: en.moveLater, exact: true }).first().click();
  await expect.poll(() => Object.fromEntries(Object.entries(mockApi.canvasLayout!.nodes).filter(([id]) => id.startsWith("rule-")))).toEqual({
    "rule-0": layoutBeforeIdentical["rule-1"],
    "rule-1": layoutBeforeIdentical["rule-0"],
    "rule-2": layoutBeforeIdentical["rule-2"],
  });
  for (const id of ["rule-0", "rule-1", "rule-2"]) await expect(page.locator(`[data-canvas-node="${id}"]`)).toBeVisible();

  // Add a rule back through the add-rule form. It must reference an existing
  // question and criterion, and the ordered slot must be interior (append).
  const drawer = page.getByRole("button", { name: en.canvasInformation, exact: true });
  if (await drawer.getAttribute("aria-expanded") === "false") await drawer.click();
  const form = page.locator("fieldset.rule-add");
  const selects = form.locator("select");
  await expect(selects).toHaveCount(3);
  // Order: question name, criterion key, label.
  await selects.nth(0).selectOption("intent");
  await selects.nth(1).selectOption("third");
  await selects.nth(2).selectOption("quality");
  await form.getByRole("button", { name: en.addRule, exact: true }).click();
  await expect(page.locator('[data-canvas-node="rule-3"]')).toBeVisible();
  await expect(page.locator('[data-canvas-node="rule-3"]')).toContainText("intent=third");
  await expect(unmatched(page, "rule-3")).toHaveAttribute("data-edge-to", "zone::balanced/default");
  // The add form keeps its pending fields; clear them to admit the review action.
  if (await drawer.getAttribute("aria-expanded") === "false") await drawer.click();
  await expect(page.getByText(en.canvasPendingFields, { exact: true })).toBeVisible();
  await selects.nth(2).selectOption("");
  await selects.nth(1).selectOption("");
  await selects.nth(0).selectOption("");
  await expect(page.getByText(en.canvasPendingFields, { exact: true })).toHaveCount(0);

  // Save through the ordinary review/apply flow and inspect the complete payload.
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration").length).toBe(1);
  const put = mockApi.allowedWrites.find(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration")!;
  const payload = put.body as { version: number; strategy: string; questions: unknown; rules: Array<{ when: Record<string, string>; select: { label: string } }>; fallback: { label: string }; models: Record<string, { tags: string[]; priority: number }> };
  // The payload carries the whole ordered rule list relative to the baseline.
  expect(payload.version).toBe(1);
  expect(payload.strategy).toBe(catalog.strategy);
  // Order after: inspector move [other, default, third] then a second inspector
  // move back to [default, other, third], then an appended third-criterion rule.
  expect(payload.rules.map((rule) => rule.when)).toEqual([
    { intent: "default" }, { intent: "other" }, { intent: "third" }, { intent: "third" },
  ]);
  expect(payload.fallback).toEqual({ label: "default" });
  // No model field diverged from the baseline, so the model deltas stay empty.
  expect(payload.models).toEqual({});
  expect(payload.questions).toEqual({ intent: { ...catalog.questions.intent!, criteria: { default: "Default", other: "Other", third: "Third" } } });
  // Condition references point at questions and criteria that still exist.
  for (const rule of payload.rules) for (const [question, criterion] of Object.entries(rule.when)) {
    expect(Object.keys(payload.questions as Record<string, { criteria: Record<string, string> }>)).toContain(question);
    expect(Object.keys((payload.questions as Record<string, { criteria: Record<string, string> }>)[question]!.criteria)).toContain(criterion);
  }
  await writeFile(info.outputPath("c11-ordered-payload.json"), JSON.stringify({ layoutBefore, nodes: mockApi.canvasLayout!.nodes, payload }, null, 2));
  await page.screenshot({ path: info.outputPath("c11-reordered.png"), fullPage: true });
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout" && path !== "/v1/routing/configuration" && !path.endsWith("/validate"))).toEqual([]);
});

// C11 (pool membership): removing a pool member through the label's supported
// inline inspector changes only that label's tag membership, carries the model
// delta into the payload relative to baseline, and preserves foreign tags owned by
// other strategies. Removing the last resolved member is refused with a reason.
test("C11 pool membership edits carry model deltas and preserve foreign tags", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  // Two models share the quality pool so a member can be removed while one stays.
  // A foreign tag owned by another strategy must not be dropped by the pool edit.
  catalog.models = [
    { ...catalog.models[0]!, id: "fixture-provider/fixture-model", tags: ["balanced/default", "balanced/quality", "task_aware/craft"], baseline_tags: ["balanced/default", "balanced/quality", "task_aware/craft"] },
    { ...catalog.models[0]!, id: "fixture-provider/second-model", tags: ["balanced/quality"], baseline_tags: ["balanced/quality"] },
  ];
  mockApi.appliedConfiguration = structuredClone(catalog);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
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
  await expect.poll(() => mockApi.requests.filter(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration").length).toBe(1);
  const payload = mockApi.allowedWrites.find(({ method, path }) => method === "PUT" && path === "/v1/routing/configuration")!.body as { models: Record<string, { tags: string[]; priority: number }>; rules: unknown[] };
  // The delta removes the quality tag, keeps the default tag and the foreign tag.
  const tags = payload.models["fixture-provider/fixture-model"]!.tags;
  expect(tags).toContain("balanced/default");
  expect(tags).not.toContain("balanced/quality");
  expect(tags).toContain("task_aware/craft");
  expect(payload.rules).toHaveLength(1);
  await writeFile(info.outputPath("c11-model-delta.json"), JSON.stringify({ models: payload.models }, null, 2));
  await page.screenshot({ path: info.outputPath("c11-pool-membership.png"), fullPage: true });
});

// C09: a generated read-only catalog card is not an independently removed policy
// object. Node/edge actions and keyboard deletion must explain the restriction and
// leave the graph, layout and persisted state unchanged.
for (const locale of ["en", "zh-CN"] as const) test(`C09 generated catalog card cannot be deleted as a policy object ${locale}`, async ({ page, mockApi }, info) => {
  const words = locale === "en" ? en : zhCN;
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  if (locale !== "en") { await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption(locale); }
  await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
  const node = page.locator('[data-canvas-node="model::fixture-provider/fixture-model"]');
  await expect(node).toBeVisible();
  const writes = mockApi.canvasWrites?.length ?? 0;
  const putCount = mockApi.requests.filter(({ method }) => method === "PUT").length;

  // Context menu: the delete action is disabled and explains the restriction.
  const at = await nodePoint(page, "model::fixture-provider/fixture-model");
  await page.mouse.click(at.x, at.y, { button: "right" });
  const menu = page.getByRole("menu", { name: words.canvasActions });
  await expect(menu).toContainText(words.canvasProtectedNode);
  await expect(menu.getByRole("menuitem", { name: words.remove, exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Keyboard deletion on the focused generated card is a no-op with feedback.
  await node.focus(); await page.keyboard.press("Delete");
  await expect(page.getByText(words.canvasProtectedNode, { exact: true })).toBeVisible();
  await expect(node).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(node).toHaveCount(1);

  // The graph, layout and persisted files are unchanged.
  await expect(page.locator('[data-canvas-edge][data-edge-kind="pool"]')).toHaveCount(2);
  expect(mockApi.canvasLayout!.nodes).toEqual(positions);
  expect(mockApi.canvasWrites?.length ?? 0).toBe(writes);
  expect(mockApi.requests.filter(({ method }) => method === "PUT").length).toBe(putCount);
  await writeFile(info.outputPath(`c09-generated-${locale}.json`), JSON.stringify({ nodes: mockApi.canvasLayout!.nodes, writes }, null, 2));
  await page.screenshot({ path: info.outputPath(`c09-generated-${locale}.png`), fullPage: true });
});

// C09/C11: removing the last resolved member of a tag pool is a protected-group
// operation. The refusal must explain the real last-member restriction and leave
// the membership, layout and persisted state unchanged.
test("C09 last resolved pool member cannot be bypassed and explains the restriction", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  // The default fixture leaves exactly one resolved member in each tag pool.
  mockApi.appliedConfiguration = structuredClone(catalog);
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: structuredClone(positions) };
  await openWorkflow(page);
  const writes = mockApi.canvasWrites?.length ?? 0;
  const putCount = mockApi.requests.filter(({ method }) => method === "PUT").length;

  // The zone inspector membership toggle is refused with the last-member reason,
  // not a generic connection error.
  await page.locator('[data-canvas-node="zone::balanced/quality"]').focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  const member = inspector.getByRole("checkbox", { name: "fixture-provider/fixture-model", exact: true });
  await expect(member).toBeChecked();
  await member.click();
  await expect(member).toBeChecked();
  await expect(page.getByText(en.canvasReason_lastMember, { exact: true })).toBeVisible();
  // The draft is untouched: the rule still shows its condition and the edge stays.
  await expect(page.locator('[data-canvas-node="rule-0"]')).toContainText("intent=default");

  // Removing the last resolved member through the wire action panel is also refused.
  const wire = page.locator('[data-canvas-edge][data-edge-from="zone::balanced/quality"][data-edge-kind="pool"]');
  await expect(wire).toHaveCount(1);
  await wire.click({ button: "right" });
  await expect(page.getByRole("menu", { name: en.canvasActions }).getByRole("menuitem", { name: en.canvasDisconnect })).toBeDisabled();
  await expect(page.getByRole("menu", { name: en.canvasActions })).toContainText(en.canvasReason_lastMember);
  await page.keyboard.press("Escape");

  // Graph, layout and persisted files are unchanged.
  await expect(page.locator('[data-canvas-edge][data-edge-kind="pool"]')).toHaveCount(2);
  expect(mockApi.canvasLayout!.nodes).toEqual(positions);
  expect(mockApi.canvasWrites?.length ?? 0).toBe(writes);
  expect(mockApi.requests.filter(({ method }) => method === "PUT").length).toBe(putCount);
  await writeFile(info.outputPath("c09-last-member.json"), JSON.stringify({ nodes: mockApi.canvasLayout!.nodes }, null, 2));
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
  mockApi.appliedConfiguration = structuredClone(catalog);
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
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout")).toEqual([]);
  await writeFile(info.outputPath("wf3-identical-slots.json"), JSON.stringify({ original, nodes: mockApi.canvasLayout!.nodes }, null, 2));
});
