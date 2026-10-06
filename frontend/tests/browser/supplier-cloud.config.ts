import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "supplier-cloud.spec.ts", fullyParallel: true, workers: 2, retries: 0, timeout: 20000, reporter: "list",
  outputDir: "../../supplier-node_modules/cloud-results",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4297", serviceWorkers: "block", trace: "off", screenshot: "off", video: "off" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4297 --strictPort", url: "http://127.0.0.1:4297/dashboard/tests/browser/supplier-cloud.html", reuseExistingServer: false, timeout: 30000 },
});
