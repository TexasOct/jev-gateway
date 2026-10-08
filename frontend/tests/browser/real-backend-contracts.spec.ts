import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { startRealBackend, connectRealDashboard, gotoSuppliers, bundleAssetSha, repoRoot, guardState, type RealBackend } from "../fixtures/real-backend";

/**
 * X1 / T3 browser leg. This spec drives the built dashboard against the real
 * gateway process, captures the exact request body the model editor emits and
 * records it for the Python mirror to replay through the same owner.
 *
 * The backend runs with a blocked outbound socket guard: only the private
 * loopback server it owns is reachable, and the listing owner is stubbed to a
 * captured fixture. No real upstream origin is contacted. Each test owns its
 * own backend process, scratch directory and SQLite store.
 */
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

type CapturedRequest = { method: string; path: string; status: number; body: unknown };

function captureWrites(page: import("@playwright/test").Page, into: CapturedRequest[], pathname: string): void {
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== pathname) return;
    const request = response.request();
    if (request.method() === "GET") return;
    let body: unknown;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    into.push({ method: request.method(), path: url.pathname, status: response.status(), body });
  });
}

function record(name: string, payload: unknown): void {
  const dir = process.env.JEV_REAL_BACKEND_RECORD_DIR;
  if (!dir) return;
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(payload, null, 2));
}

function readOverlay(backend: RealBackend): string | null {
  try { return readFileSync(resolve(backend.scratch, "routing-overrides.json"), "utf8"); } catch { return null; }
}

/** Count committed config versions in the real SQLite record store. */
function configVersions(backend: RealBackend): number {
  const db = resolve(backend.scratch, "records.sqlite3");
  if (!existsSync(db)) return 0;
  const script = `
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
print(conn.execute("SELECT COUNT(*) FROM config_versions").fetchone()[0])
`;
  const out = execFileSync(resolve(repoRoot(), ".venv", "bin", "python"), ["-c", script, db], { encoding: "utf8" });
  return Number(out.trim());
}

test("X1 real dialog edit emits the exact update_model body the gateway accepts", async ({ page }) => {
  const backend = await startRealBackend();
  try {
    const bodies: CapturedRequest[] = [];
    captureWrites(page, bodies, "/v1/provider-configuration");
    captureWrites(page, bodies, "/v1/provider-configuration/validate");
    await connectRealDashboard(page, backend);
    await gotoSuppliers(page);
    const group = page.locator('[data-provider-models="test-provider"]');
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: "Edit model", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Display name", { exact: true }).fill("Browser edited model");
    await dialog.getByLabel("Input price (USD / million tokens)").fill("4.25");
    await dialog.getByLabel("Vision", { exact: true }).selectOption("true");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => bodies.filter((entry) => entry.status === 200).length).toBeGreaterThanOrEqual(2);
    const validate = bodies.find((entry) => entry.path.endsWith("/validate"));
    const applied = bodies.find((entry) => entry.path === "/v1/provider-configuration" && entry.method === "PUT");
    expect(validate, "validate request captured").toBeTruthy();
    expect(applied, "apply request captured").toBeTruthy();
    expect(applied!.status).toBe(200);
    const validateOps = (validate!.body as { operations: unknown[] }).operations;
    const appliedOps = (applied!.body as { operations: unknown[] }).operations;
    expect(appliedOps).toEqual(validateOps);
    const saved = JSON.parse(readFileSync(resolve(backend.scratch, "models.json"), "utf8")) as {
      revision?: string;
      models: Array<{ cost: Record<string, number>; capabilities: Record<string, boolean>; display_name: string | null }>;
    };
    expect(saved.models[0]!.display_name).toBe("Browser edited model");
    expect(saved.models[0]!.cost.input_per_million).toBe(4.25);
    expect(saved.models[0]!.capabilities.vision).toBe(true);
    // Ask the real gateway to reload the committed file, then read the live view back.
    const reload = await page.request.post(`${backend.origin}/v1/routing/reload`, { headers: { Authorization: `Bearer ${process.env.JEV_REAL_BACKEND_KEY ?? "real-gateway-synthetic"}` } });
    expect(reload.status()).toBe(200);
    const view = await page.request.get(`${backend.origin}/v1/provider-configuration`, { headers: { Authorization: `Bearer ${process.env.JEV_REAL_BACKEND_KEY ?? "real-gateway-synthetic"}` } });
    expect(view.status()).toBe(200);
    const projected = (await view.json()) as { models: Array<{ name: string; display_name: string | null; cost: Record<string, number>; capabilities: Record<string, boolean> }> };
    const model = projected.models.find((entry) => entry.name === "test-provider/vendor/only")!;
    expect(model.display_name).toBe("Browser edited model");
    expect(model.cost.input_per_million).toBe(4.25);
    expect(model.capabilities.vision).toBe(true);
    const guard = await guardState(page, backend);
    expect(guard.count).toBe(0);
    record("x1", {
      requestBody: applied!.body,
      validateStatus: validate!.status,
      applyStatus: applied!.status,
      diskDisplayName: saved.models[0]!.display_name,
      diskInputPrice: saved.models[0]!.cost.input_per_million,
      diskVision: saved.models[0]!.capabilities.vision,
      reloadedDisplayName: model.display_name,
      reloadedInputPrice: model.cost.input_per_million,
      reloadedVision: model.capabilities.vision,
      configVersionCount: configVersions(backend),
      guardBlockedAttempts: guard.blocked,
      bundleIndexSha256: bundleAssetSha("index.html"),
      repoRoot: repoRoot(),
    });
  } finally {
    await backend.stop();
  }
});

