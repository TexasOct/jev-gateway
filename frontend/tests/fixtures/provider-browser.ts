import { test as base, expect } from "@playwright/test";
import { activity, providers } from "./activity";
import { configuration } from "./configuration";
import { sessionsPageOne, sessionsPageTwo } from "./sessions";
import { policy, strategies } from "./strategies";

export const test = base.extend<{ isolatedGateway: boolean }>({
  isolatedGateway: [async ({ context, page, baseURL }, use) => {
    const unexpected: string[] = [];
    const origin = new URL(baseURL!).origin;
    const reads: Record<string, unknown> = {
      "/v1/routing/providers/summary": providers, "/v1/routing/activity": activity,
      "/v1/routing/strategies": strategies, "/v1/routing/policy": policy,
      "/v1/routing/configuration": configuration,
      "/v1/dashboard/theme": { version: 1, seed: "#3b66d9" },
    };
    await context.route("**/*", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === origin && request.method() === "GET") {
        if (url.pathname === "/dashboard/" || /^\/dashboard\/assets\/[^/]+\.(?:js|css|svg|png)$/.test(url.pathname)) return route.continue();
        const body = url.pathname === "/v1/routing/sessions" ? (url.searchParams.has("cursor") ? sessionsPageTwo : sessionsPageOne) : reads[url.pathname];
        if (body !== undefined) return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      }
      unexpected.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort("blockedbyclient");
    });
    await page.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "en"));
    await use(true);
    expect(unexpected).toEqual([]);
  }, { auto: true }],
});
export { expect };
