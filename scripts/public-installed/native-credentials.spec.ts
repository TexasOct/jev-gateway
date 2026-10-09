import { test, expect, type Locator } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { startRealBackend, guardState, realGatewayKey } from "../fixtures/real-backend";

async function typeAndDelete(input: Locator, raw: string): Promise<void> {
  await input.focus();
  await input.pressSequentially(raw);
  await expect(input).toHaveValue(raw);
  await expect(input).toBeFocused();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
}

for (const locale of ["en", "zh-CN"] as const) {
  for (const width of [320, 1280]) {
    for (const scheme of ["light", "dark"] as const) {
      for (const kind of ["primary", "aws", "vertex"] as const) {
        test(`installed ${kind} native deletion, pending clearing and failure retention ${locale} ${width} ${scheme}`, async ({ page, context }, info) => {
          const words = locale === "en" ? en : zhCN;
          const oldServer = process.env.PUBLIC_ACCEPT_SERVER;
          process.env.PUBLIC_ACCEPT_SERVER = process.env.PUBLIC_ACCEPT_CREDENTIAL_SERVER;
          const backend = await startRealBackend();
          if (oldServer === undefined) delete process.env.PUBLIC_ACCEPT_SERVER;
          else process.env.PUBLIC_ACCEPT_SERVER = oldServer;
          try {
            await page.setViewportSize({ width, height: 640 });
            await page.emulateMedia({ colorScheme: scheme });
            await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
            await page.goto(`${backend.origin}/dashboard/`);
            await page.getByLabel(words.apiKey, { exact: true }).fill(realGatewayKey);
            await page.getByRole("button", { name: words.connect, exact: true }).click();
            await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
            await page.locator("[data-dashboard-view-nav]").getByRole("button", { name: words.providerModels, exact: true }).click();
            const id = kind === "primary" ? "test-provider" : kind === "aws" ? "installed-aws" : "installed-vertex";
            await page.locator(`[data-provider-edit="${id}"][data-provider-kind="llm"]`).click();
            const labels = kind === "primary" ? [words.pmSecret] : kind === "aws" ? [words.spAWSAccess, words.spAWSSecret, words.spAWSToken] : [words.spVertexJSON];
            const raw = kind === "vertex" ? '{"type":"service_account","private_key":"synthetic-temporary-vertex"}' : "synthetic-temporary-value";
            const originalFiles = Object.fromEntries(await Promise.all(["models.json", ".env", "credentials.json"].map(async (name) => [name, await readFile(resolve(backend.scratch, name), "utf8")])));
            const originalModes = Object.fromEntries(await Promise.all([".env", "credentials.json"].map(async (name) => [name, (await stat(resolve(backend.scratch, name))).mode & 0o777])));
            expect(originalModes["credentials.json"]).toBe(0o600);
            const inputs = labels.map((label) => page.getByLabel(label, { exact: true }));
            for (const input of inputs) {
              await typeAndDelete(input, raw);
              await input.pressSequentially(raw);
            }
            let admitValidation!: () => void;
            const validationAdmitted = new Promise<void>((done) => { admitValidation = done; });
            let releaseValidation!: () => void;
            const heldValidation = new Promise<void>((done) => { releaseValidation = done; });
            let putCount = 0;
            page.on("request", (request) => { if (new URL(request.url()).pathname === "/v1/provider-configuration" && request.method() === "PUT") putCount += 1; });
            await context.route("**/v1/provider-configuration/validate", async (route) => {
              admitValidation();
              await heldValidation;
              await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "invalid_provider_configuration", message: "Synthetic injected validation failure" } }) });
            });
            await page.getByRole("button", { name: words.pmSave, exact: true }).click();
            await validationAdmitted;
            for (const input of inputs) { await expect(input).toHaveValue(""); await expect(input).toBeDisabled(); }
            expect(putCount).toBe(0);
            await expect(page.locator("[data-dashboard-view-nav]").getByRole("button", { name: words.settings, exact: true })).toBeDisabled();
            releaseValidation();
            await expect(page.getByRole("alert").first()).toBeVisible();
            for (const input of inputs) await expect(input).toHaveValue(raw);
            for (const [name, bytes] of Object.entries(originalFiles)) expect(await readFile(resolve(backend.scratch, name), "utf8")).toBe(bytes);
            for (const [name, mode] of Object.entries(originalModes)) expect((await stat(resolve(backend.scratch, name))).mode & 0o777).toBe(mode);
            await context.unroute("**/v1/provider-configuration/validate");
            for (const input of inputs) {
              await input.focus();
              await input.press("ControlOrMeta+A");
              await input.press("Backspace");
              await expect(input).toHaveValue("");
            }
            if (kind === "primary") await expect(page.getByRole("combobox", { name: words.pmCredential, exact: true })).toHaveValue("keep");
            await page.getByLabel(words.pmName, { exact: true }).fill(`Saved ${kind}`);
            let admitPut!: () => void;
            const putAdmitted = new Promise<void>((done) => { admitPut = done; });
            let releasePut!: () => void;
            const heldPut = new Promise<void>((done) => { releasePut = done; });
            let payload: unknown;
            await context.route("**/v1/provider-configuration", async (route) => {
              if (route.request().method() !== "PUT") { await route.continue(); return; }
              payload = route.request().postDataJSON();
              const response = await route.fetch();
              expect(response.status()).toBe(200);
              admitPut();
              await heldPut;
              await route.fulfill({ response });
            });
            await page.getByRole("button", { name: words.pmSave, exact: true }).click();
            await putAdmitted;
            expect(putCount).toBe(1);
            expect(JSON.stringify(payload)).not.toContain(raw);
            for (const input of inputs) { await expect(input).toHaveValue(""); await expect(input).toBeDisabled(); }
            expect(await readFile(resolve(backend.scratch, "credentials.json"), "utf8")).toBe(originalFiles["credentials.json"]);
            expect((await stat(resolve(backend.scratch, "credentials.json"))).mode & 0o777).toBe(0o600);
            expect(await readFile(resolve(backend.scratch, ".env"), "utf8")).toBe(originalFiles[".env"]);
            for (const [name, mode] of Object.entries(originalModes)) expect((await stat(resolve(backend.scratch, name))).mode & 0o777).toBe(mode);
            releasePut();
            await expect(page.getByText(words.pmSaved, { exact: true })).toBeVisible();
            const original = JSON.parse(originalFiles["models.json"]!);
            const actual = JSON.parse(await readFile(resolve(backend.scratch, "models.json"), "utf8"));
            expect(actual.models).toEqual(original.models);
            expect(actual.gateway).toEqual(original.gateway);
            expect(actual.strategies).toEqual(original.strategies);
            expect(actual.storage).toEqual(original.storage);
            for (const profile of original.providers) {
              const saved = actual.providers.find((item: { id: string }) => item.id === profile.id);
              expect(saved).toEqual({ ...profile, ...(profile.id === id ? { display_name: `Saved ${kind}` } : {}) });
            }
            expect(actual).toEqual({ ...original, providers: original.providers.map((profile: { id: string }) => ({ ...profile, ...(profile.id === id ? { display_name: `Saved ${kind}` } : {}) })) });
            const guard = await guardState(page, backend);
            expect(guard).toEqual({ blocked: [], count: 0 });
            const browserState = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookie: document.cookie }));
            expect(JSON.stringify(browserState)).not.toContain(raw);
            await info.attach("actual-put", { body: JSON.stringify(payload, null, 2), contentType: "application/json" });
            await page.screenshot({ path: info.outputPath("installed-native-keep.png"), fullPage: true });
          } finally {
            await backend.stop();
          }
        });
      }
    }
  }
}
