import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.JEV_BROWSER_PORT ?? 4293);
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: ".", testMatch: ["supplier-connections.spec.ts", "select-controls.spec.ts"],
  fullyParallel: true, workers: 2, retries: 0, timeout: 15000, reporter: "list",
  outputDir: "../../supplier-node_modules/browser-results",
  use: { ...devices["Desktop Chrome"], baseURL: `${origin}/dashboard/`, serviceWorkers: "block" },
  webServer: { command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`, url: `${origin}/dashboard/`, reuseExistingServer: false, timeout: 30000 },
});
