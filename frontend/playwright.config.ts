import { defineConfig, devices } from "@playwright/test";

// Serve the freshly built static bundle on loopback, with no gateway/proxy process.
// Never reuse a process on this port: it could be an unrelated gateway.
const portText = process.env.JEV_BROWSER_PORT ?? "4178";
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error("JEV_BROWSER_PORT must be an integer between 1 and 65535");
}
const port = Number(portText);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/supplier-cloud.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  outputDir: "./node_modules/.cache/playwright-results",
  use: { ...devices["Desktop Chrome"], baseURL: `${origin}/dashboard/`, serviceWorkers: "block" },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${origin}/dashboard/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
