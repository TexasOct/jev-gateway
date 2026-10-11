import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "primitives.check.ts", fullyParallel: true, workers: 2, retries: 0, reporter: "list",
  outputDir: "../../../.trellis/tasks/10-06-shadcn-primitives/research/primitive-browser-results",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4196/dashboard/", serviceWorkers: "block" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4196 --strictPort", url: "http://127.0.0.1:4196/dashboard/tests/browser/primitives.html", reuseExistingServer: false, timeout: 30000 },
});
