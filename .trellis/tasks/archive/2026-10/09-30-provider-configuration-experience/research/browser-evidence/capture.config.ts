import { defineConfig, devices } from "/Users/texas/Workspace/jev-llmroute-test/frontend/node_modules/@playwright/test/index.mjs";
export default defineConfig({
  testDir: "/tmp/jev-provider-browser-evidence", testMatch: "capture.spec.ts", fullyParallel: false, workers: 1, retries: 0, timeout: 15000,
  reporter: "list", outputDir: "/tmp/jev-provider-browser-evidence/results",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4182/dashboard/", serviceWorkers: "block" },
  webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4182 --strictPort", cwd: "/Users/texas/Workspace/jev-llmroute-test/frontend", url: "http://127.0.0.1:4182/dashboard/", reuseExistingServer: false, timeout: 30000 },
});
