import { test, expect } from "./fixtures";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/");
  await expect(page.locator('header button[aria-label="Refresh"]')).toBeVisible();
}

test("restores the first cursor page when a later page fails, then loads the next page on retry", async ({ page, mockApi }) => {
  mockApi.rejectNextSessionPage = true;
  await openDashboard(page);
  await expect(page.getByRole("button", { name: "Retry loading more" })).toBeVisible();
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  await expect(page.locator('.sessions .virtual-row[data-key="session-1"]')).toBeVisible();
  await expect(page.locator('.sessions .virtual-row[data-key="session-11"]')).toHaveCount(0);
  expect(mockApi.requests.filter(({ path }) => path.includes("cursor=fixture-page-2"))).toHaveLength(1);
  await page.getByRole("region").getByRole("button", { name: "Retry loading more" }).click();
  await expect(page.getByRole("region").getByRole("status").filter({ hasText: "Complete" })).toBeVisible();
  await expect(page.locator('.sessions .virtual-row[data-key="session-1"]')).toHaveCount(1);
  const list = page.getByLabel("Current sessions");
  await list.hover();
  await page.mouse.wheel(0, 1100);
  await expect(page.locator('.sessions .virtual-row[data-key="session-11"]')).toBeVisible();
  expect(mockApi.requests.filter(({ path }) => path.includes("cursor=fixture-page-2"))).toHaveLength(2);
});

test("supports keyboard session selection and selected detail", async ({ page }) => {
  await openDashboard(page);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  const list = page.getByLabel("Current sessions");
  await expect(list).toBeVisible();
  const first = list.locator('.virtual-row[data-key="session-1"] button');
  await first.focus();
  await first.press("ArrowDown");
  await expect(list.locator(".virtual-row").filter({ has: page.getByRole("button", { name: /session-2/i }) }).getByRole("button")).toBeFocused();
  await list.locator(".virtual-row").filter({ has: page.getByRole("button", { name: /session-2/i }) }).getByRole("button").press("Enter");
  await expect(page.getByText("request-2").first()).toBeVisible();
});

