import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
const port = Number(process.env.JEV_BROWSER_PORT ?? "43861");
export default defineConfig({
  testDir: ".", testMatch: "*.spec.ts", fullyParallel: false, retries: 0,
  outputDir: "../../node_modules/.cache/integration-async-results",
  use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${port}`, serviceWorkers: "block" },
  webServer: { cwd: fileURLToPath(new URL("../..", import.meta.url)), command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}/dashboard/`, reuseExistingServer: false, timeout: 30000 },
});
