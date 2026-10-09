import { defineConfig } from "@playwright/test";
import original from "./playwright.config";

const origin = process.env.PUBLIC_ACCEPT_ORIGIN;
const output = process.env.PUBLIC_ACCEPT_BROWSER_EVIDENCE;
if (!origin || !output || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error("Installed browser acceptance requires an owned loopback origin and evidence path");
}
const { webServer: _sourceServer, ...inherited } = original;
void _sourceServer;
export default defineConfig({
  ...inherited,
  outputDir: `${output}/results`,
  reporter: [["list"], ["json", { outputFile: `${output}/report.json` }], ["html", { outputFolder: `${output}/html`, open: "never" }]],
  use: { ...original.use, baseURL: `${origin}/dashboard/`, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
