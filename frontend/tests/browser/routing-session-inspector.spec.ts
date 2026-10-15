import path from "node:path";
import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { inspectorDetail, inspectorRequest, historyPage } from "../fixtures/routing-inspector";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import type { Page } from "@playwright/test";

async function retained(page: Page, words = en) {
  await page.goto("/dashboard/");
  await expect(page.getByRole("heading", { name: words.inspectorTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: words.retainedSessions, exact: true }).click();
}
for (const width of [1280, 390, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`session workspace ${width}px ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    mockApi.historyPages = { first: historyPage(), "history-page-2": historyPage(true) };
    mockApi.detailOverrides["archive-1"] = inspectorDetail();
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.addInitScript(value => localStorage.setItem("jev-dashboard-locale", value), locale);
    await retained(page, words);
    await expect(page.locator("html")).toHaveAttribute("data-scheme", scheme);
    await page.locator('.sessions [data-key="archive-1"] button').focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("article", { name: words.requestDetail, exact: true });
    await expect(detail).toContainText(words.fallbackReason);
    await expect(detail).toContainText(locale === "en" ? "Classification disabled" : "分类已关闭");
    await expect(detail).toContainText(`${words.recordedResult}: ${words.succeeded}`);
    const readingGap = await page.evaluate(() => {
      const timeline = document.querySelector(".timeline")!.getBoundingClientRect();
      const reason = document.querySelector(".request-detail h3")!.getBoundingClientRect();
      return { timelineHeight: timeline.height, gap: reason.top - timeline.bottom };
    });
    expect(readingGap.timelineHeight).toBeLessThan(132);
    expect(readingGap.gap).toBeLessThan(160);
    const context = detail.getByRole("region", { name: words.recordedContext, exact: true });
    await expect(context.locator('[data-message-role="user"]')).toHaveCount(1);
    await expect(context.getByText("Synthetic folded system instruction", { exact: true })).toBeHidden();
    const system = context.locator("details").filter({ has: page.locator("summary", { hasText: "system" }) }).first();
    await system.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(context.getByText("Synthetic folded system instruction", { exact: true })).toBeVisible();
    await system.locator("summary").press("Enter");
    await expect(context.locator("pre").first()).toHaveCSS("white-space", "pre-wrap");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const geometry = await detail.evaluate(element => ({ width: element.getBoundingClientRect().width, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(geometry.width).toBeGreaterThan(width >= 900 ? 800 : width - 90);
    await detail.locator(".recorded-config > summary").click();
    await expect(detail.locator(".recorded-config")).toContainText("synthetic-recorded-config");
    await detail.locator(".recorded-config > summary").click();
    await page.getByRole("button", { name: words.backToRequests, exact: true }).focus();
    await page.keyboard.press("Enter");
    const request = page.locator('.timeline [data-key="inspector-request-1"] button');
    await expect(request).toBeFocused();
    expect(await request.evaluate(element => element.matches(":focus-visible"))).toBe(true);
    await page.screenshot({ path: path.resolve(`../.trellis/tasks/10-15-routing-session-inspector/research/ui-screenshots/after-${width}-${locale}-${scheme}.png`), fullPage: true });
    await writeFile(info.outputPath("geometry.json"), JSON.stringify({ geometry, readingGap, requests: mockApi.requests }, null, 2));
    // The live distribution keeps its 20-session meaning while history is open.
    await expect(page.locator(".monitoring-route-map")).toContainText("20");
    expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
  });
}

test("retained pages deduplicate and request pages preserve keyboard ownership", async ({ page, mockApi }) => {
  const first = historyPage(), second = historyPage(true);
  second.data.unshift(first.data[9]!);
  mockApi.historyPages = { first, "history-page-2": second };
  mockApi.pagedDetailSessionId = "archive-1";
  await retained(page);
  const list = page.locator(".sessions.virtual-list");
  await list.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => mockApi.requests.filter(({ path }) => path.includes("scope=retained&cursor=history-page-2")).length).toBe(1);
  await expect(list.locator('[data-key="archive-10"]')).toHaveCount(1);
  await list.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  await list.locator('[data-key="archive-1"] button').click();
  const timeline = page.locator(".timeline.virtual-list");
  const focused = timeline.locator('[data-key="request-1"] button');
  await focused.focus();
  await page.keyboard.press("ArrowDown");
  await expect(timeline.locator('[data-key="request-2"] button')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(timeline.locator('[data-key="request-2"] button')).toHaveAttribute("aria-pressed", "true");
  await timeline.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => mockApi.requests.filter(({ path }) => path.includes("scope=retained&cursor=fixture-request-page-2")).length).toBe(1);
  await expect(timeline.locator('[data-key="request-2"] button')).toBeAttached();
  await expect(timeline.locator('[data-key="request-2"] button')).toBeFocused();
  expect(await timeline.locator(".virtual-row").count()).toBeLessThanOrEqual(12);
});

test("switching snapshots replaces context and missing historical outcome remains unknown", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: { ...historyPage(), has_more: false, next_cursor: null } };
  const detail = inspectorDetail();
  const second = inspectorRequest("second-snapshot");
  second.request["messages"] = [{ role: "user", content: "Only the second snapshot is displayed" }];
  second.decision = { strategy: "old", label: "default", reason: "decision_matrix:local:fallback:first_turn_review" };
  second.outcome = null;
  detail.requests.push(second);
  mockApi.detailOverrides["archive-1"] = detail;
  await retained(page);
  await page.locator('.sessions [data-key="archive-1"] button').click();
  await page.locator('.timeline [data-key="second-snapshot"] button').click();
  const content = page.locator(".context-snapshot");
  await expect(content).toContainText("Only the second snapshot is displayed");
  await expect(content).not.toContainText("Synthetic selected snapshot");
  await expect(page.locator(".request-detail")).toContainText(en.legacyFallbackReason);
  await expect(page.locator(".request-detail")).toContainText(en.upstreamUnknown);
  await expect(page.locator(".request-detail")).not.toContainText("24 ms");
  await page.locator(".recorded-config > summary").click();
  await expect(page.locator(".recorded-config")).toContainText(en.configUnavailable);
  await expect(page.locator(".recorded-config")).not.toContainText("synthetic-recorded-config");
  await expect(page.locator(".request-detail")).not.toContainText("Pending");
});

test("loading, failure, uncaptured content, missing context and unavailable storage stay distinct", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: historyPage() };
  let release!: () => void;
  mockApi.delayNextDetail = () => new Promise<void>(resolve => { release = resolve; });
  mockApi.detailOverrides["archive-1"] = inspectorDetail();
  mockApi.detailOverrides["archive-1"].requests[0]!.request["content_captured"] = false;
  mockApi.detailOverrides["archive-2"] = inspectorDetail("archive-2");
  mockApi.detailOverrides["archive-2"].requests[0]!.request = { request_id: "missing", content_captured: true };
  mockApi.detailFailures["archive-3"] = 503;
  mockApi.detailOverrides["archive-4"] = { ...inspectorDetail("archive-4"), evidence_available: false, storage: { enabled: false }, requests: [] };
  await retained(page);
  await page.locator('.sessions [data-key="archive-1"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText(en.loadingRequests);
  release();
  await expect(page.locator(".context-snapshot")).toContainText(en.contentNotCaptured);
  await expect(page.locator(".context-snapshot [data-message-role]")).toHaveCount(0);
  await page.locator('.sessions [data-key="archive-2"] button').click();
  await expect(page.locator(".context-snapshot")).toContainText(en.contentMissing);
  await page.locator('.sessions [data-key="archive-3"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText(en.evidenceUnavailable);
  delete mockApi.detailFailures["archive-3"];
  await page.getByRole("button", { name: en.retryPage, exact: true }).click();
  await expect(page.locator(".request-detail")).toBeVisible();
  await page.locator('.sessions [data-key="archive-4"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText(en.evidenceUnavailable);
  await expect(page.locator(".request-detail")).toHaveCount(0);
});

test("retired detail and retained-list replies cannot replace a new scope or selection", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: historyPage() };
  mockApi.detailOverrides["archive-2"] = { ...inspectorDetail("archive-2"), requests: [inspectorRequest("new-owner-request")] };
  let release!: () => void;
  let entered = false;
  await page.route("**/v1/routing/sessions/archive-1/requests?scope=retained", async route => {
    entered = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic retired authorization" } } }).catch(() => undefined);
  });
  await retained(page);
  await page.locator('.sessions [data-key="archive-1"] button').click();
  await expect.poll(() => entered).toBe(true);
  await page.locator('.sessions [data-key="archive-2"] button').click();
  await expect(page.locator(".request-detail")).toContainText("new-owner-request");
  release();
  await expect(page.getByRole("heading", { name: en.inspectorTitle, exact: true })).toBeVisible();
  await expect(page.locator(".request-detail")).toContainText("new-owner-request");
  await page.getByRole("button", { name: en.currentSessions, exact: true }).click();
  await expect(page.locator('.sessions [data-key="session-1"]')).toBeVisible();
  await expect(page.locator('.sessions [data-key="archive-2"]')).toHaveCount(0);
  await expect(page.locator(".request-detail")).toHaveCount(0);
});

test("a delayed retained list cannot overwrite live scope and unavailable history offers GET-only recovery", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: { ...historyPage(), evidence_available: false, storage: { enabled: false }, data: [], has_more: false, next_cursor: null } };
  let release!: () => void;
  let entered = false;
  await page.route("**/v1/routing/sessions?scope=retained", async route => {
    entered = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: historyPage() }).catch(() => undefined);
  }, { times: 1 });
  await retained(page);
  await expect.poll(() => entered).toBe(true);
  await expect(page.locator(".monitoring-sessions-panel")).toContainText(en.loading);
  await page.getByRole("button", { name: en.currentSessions, exact: true }).click();
  release();
  await expect(page.locator('.sessions [data-key="session-1"]')).toBeVisible();
  await expect(page.locator('.sessions [data-key="archive-1"]')).toHaveCount(0);
  await page.getByRole("button", { name: en.retainedSessions, exact: true }).click();
  await expect(page.locator(".monitoring-sessions-panel")).toContainText(en.evidenceUnavailable);
  await expect(page.locator(".monitoring-sessions-panel")).not.toContainText(en.emptyHistory);
  mockApi.historyPages.first = historyPage();
  await page.locator(".monitoring-sessions-panel").getByRole("button", { name: en.retryPage, exact: true }).click();
  await expect(page.locator('.sessions [data-key="archive-1"]')).toBeVisible();
  expect(mockApi.requests.filter(({ method }) => method !== "GET")).toEqual([]);
});

test("accepted answers, one-based matching rule and eligible model pool use recorded evidence", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: historyPage() };
  const detail = inspectorDetail();
  const decision = detail.requests[0]!.decision!;
  decision.routing_evidence!.classification = { status: "accepted", provider_id: "synthetic-judge", answers: { workload: { choice: "docs" } }, attempts: [{ provider_id: "synthetic-judge", status: "accepted", http_status: 200, elapsed_ms: 9 }] };
  decision.routing_evidence!.rule_status = "matched";
  decision.routing_evidence!.matched_rule_index = 7;
  decision.routing_evidence!.pool!.label = "draft";
  decision["label"] = "draft";
  mockApi.detailOverrides["archive-1"] = detail;
  await retained(page);
  await page.locator('.sessions [data-key="archive-1"] button').click();
  const selected = page.locator(".request-detail");
  await expect(selected.locator(".routing-reason")).toContainText("Accepted classification matched rule 7");
  await expect(selected).toContainText("Documentation");
  await selected.getByText("Eligible candidates · 1", { exact: true }).click();
  await expect(selected.locator("dd details").getByRole("listitem")).toHaveText("openai/gpt-6-luna");
  await expect(selected.locator("dd details").getByRole("listitem")).toBeVisible();
  await selected.locator(".recorded-config > summary").click();
  await expect(selected.locator(".recorded-config")).toContainText("workload = docs");
  await expect(selected.locator(".recorded-config")).toContainText("cheapest_adequate");
  await expect(selected.locator(".recorded-config")).toContainText("synthetic-recorded-config");
  await selected.getByText("Provider attempts · 1", { exact: true }).click();
  await expect(selected.locator("li").filter({ hasText: "HTTP 200" })).toBeVisible();
});
