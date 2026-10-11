import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "primitives-popup*.check.ts", workers: 1, retries: 0,
  reporter: "list",
  outputDir: "../../../.trellis/tasks/10-06-shadcn-primitives/research/check-popup-results",
  use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
});