test("request-detail list loads a cursor page on scroll and retains its focused row", async ({ page, mockApi }) => {
  mockApi.pagedDetailSessionId = "session-1";
  await openDashboard(page);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  await page.locator('.sessions .virtual-row[data-key="session-1"] button').click();
  const timeline = page.getByLabel("Select a session");
  await expect(page.locator('.timeline .virtual-row[data-key="request-1"]')).toBeVisible();
  await expect.poll(() => mockApi.requests.filter(({ path }) => path.includes("cursor=fixture-request-page-2")).length).toBe(0);
  const focused = page.locator('.timeline .virtual-row[data-key="request-1"] button.request-select');
  await focused.focus();
  await expect(focused).toBeFocused();
  await timeline.evaluate((element) => { element.scrollTop = 2500; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => mockApi.requests.filter(({ path }) => path.includes("cursor=fixture-request-page-2")).length).toBe(1);
  await expect(focused).toBeAttached();
  await expect(focused).toBeFocused();
  await expect(page.locator('.timeline .virtual-row[data-key="request-9"]')).toBeVisible();
  expect(mockApi.requests.filter(({ path }) => path.includes("cursor=fixture-request-page-2"))).toHaveLength(1);
});

test("utility geometry keeps virtual windows, recorded trace and mobile table readable", async ({ page }) => {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await openDashboard(page);
    const wire = page.locator(".monitoring-branch-base").first();
    await expect(wire).toHaveCSS("fill", "none");
    await expect(wire).toHaveCSS("vector-effect", "non-scaling-stroke");
    await expect(wire).toHaveCSS("stroke-width", "1.4px");
    await page.getByText("Inspect sessions, retained requests and provider observations").click();
    const sessions = page.locator(".virtual-list.sessions");
    const timeline = page.locator(".virtual-list.timeline");
    const sessionHeight = width <= 720 ? "280px" : "480px";
    const timelineHeight = width <= 720 ? `${900 * 0.62}px` : "480px";
    for (const [list, height] of [[sessions, sessionHeight], [timeline, timelineHeight]] as const) {
      await expect(list).toHaveCSS("height", height);
      await expect(list).toHaveCSS("min-height", height);
      await expect(list).toHaveCSS("max-height", height);
      await expect(list).toHaveCSS("overflow-y", "auto");
    }
    const row = sessions.locator(".virtual-row").first();
    await expect(row).toHaveCSS("position", "absolute");
    await expect(row).toHaveCSS("height", "132px");
    await sessions.locator('.virtual-row[data-key="session-1"] button').click();
    const requestRow = timeline.locator(".virtual-row").first();
    await expect(requestRow).toHaveCSS("height", "360px");
    const trace = requestRow.locator(".route-trace");
    await expect(trace).toBeVisible();
    await expect(trace.locator(".trace-connections")).toHaveCSS("pointer-events", "none");
    const viewport = page.locator(".virtual-list.timeline");
    await viewport.hover();
    await page.mouse.wheel(0, 700);
    await expect(viewport).toHaveJSProperty("scrollTop", 0);
    await page.mouse.wheel(0, 900);
    const requestButton = requestRow.locator("button.request-select");
    await requestButton.focus();
    await expect(requestButton).toBeFocused();
    const retainedRequestId = await requestButton.locator("span").nth(1).textContent();
    await viewport.evaluate((element) => { element.scrollTop = 720; element.dispatchEvent(new Event("scroll")); });
    await expect.poll(() => requestButton.evaluate((element) => element.isConnected)).toBe(true);
    await expect(requestButton).toBeFocused();
    await expect(requestRow.locator("button.request-select span").nth(1)).toHaveText(retainedRequestId ?? "");
    await viewport.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
    await expect(requestRow).toBeVisible();
    const missingStage = requestRow.locator('.trace-stage[data-presence="missing"]').first();
    await expect(missingStage).toHaveCSS("border-top-style", "dashed");
    await expect(missingStage).toHaveCSS("background-color", await trace.locator('.trace-stage[data-presence="present"]').first().evaluate((element) => getComputedStyle(element).backgroundColor));
    await expect(trace.locator('.trace-stage[data-presence="present"]').first()).toHaveAttribute("data-presence", "present");
    await expect(trace.locator('.trace-outcome[data-outcome="success"]')).toBeVisible();
    await trace.getByRole("button", { name: /Replay/ }).click();
    await expect(trace.getByRole("status")).toContainText("is playing");
    await trace.getByRole("button", { name: /Pause/ }).click();
    await expect(trace.getByRole("status")).toContainText("paused");
    await trace.getByRole("button", { name: /Reset/ }).click();
    await expect(trace.getByRole("status")).toContainText("missing fields remain disconnected");
    await expect(trace.locator(".trace-segment").first()).toHaveCSS("stroke-width", "1.5px");
    await expect(trace.locator('.trace-outcome[data-outcome="success"]')).toBeVisible();
    await expect(trace.locator('.trace-stage[data-presence="missing"]')).toHaveCount(1);
    await expect(trace.locator('.trace-stage[data-presence="present"]')).toHaveCount(3);
    await expect(trace.locator('.trace-stage[data-active="true"]')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(trace.locator(".trace-stage-area")).toHaveAttribute("data-trace-motion", "reduced");
    await trace.getByRole("button", { name: /Replay/ }).click();
    await expect(trace.getByRole("status")).toContainText("complete");
    await expect(trace.locator(".trace-packet")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByText("Inspect recorded provider observations").click();
    const table = page.locator(".monitoring-providers-panel .table-wrap");
    if (width <= 720) {
      await expect(table.locator("thead")).toHaveCSS("display", "none");
      const emptyCell = table.locator("td").first();
      await expect(emptyCell).toHaveCSS("display", "flex");
      await expect(emptyCell).toHaveCSS("border-bottom-width", "0px");
    } else {
      await expect(table.locator("thead")).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("keeps request-detail loading, failure, unavailable evidence, and empty states distinct", async ({ page, mockApi }) => {
  mockApi.detailFailures["session-1"] = 503;
  await openDashboard(page);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("Choose a live session to inspect retained requests");
  await page.locator('.sessions .virtual-row[data-key="session-1"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("Evidence unavailable");
  await expect(page.getByRole("button", { name: "Retry loading more" })).toBeVisible();
  mockApi.detailOverrides["session-2"] = { session: { session_id: "session-2" }, storage: { enabled: false, error: "synthetic storage unavailable" }, evidence_available: false, requests: [], page_size: 8, next_cursor: null, has_more: false };
  await page.locator('.sessions .virtual-row[data-key="session-2"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("Evidence unavailable: synthetic storage unavailable");
  mockApi.detailOverrides["session-3"] = { session: { session_id: "session-3" }, storage: { enabled: true }, evidence_available: true, requests: [], page_size: 8, next_cursor: null, has_more: false };
  await page.locator('.sessions .virtual-row[data-key="session-3"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("No retained requests for this live session");
  const request = { request: { request_id: "unknown-outcome", received_at: 1700000010 }, decision: null, upstream_request: null, outcome: null };
  mockApi.detailOverrides["session-4"] = { session: { session_id: "session-4" }, storage: { enabled: true }, evidence_available: true, requests: [request], page_size: 8, next_cursor: null, has_more: false };
  await page.locator('.sessions .virtual-row[data-key="session-4"] button').click();
  await expect(page.locator('.request-card .trace-outcome[data-outcome="unknown"]')).toBeVisible();
});

test("keeps request-detail loading copy visible while its synthetic response is delayed", async ({ page, mockApi }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mockApi.detailOverrides["session-1"] = { session: { session_id: "session-1" }, storage: { enabled: true }, evidence_available: true, requests: [], page_size: 8, next_cursor: null, has_more: false };
  mockApi.delayNextDetail = () => gate;
  await openDashboard(page);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  await page.locator('.sessions .virtual-row[data-key="session-1"] button').click();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("Loading retained requests for the selected session");
  release();
  await expect(page.locator(".monitoring-requests-panel")).toContainText("No retained requests for this live session");
});

test("keeps mobile provider cells' data-label records readable", async ({ page, mockApi }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  mockApi.providerOverride = {
    window: { seconds: 60, start: 0, end: 60, basis: "retained" },
    storage: { enabled: true }, evidence_available: true,
    providers: [{ id: "fixture-provider", type: "openai", configured: true, has_api_key: true,
      attempts: 1, completed: 1, succeeded: 1, failed: 0, incomplete_evidence: 0,
      average_latency_ms: 10, last_outcome_at: 1700000000, last_outcome_ok: true,
      observed_condition: "all_observed_attempts_succeeded" }],
  };
  await openDashboard(page);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  await page.getByText("Inspect recorded provider observations").click();
  const cell = page.locator(".monitoring-providers-panel td[data-label]").first();
  await expect(cell).toHaveAttribute("data-label", "Provider");
  await expect(cell).toHaveCSS("display", "flex");
  await expect.poll(() => cell.evaluate((element) => getComputedStyle(element, "::before").content)).toBe('"Provider"');
});

test("activity honors reduced motion and keeps refresh outside the route map", async ({ page, mockApi }) => {
  mockApi.activityOverride = {
    object: "routing.activity", scope: "process", instance_id: "fixture", complete: true,
    paths: [{ strategy: "balanced", route: "fixture", provider: "fixture-provider", upstream_model: "fixture-model", in_flight_requests: 1, in_flight_streams: 1 }],
  };
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 820 });
    await openDashboard(page);
    const refresh = page.locator("header").getByRole("button", { name: "Refresh", exact: true });
    await expect(refresh).toBeVisible();
    await expect(page.locator(".monitoring-activity-state button")).toHaveCount(0);
    const activity = page.locator(".monitoring-activity-state");
    const activePath = page.locator(".monitoring-branch-active").first();
    await expect(activity).toContainText("In flight");
    await expect(page.locator(".monitoring-branch-svg svg")).toBeVisible();
    await expect(activePath).toBeAttached();
    await expect.poll(() => activePath.evaluate((element) => (element as SVGPathElement).getTotalLength())).toBeGreaterThan(0);
    await expect(activePath).toHaveCSS("stroke-width", "2.5px");
    await expect(activePath).toHaveCSS("animation-name", "monitoring-route-flow");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(activePath).toHaveCSS("animation-name", "none");
    await expect(activePath).toHaveCSS("stroke-dasharray", "none");
    await expect(activity).toContainText("In flight");
    await expect(page.locator(".monitoring-route-map button")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(activePath).toHaveCSS("animation-name", "monitoring-route-flow");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("region", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await expect(refresh).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("activity sample failure is shown as unavailable and can be retried without policy writes", async ({ page, mockApi }) => {
  mockApi.rejectNextActivity = true;
  await openDashboard(page);
  await expect(page.getByRole("status").filter({ hasText: "Activity unavailable" })).toBeVisible();
  const activityCallsBeforeRetry = mockApi.requests.filter(({ path }) => path === "/v1/routing/activity").length;
  await page.locator("header").getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "In flight" })).toBeVisible();
  expect(mockApi.requests.filter(({ path }) => path === "/v1/routing/activity").length).toBeGreaterThan(activityCallsBeforeRetry);
  expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
});

test("keeps the latest-session preview unselected until an operator chooses a session", async ({ page, mockApi }) => {
  await openDashboard(page);
  expect(mockApi.requests.some(({ path }) => /\/sessions\/[^/]+\/requests/.test(path))).toBe(false);
  await page.getByText("Inspect sessions, retained requests and provider observations").click();
  expect(mockApi.requests.some(({ path }) => /\/sessions\/[^/]+\/requests/.test(path))).toBe(false);
});
