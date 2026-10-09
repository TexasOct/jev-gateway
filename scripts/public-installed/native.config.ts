import { defineConfig } from "@playwright/test";
import installed from "./installed.config";

export default defineConfig({
  ...installed,
  testDir: "./tests/installed-specific",
  testIgnore: [],
  outputDir: `${process.env.PUBLIC_ACCEPT_BROWSER_EVIDENCE}/native-results`,
  reporter: [["list"], ["json", { outputFile: `${process.env.PUBLIC_ACCEPT_BROWSER_EVIDENCE}/native-report.json` }]],
});
