import { test, expect } from "./fixtures";
import { configuration, workflowConfiguration } from "../fixtures/configuration";
import type { CanvasLayout, ConfigurationPayload, RoutingOverlayPayload } from "@/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for (const state of ["uneditable", "missing-definition"] as const) for (const width of [1280, 320]) test(`read-only ${state} blocks native policy edits while preserving layout history at ${width}px`, async ({ page, mockApi }, info) => {
  const readonly = structuredClone(workflowConfiguration);
  if (state === "uneditable") readonly.editable = false;
  else { delete readonly.definition; readonly.editable = true; }
  expect(readonly.write_available).toBe(true);
  mockApi.appliedConfiguration = readonly;
  const layout: CanvasLayout = { version: 1, nodes: width === 320 ? { questions: { x: 50, y: 40 }, "rule-0": { x: 50, y: 200 }, fallback: { x: 50, y: 330 }, "zone::balanced/default": { x: 50, y: 450 }, "zone::balanced/quality": { x: 50, y: 580 }, "model::fixture-provider/fixture-model": { x: 50, y: 710 } } : { questions: { x: 50, y: 80 }, "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };
  mockApi.canvasLayout = structuredClone(layout);
  await page.setViewportSize({ width, height: 900 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.workflowAddModel, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.workflowCreate, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: en.canvasPanTool, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: en.canvasZoomFit, exact: true })).toBeEnabled();
  const branch = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]');
  await branch.focus(); await page.keyboard.press("Enter");
  const card = page.getByRole("region", { name: en.canvasConnectionActions });
  await expect(card).toContainText(en.canvasReadOnly);
  await expect(card.getByRole("combobox")).toHaveCount(0);
  await expect(card.getByRole("button", { name: en.canvasConnect, exact: true })).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(branch).toHaveAttribute("data-edge-to", "zone::balanced/default");
  await page.keyboard.press("Escape");
  const rule = page.locator('[data-canvas-node="rule-0"]');
  await rule.focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await expect(inspector.getByRole("combobox", { name: en.label, exact: true })).toBeDisabled();
  await expect(inspector.getByRole("button", { name: en.moveLater, exact: true })).toBeDisabled();
  await expect(inspector.getByRole("button", { name: en.deleteRule, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await rule.focus(); await page.keyboard.press("Delete"); await page.keyboard.press("Backspace");
  await expect(rule).toHaveCount(1);
  await page.keyboard.press("Alt+ArrowRight");
  const moved = { ...layout, nodes: { ...layout.nodes, "rule-0": { x: layout.nodes["rule-0"]!.x + 20, y: layout.nodes["rule-0"]!.y } } };
  await expect.poll(() => mockApi.canvasLayout).toEqual(moved);
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout).toEqual(layout);
  await page.getByRole("button", { name: en.canvasRedo, exact: true }).click();
  await expect.poll(() => mockApi.canvasLayout).toEqual(moved);
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(mockApi.appliedConfiguration).toEqual(readonly);
  expect(mockApi.canvasWrites).toEqual([moved, layout, moved]);
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual(Array.from({ length: 3 }, () => ({ method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced" })));
  await info.attach("readonly-policy-independent-layout-ledger", { contentType: "application/json", body: JSON.stringify({ readonly, layout, moved, requests: mockApi.requests, layoutWrites: mockApi.canvasWrites }, null, 2) });
});

for (const locale of ["en", "zh-CN"] as const) for (const width of [1280, 320]) {
  test(`inherited legacy path stays read-only through reload and global clear (${locale}, ${width})`, async ({ page, mockApi }) => {
    const zh = locale === "zh-CN";
    const words = zh ? zhCN : en;
    let config: ConfigurationPayload = {
      ...structuredClone(configuration), editable: false, defaults: { default_model: "fixture/global" },
      rules: [{ index: 0, when: { intent: "default" }, select: { label: "missing" } }],
      labels: [
        { ...configuration.labels[0]!, models: ["fixture/literal"] },
        { ...configuration.labels[1]!, name: "missing", tag: "balanced/missing", models: [] },
      ],
      models: [
        { id: "fixture/literal", provider: "fixture", upstream_model: "literal", priority: 1, baseline_priority: 1, tags: ["balanced/default"], baseline_tags: ["balanced/default"] },
        { id: "fixture/global", provider: "fixture", upstream_model: "global", priority: 1, baseline_priority: 1, tags: [], baseline_tags: [] },
      ],
    };
    const strategy = { name: "balanced", kind: "decision_matrix", description: "Fixture strategy", policy: { labels: { default: {}, missing: {} } }, options: { rules: config.rules, fallback: config.fallback } };
    const writes: RoutingOverlayPayload[] = [];
    const validations: RoutingOverlayPayload[] = [];
    const supplierFacts = structuredClone(config.models), layoutBefore = structuredClone(mockApi.canvasLayout);
    await page.route("**/v1/routing/strategies", (route) => route.fulfill({ json: { object: "list", default: "balanced", data: [strategy] } }));
    await page.route("**/v1/routing/policy", (route) => route.fulfill({ json: { defaults: config.defaults, strategies: [strategy], models: config.models.map((model) => ({ name: model.id, tags: model.tags })) } }));
    await page.route("**/v1/routing/sessions*", (route) => route.fulfill({ json: { data: [], storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null } }));
    await page.route("**/v1/routing/configuration/validate", async (route) => {
      expect(route.request().method()).toBe("POST");
      validations.push(route.request().postDataJSON() as RoutingOverlayPayload);
      await route.fulfill({ json: { valid: true, warnings: [] } });
    });
    await page.route("**/v1/routing/configuration{,?strategy=balanced}", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: config });
      expect(route.request().method()).toBe("PUT");
      const payload = route.request().postDataJSON() as RoutingOverlayPayload;
      writes.push(payload);
      config = {
        ...config, config_hash: "saved", rules: payload.rules.map((rule, index) => ({ ...rule, index })),
        questions: payload.questions ?? config.questions, fallback: payload.fallback ?? config.fallback,
        models: config.models.map((model) => ({ ...model, ...payload.models[model.id] })),
      };
      await route.fulfill({ json: { applied: true, warnings: [] } });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    const target = page.locator('[data-route-target="fixture/global"]');
    await expect(target).toContainText(zh ? "默认 · 继承全局模型" : "Default · inherited global model");
    await expect(target).toContainText(zh ? "已配置 · 无会话" : "Configured · no sessions");
    await page.getByRole("button", { name: zh ? "策略工作流" : "Strategy workflow", exact: true }).click();
    const inheritedEdge = page.locator('path[data-workflow-edge="default"]');
    await expect(inheritedEdge).toHaveCount(1);
    await expect(inheritedEdge.locator("..").locator(".canvas-edge-handle")).toHaveCount(0);
    await expect(page.locator('[data-output-node="zone::balanced/missing"][data-output-kind="default"]')).toHaveCount(0);
    await expect(page.locator('[data-canvas-node="zone::balanced/missing"]')).toContainText(zh ? "默认" : "Default");
    await expect(page.locator(".workflow-info, .workflow-drawer, .workflow-advanced, .workflow-footer")).toHaveCount(0);
    const inherited = page.locator('[data-canvas-edge][data-edge-from="zone::balanced/missing"][data-edge-kind="default"]');
    await expect(inherited).toHaveAttribute("data-edge-to", "model::fixture/global");
    await expect(page.locator('[data-canvas-edge][data-edge-from="zone::balanced/missing"][data-edge-kind="pool"]')).toHaveCount(0);
    await inherited.focus(); await page.keyboard.press("Enter");
    const card = page.getByRole("region", { name: words.canvasConnectionActions, exact: true });
    await expect(card).toContainText("missing"); await expect(card).toContainText("fixture/global");
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await expect(card.getByRole("button", { name: words.canvasConnect, exact: true })).toHaveCount(0);
    if (width === 320) {
      const geometry = await card.evaluate((element) => element.getBoundingClientRect().toJSON());
      expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width);
      expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(900);
      const modelLines = await card.getByText("fixture/global", { exact: false }).first().evaluate((model) => {
        const range = document.createRange();
        range.selectNodeContents(model);
        return range.getClientRects().length;
      });
      expect(modelLines).toBeLessThanOrEqual(3);
    }
    await page.keyboard.press("Escape"); await expect(card).toHaveCount(0);
    await expect(page.getByRole("button", { name: zh ? "审阅草稿" : "Review changes", exact: true })).toBeDisabled();
    expect(writes).toEqual([]);
    expect(validations).toEqual([]);

    // R2 assigns priority editing to the supplier Dialog; this v1 workflow stays read-only.
    await expect(page.getByLabel(zh ? "fixture/literal 的优先级" : "Priority for fixture/literal", { exact: true })).toHaveCount(0);
    expect(config.models.find((model) => model.id === "fixture/literal")?.priority).toBe(1);
    expect(config.models.find((model) => model.id === "fixture/global")?.tags).toEqual([]);
    await page.reload();
    await expect(page.locator('[data-route-target="fixture/global"]')).toContainText(zh ? "默认" : "Default");
    config = { ...config, defaults: { default_model: null } };
    await page.reload();
    await expect(page.locator('[data-route-target="fixture/global"]')).toHaveCount(0);
    await expect(page.locator(".monitoring-destinations")).toContainText(zh ? "通用设置" : "Settings");
    await page.getByRole("button", { name: zh ? "策略工作流" : "Strategy workflow", exact: true }).click();
    await expect(page.locator('path[data-workflow-edge="default"]')).toHaveCount(0);
    await expect(page.locator('[data-canvas-edge][data-edge-from="zone::balanced/missing"][data-edge-kind="pool"]')).toHaveCount(0);
    await expect(page.locator(".workflow-info, .workflow-drawer, .workflow-advanced")).toHaveCount(0);
    expect(config.models.find((model) => model.id === "fixture/global")?.tags).toEqual([]);
    expect(writes).toEqual([]); expect(validations).toEqual([]);
    expect(config.models).toEqual(supplierFacts); expect(mockApi.canvasLayout).toEqual(layoutBefore);
    expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  });
}

for (const locale of ["en", "zh-CN"] as const) for (const width of [1280, 320]) {
  test(`shared implicit pool isolates the selected native branch (${locale}, ${width})`, async ({ page, mockApi }) => {
    const zh = locale === "zh-CN";
    const words = zh ? zhCN : en;
    const config: ConfigurationPayload = {
      ...structuredClone(configuration), editable: false, defaults: { default_model: "fixture/global" },
      rules: [{ index: 0, when: { intent: "default" }, select: { selection: "quality_first" } }], fallback: {},
      labels: [{ ...configuration.labels[0]!, name: "missing", tag: "balanced/missing", models: [] }],
      models: [{ id: "fixture/global", provider: "fixture", upstream_model: "global", priority: 1, baseline_priority: 1, tags: [], baseline_tags: [] }],
    };
    let writes = 0;
    await page.route("**/v1/routing/configuration{,?strategy=balanced}", (route) => {
      if (route.request().method() !== "GET") writes += 1;
      return route.fulfill({ json: config });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: zh ? "策略工作流" : "Strategy workflow", exact: true }).click();
    await expect(page.locator(".workflow-info, .workflow-drawer, .configured-route-trace")).toHaveCount(0);
    await expect(page.locator('[data-canvas-edge][data-edge-kind="default"]')).toHaveCount(1);
    await expect(page.locator('[data-canvas-edge][data-edge-kind="default"]')).toHaveAttribute("data-edge-to", "model::fixture/global");
    const branches = [page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]'), page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="unmatched"]'), page.locator('[data-canvas-edge][data-edge-from="fallback"][data-edge-kind="match"]')];
    for (const index of [0, 1, 2]) {
      const branch = branches[index]!;
      await expect(branch).toHaveAttribute("data-edge-to", "zone::balanced/missing");
      await branch.focus(); await page.keyboard.press("Enter");
      await expect(branch).toHaveAttribute("aria-pressed", "true");
      for (const [otherIndex, other] of branches.entries()) if (otherIndex !== index) await expect(other).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator('[data-canvas-edge][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.getByRole("region", { name: words.canvasConnectionActions }).getByRole("combobox")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(branch).toHaveAttribute("aria-pressed", "false");
    }
    await expect(page.getByRole("button", { name: zh ? "审阅草稿" : "Review changes", exact: true })).toBeDisabled();
    expect(writes).toBe(0);
    expect(config.models[0]!.tags).toEqual([]);
    expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  });
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`literal default and inherited session pins render distinctly in one catalog (${locale})`, async ({ page }) => {
    const zh = locale === "zh-CN";
    const strategy = { name: "balanced", kind: "policy", description: null, policy: { labels: { default: {}, missing: {} } } };
    const sessions = [false, true].map((defaulted) => ({
      session_id: defaulted ? "pin-global" : "pin-literal", label: "default", defaulted,
      reason: "session_pinned", turn_count: 50, strategy: "balanced", provider: "fixture",
      upstream_model: defaulted ? "global" : "literal", route: defaulted ? "fixture/global" : "fixture/literal",
    }));
    await page.route("**/v1/routing/strategies", (route) => route.fulfill({ json: { object: "list", default: "balanced", data: [strategy] } }));
    await page.route("**/v1/routing/policy", (route) => route.fulfill({ json: { defaults: { default_model: "fixture/global" }, strategies: [strategy], models: [{ name: "fixture/global", tags: [] }, { name: "fixture/literal", tags: ["balanced/default"] }] } }));
    await page.route("**/v1/routing/sessions*", (route) => route.fulfill({ json: { data: sessions, storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null } }));
    await page.route("**/v1/routing/sessions/*/requests*", (route) => {
      const session = sessions.find((row) => route.request().url().includes(row.session_id))!;
      return route.fulfill({ json: { session, storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null, requests: [{
        request: { request_id: `request-${session.session_id}`, received_at: 1000, endpoint: "/v1/chat/completions" },
        decision: { ...session, mode: "auto" }, upstream_request: null, outcome: { ok: true },
      }] } });
    });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.locator(".monitoring-secondary > summary").click();
    await expect(page.locator(".monitoring-overview .monitoring-meta")).toContainText("balanced · default · fixture/literal");
    await expect(page.locator(".session").filter({ hasText: "pin-literal" })).toContainText("balanced · default · fixture/literal");
    await expect(page.locator(".session").filter({ hasText: "pin-global" })).toContainText(zh ? "balanced · 默认 · fixture/global" : "balanced · Default · fixture/global");
    for (const session of sessions) {
      await page.locator(".session").filter({ hasText: session.session_id }).click();
      const label = session.defaulted ? zh ? "默认" : "Default" : "default";
      await expect(page.locator(".monitoring-overview .monitoring-meta")).toContainText(`balanced · ${label} · fixture/${session.upstream_model}`);
      await expect(page.locator('[data-trace-index="1"]')).toContainText(`balanced · ${label} · fixture/${session.upstream_model}`);
      await expect(page.locator('[data-trace-index="1"] pre')).toContainText('"label": "default"');
      await expect(page.locator('[data-trace-index="1"] pre')).toContainText(`"defaulted": ${session.defaulted}`);
    }
  });
}
