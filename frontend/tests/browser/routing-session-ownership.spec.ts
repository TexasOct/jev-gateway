import { test, expect } from "./fixtures";
import { historyPage, inspectorDetail } from "../fixtures/routing-inspector";
import { en } from "../../src/shared/i18n/en";

for (const resource of ["history", "detail"] as const) for (const status of [200, 401]) {
  test(`leaving monitoring retires a delayed ${resource} HTTP ${status}`, async ({ page, mockApi }) => {
    mockApi.historyPages = { first: historyPage(), "history-page-2": historyPage(true) };
    mockApi.detailOverrides["archive-1"] = inspectorDetail();
    let release!: () => void;
    let entered = false;
    let delivered!: () => void;
    const delivery = new Promise<void>(resolve => { delivered = resolve; });
    const endpoint = resource === "history"
      ? "**/v1/routing/sessions?scope=retained"
      : "**/v1/routing/sessions/archive-1/requests?scope=retained";
    await page.route(endpoint, async route => {
      entered = true;
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ status, json: status === 401
        ? { error: { message: "Synthetic retired authorization" } }
        : resource === "history" ? historyPage() : inspectorDetail() }).catch(() => undefined);
      delivered();
    }, { times: 1 });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.retainedSessions, exact: true }).click();
    if (resource === "detail") await page.locator('.sessions [data-key="archive-1"] button').click();
    await expect.poll(() => entered).toBe(true);
    await page.getByRole("button", { name: en.providerModels, exact: true }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-view", "providers");
    release();
    await delivery;
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-view", "providers");
    await expect(page.locator("[data-connection-page]")).toHaveCount(0);
    await page.getByRole("button", { name: en.monitoring, exact: true }).click();
    await expect(page.locator('.sessions [data-key="archive-1"] button')).toBeVisible();
    if (resource === "detail") await expect(page.locator(".request-detail")).toContainText("inspector-request-1");
    const list = page.locator(".sessions.virtual-list");
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => mockApi.requests.some(({ path }) => path.includes("scope=retained&cursor=history-page-2"))).toBe(true);
  });
}

test("a current retained-list 401 suspends and reconnect resumes historical paging", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: historyPage(), "history-page-2": historyPage(true) };
  await page.route("**/v1/routing/sessions?scope=retained", route => route.fulfill({ status: 401, json: { error: { message: "Synthetic current authorization" } } }), { times: 1 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.retainedSessions, exact: true }).click();
  await expect(page.getByRole("heading", { name: en.connect, exact: true })).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-history-reconnect");
  await page.getByRole("button", { name: en.connect, exact: true }).click();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  const list = page.locator(".sessions.virtual-list");
  await expect(list.locator('[data-key="archive-1"] button')).toBeVisible();
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => mockApi.requests.some(({ path }) => path.includes("scope=retained&cursor=history-page-2"))).toBe(true);
});

for (const total of [1000, 1001, 1020]) {
  test(`terminal page discloses actual truncation for ${total} retained sessions`, async ({ page }) => {
    const sample = historyPage().data[0]!;
    let pages = 0;
    await page.route("**/v1/routing/sessions?scope=retained*", async route => {
      const start = Number(new URL(route.request().url()).searchParams.get("cursor") ?? 0);
      const end = Math.min(total, start + 30);
      ++pages;
      await route.fulfill({ json: { ...historyPage(), data: Array.from({ length: end - start }, (_, index) => ({ ...sample, session_id: `cap-${start + index}` })), has_more: end < total, next_cursor: end < total ? String(end) : null } });
    });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.retainedSessions, exact: true }).click();
    const list = page.locator(".sessions.virtual-list");
    await expect(list.locator('[data-key="cap-0"]')).toBeAttached();
    for (let start = 30; start < total; start += 30) {
      await list.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
      await expect(list.locator(`[data-key="cap-${start}"]`)).toBeAttached();
    }
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
    await expect(list.locator('[data-key="cap-999"]')).toBeAttached();
    await expect(list.locator('[data-key="cap-1000"]')).toHaveCount(0);
    const notice = page.locator(".monitoring-sessions-panel").getByText("Showing the first 1,000 retained sessions.", { exact: false });
    if (total > 1000) await expect(notice).toBeVisible();
    else await expect(notice).toHaveCount(0);
    expect(pages).toBe(Math.ceil(total / 30));
  });
}

test("deduplicated request pages disclose a terminal page crossing the 300-request cap", async ({ page, mockApi }) => {
  mockApi.historyPages = { first: historyPage() };
  const requests = Array.from({ length: 301 }, (_, index) => ({ request: { request_id: `request-cap-${index}`, received_at: 1700000100 - index, content_captured: false }, decision: null, upstream_request: null, outcome: null }));
  let pages = 0;
  await page.route("**/v1/routing/sessions/archive-1/requests?scope=retained*", async route => {
    const index = Number(new URL(route.request().url()).searchParams.get("cursor") ?? 0);
    const start = index === 0 ? 0 : 30 + (index - 1) * 29;
    const end = Math.min(301, start + (index === 0 ? 30 : 29));
    ++pages;
    await route.fulfill({ json: { ...inspectorDetail(), requests: requests.slice(start === 0 ? 0 : start - 1, end), has_more: end < 301, next_cursor: end < 301 ? String(index + 1) : null } });
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.retainedSessions, exact: true }).click();
  await page.locator('.sessions [data-key="archive-1"] button').click();
  const timeline = page.locator(".timeline.virtual-list");
  await expect(timeline.locator('[data-key="request-cap-0"]')).toBeAttached();
  for (let start = 30; start < 301; start += 29) {
    await timeline.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
    await expect(timeline.locator(`[data-key="request-cap-${start}"]`)).toBeAttached();
  }
  await timeline.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
  await expect(timeline.locator('[data-key="request-cap-299"]')).toBeAttached();
  await expect(timeline.locator('[data-key="request-cap-300"]')).toHaveCount(0);
  await expect(page.locator(".monitoring-requests-panel")).toContainText("Showing the first 300 retained requests.");
  expect(pages).toBe(11);
});
