import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:4182";
export default defineConfig({
  testDir: ".", testMatch: "provider-management.spec.ts", fullyParallel: true, retries: 0, timeout: 10000,
  reporter: "list", outputDir: "../../node_modules/.cache/provider-playwright-results",
  use: { ...devices["Desktop Chrome"], baseURL: `${origin}/dashboard/`, serviceWorkers: "block" },
  webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4182 --strictPort", url: `${origin}/dashboard/`, reuseExistingServer: false, timeout: 30000 },
});
