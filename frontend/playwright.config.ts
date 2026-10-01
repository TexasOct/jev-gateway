import { defineConfig, devices } from "@playwright/test";

// Serve the freshly built static bundle on loopback, with no gateway/proxy process.
// Never reuse a process on this port: it could be an unrelated gateway.
const origin = "http://127.0.0.1:4178";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  outputDir: "./node_modules/.cache/playwright-results",
  use: { ...devices["Desktop Chrome"], baseURL: `${origin}/dashboard/`, serviceWorkers: "block" },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4178 --strictPort",
    url: `${origin}/dashboard/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