test("T3 real dialog edit preserves baseline membership and overlay bytes", async ({ page }) => {
  const backend = await startRealBackend({ overlay: true });
  try {
    const applied: CapturedRequest[] = [];
    captureWrites(page, applied, "/v1/provider-configuration");
    await connectRealDashboard(page, backend);
    await gotoSuppliers(page);
    const group = page.locator('[data-provider-models="test-provider"]');
    await group.getByRole("button", { name: "Edit model", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const overlayBefore = readOverlay(backend);
    expect(overlayBefore, "a real overlay must exist before the edit").not.toBeNull();
    const baselineBefore = readFileSync(resolve(backend.scratch, "models.json"), "utf8");
    await dialog.getByLabel("Input price (USD / million tokens)").fill("7.5");
    await dialog.getByLabel("Vision", { exact: true }).selectOption("true");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => applied.filter((entry) => entry.method === "PUT").length).toBeGreaterThanOrEqual(1);
    const put = applied.filter((entry) => entry.method === "PUT").at(-1)!;
    expect(put.status).toBe(200);
    const overlayAfter = readOverlay(backend);
    expect(overlayAfter).toBe(overlayBefore);
    const baselineAfter = JSON.parse(readFileSync(resolve(backend.scratch, "models.json"), "utf8")) as {
      models: Array<{ cost: Record<string, number>; capabilities: Record<string, boolean>; tags: string[]; priority: number }>;
    };
    expect(baselineAfter.models[0]!.cost.input_per_million).toBe(7.5);
    expect(baselineAfter.models[0]!.capabilities.vision).toBe(true);
    const baselineParsed = JSON.parse(baselineBefore) as { models: Array<{ tags: string[]; priority: number }> };
    expect(baselineAfter.models[0]!.tags).toEqual(baselineParsed.models[0]!.tags);
    expect(baselineAfter.models[0]!.priority).toBe(baselineParsed.models[0]!.priority);
    record("t3", {
      requestBody: put.body,
      overlayPresent: overlayAfter !== null,
      overlaySha256Before: overlayBefore === null ? null : sha(overlayBefore),
      overlaySha256After: overlayAfter === null ? null : sha(overlayAfter),
      baselineTagsUnchanged: baselineAfter.models[0]!.tags,
      savedInputPrice: baselineAfter.models[0]!.cost.input_per_million,
      savedVision: baselineAfter.models[0]!.capabilities.vision,
    });
  } finally {
    await backend.stop();
  }
});
