import { test as base, expect } from "@playwright/test";
import { installMockApi } from "../setup/mock-api";
import type { MockApiState } from "../setup/mock-api";

type Fixtures = { mockApi: MockApiState };
export const test = base.extend<Fixtures>({
  mockApi: [async ({ context, page }, use) => {
    const state: MockApiState = { requests: [], unexpected: [], rejectNextSessionPage: false, allowedWrites: [], detailOverrides: {}, pagedDetailSessionId: null, detailFailures: {}, rejectNextActivity: false, configurationWarnings: false, configurationApplied: true, themeSeed: "#3b66d9", rejectThemeRead: false };
    await installMockApi(context, state);
    await page.addInitScript(() => {
      window.localStorage.setItem("jev-dashboard-locale", "en");
    });
    await use(state);
    expect(state.unexpected, "browser suite must remain isolated from unmocked APIs and origins").toEqual([]);
    expect(state.requests.filter(({ method, path }) => method !== "GET" && path !== "/v1/dashboard/canvas-layout" && !state.allowedWrites.some((write) => write.method === method && write.path === path))).toEqual([]);
  }, { auto: true }],
});
export { expect };
