import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import type { ConfigurationPayload, RoutingOverlayPayload } from "@/shared/api/types";

for (const locale of ["en", "zh-CN"] as const) for (const width of [1280, 320]) {
  test(`inherited configured path stays read-only through save/reload and global clear (${locale}, ${width})`, async ({ page }) => {
    const zh = locale === "zh-CN";
    let config: ConfigurationPayload = {
      ...structuredClone(configuration), defaults: { default_model: "fixture/global" },
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
    await page.route("**/v1/routing/strategies", (route) => route.fulfill({ json: { object: "list", default: "balanced", data: [strategy] } }));
    await page.route("**/v1/routing/policy", (route) => route.fulfill({ json: { defaults: config.defaults, strategies: [strategy], models: config.models.map((model) => ({ name: model.id, tags: model.tags })) } }));
    await page.route("**/v1/routing/sessions*", (route) => route.fulfill({ json: { data: [], storage: {}, evidence_available: true, page_size: 30, has_more: false, next_cursor: null } }));
    await page.route("**/v1/routing/configuration/validate", async (route) => {
      expect(route.request().method()).toBe("POST");
      validations.push(route.request().postDataJSON() as RoutingOverlayPayload);
      await route.fulfill({ json: { valid: true, warnings: [] } });
    });
    await page.route("**/v1/routing/configuration", async (route) => {
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
    await page.locator(".workflow-drawer button[aria-controls='routing-information']").click();
    const flow = page.getByRole("region", { name: zh ? "策略路径预览" : "Configured route", exact: true });
    await expect(flow).toContainText("missing");
    await expect(flow).toContainText("fixture/global");
    await expect(flow).toContainText(zh ? "不是模型池成员" : "not a pool member");
    await flow.getByRole("button", { name: zh ? /^规则 1/ : /^Rule 1/ }).click();
    await expect(flow.locator('[data-flow-kind="default"]')).toHaveAttribute("data-flow-state", "active");
    if (width === 320) {
      const geometry = await page.locator("#routing-information").evaluate((information) => {
        const drawer = information.closest(".workflow-drawer")!;
        return {
          bodyWidth: information.getBoundingClientRect().width,
          drawerWidth: drawer.getBoundingClientRect().width,
          bodyHeight: information.clientHeight,
          drawerHeight: drawer.clientHeight,
          overflow: getComputedStyle(information).overflowY,
        };
      });
      expect(geometry.bodyWidth).toBeGreaterThanOrEqual(geometry.drawerWidth - 2);
      expect(geometry.bodyHeight).toBeLessThan(geometry.drawerHeight);
      expect(geometry.overflow).toBe("auto");
      const modelLines = await flow.getByText("fixture/global", { exact: true }).evaluate((model) => {
        const range = document.createRange();
        range.selectNodeContents(model);
        return range.getClientRects().length;
      });
      expect(modelLines).toBeLessThanOrEqual(3);
    }
    await expect(page.getByRole("button", { name: zh ? "审阅草稿" : "Review changes", exact: true })).toBeDisabled();
    expect(writes).toEqual([]);
    expect(validations).toEqual([]);

    // A real priority edit follows the normal review/save flow. Inheritance must
    // not turn into tag membership in its payload or the subsequent GET.
    const advanced = page.locator("summary").filter({ hasText: zh ? "备用编辑控件" : "Legacy editor controls" });
    await advanced.click();
    await page.getByLabel(zh ? "fixture/literal 的优先级" : "Priority for fixture/literal", { exact: true }).fill("2");
    await page.getByRole("button", { name: zh ? "审阅草稿" : "Review changes", exact: true }).click();
    await page.getByRole("button", { name: zh ? "确认并应用" : "Confirm and save", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual(validations[0]);
    expect(writes[0]?.models).toEqual({ "fixture/literal": { tags: ["balanced/default"], priority: 2 } });
    expect(writes[0]).not.toHaveProperty("defaults");
    expect(config.models.find((model) => model.id === "fixture/global")?.tags).toEqual([]);
    await page.reload();
    await expect(page.locator('[data-route-target="fixture/global"]')).toContainText(zh ? "默认" : "Default");
    config = { ...config, defaults: { default_model: null } };
    await page.reload();
    await expect(page.locator('[data-route-target="fixture/global"]')).toHaveCount(0);
    await expect(page.locator(".monitoring-destinations")).toContainText(zh ? "通用设置" : "Settings");
    await page.getByRole("button", { name: zh ? "策略工作流" : "Strategy workflow", exact: true }).click();
    await expect(page.locator('path[data-workflow-edge="default"]')).toHaveCount(0);
    await page.locator(".workflow-drawer button[aria-controls='routing-information']").click();
    await expect(flow).not.toContainText("fixture/global");
    await expect(flow).toContainText(zh ? "通用设置" : "Settings");
    expect(writes).toHaveLength(1);
  });
}

for (const locale of ["en", "zh-CN"] as const) for (const width of [1280, 320]) {
  test(`shared implicit pool highlights only the chosen inherited branch (${locale}, ${width})`, async ({ page }) => {
    const zh = locale === "zh-CN";
    const config: ConfigurationPayload = {
      ...structuredClone(configuration), defaults: { default_model: "fixture/global" },
      rules: [{ index: 0, when: { intent: "default" }, select: { selection: "quality_first" } }], fallback: {},
      labels: [{ ...configuration.labels[0]!, name: "missing", tag: "balanced/missing", models: [] }],
      models: [{ id: "fixture/global", provider: "fixture", upstream_model: "global", priority: 1, baseline_priority: 1, tags: [], baseline_tags: [] }],
    };
    let writes = 0;
    await page.route("**/v1/routing/configuration", (route) => {
      if (route.request().method() !== "GET") writes += 1;
      return route.fulfill({ json: config });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: zh ? "策略工作流" : "Strategy workflow", exact: true }).click();
    await page.locator(".workflow-drawer button[aria-controls='routing-information']").click();
    const flow = page.getByRole("region", { name: zh ? "策略路径预览" : "Configured route", exact: true });
    const branches = flow.locator(":scope > ol > li");
    await expect(flow.locator('[data-flow-kind="default"]')).toHaveCount(3);
    for (const index of [0, 1, 2]) {
      const branch = branches.nth(index);
      await branch.getByRole("button", { name: index === 0 ? zh ? /^规则 1/ : /^Rule 1/ : index === 1 ? zh ? "所有规则未命中" : "No rule matches" : zh ? "判定失败兜底" : "Decision failure fallback", exact: index !== 0 }).click();
      await expect(branch.locator('[data-flow-kind="default"]')).toHaveAttribute("data-flow-state", "active");
      await expect(flow.locator('[data-flow-kind="default"][data-flow-state="idle"]')).toHaveCount(2);
      await expect(flow.locator('[data-flow-kind="default"][data-flow-state="active"]')).toHaveCount(1);
    }
    await expect(page.getByRole("button", { name: zh ? "审阅草稿" : "Review changes", exact: true })).toBeDisabled();
    expect(writes).toBe(0);
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
