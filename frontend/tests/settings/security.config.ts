import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.JEV_SETTINGS_TEST_PORT ?? 43971);
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: ".", testMatch: "access-security.spec.ts", fullyParallel: false,
  retries: 0, reporter: "list", outputDir: "../../../.trellis/tasks/10-05-admin-settings-security/research/browser-results",
  use: { ...devices["Desktop Chrome"], baseURL: origin, serviceWorkers: "block", trace: "off", screenshot: "off", video: "off" },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: `${origin}/dashboard/tests/settings/security.html`, reuseExistingServer: false },
});
