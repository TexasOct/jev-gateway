import { defineConfig } from "../../../../frontend/node_modules/@playwright/test";
import config from "../../../../frontend/playwright.config";

const root = "/Users/texas/Workspace/jev-select-spacing-alignment";
const origin = "http://127.0.0.1:4197";
export default defineConfig({
  ...config,
  testDir: `${root}/frontend/tests/browser`,
  workers: 2,
  outputDir: `${root}/.trellis/tasks/10-04-select-spacing-alignment/verification/${process.env.SELECT_CAPTURE_BEFORE === "1" ? "before" : "after"}`,
  reporter: [["list"], ["json", { outputFile: `${root}/.trellis/tasks/10-04-select-spacing-alignment/verification/${process.env.SELECT_CAPTURE_BEFORE === "1" ? "before" : "after"}-results.json` }]],
  use: { ...config.use, baseURL: `${origin}/dashboard/` },
  webServer: { ...config.webServer, command: `npm --prefix ${root}/frontend run preview -- --host 127.0.0.1 --port 4197 --strictPort`, url: `${origin}/dashboard/`, reuseExistingServer: false },
});
