import { expect, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/**
 * Drive the built dashboard against the real gateway in a private scratch
 * directory. The frontend is the bundle an operator ships; the backend is the
 * same ASGI application an operator runs. Only the two outbound listing calls
 * are redirected to a captured fixture, so no real upstream origin is
 * contacted.
 */
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const PYTHON = resolve(REPO_ROOT, ".venv", "bin", "python");
const SERVER = resolve(REPO_ROOT, "tests", "fixtures", "real-gateway", "server.py");
const LISTING = resolve(REPO_ROOT, "tests", "fixtures", "real-gateway", "listing.json");
const BUNDLE = resolve(REPO_ROOT, "jev_gateway", "static", "index.html");
const GATEWAY_KEY = "real-gateway-synthetic";

export type RealBackend = {
  origin: string;
  scratch: string;
  stop: () => Promise<void>;
};

export function repoRoot(): string {
  return REPO_ROOT;
}

/** Hash a shipped bundle file so the record binds the exact built asset. */
export function bundleAssetSha(relative: string): string {
  return createHash("sha256").update(readFileSync(resolve(REPO_ROOT, "jev_gateway", "static", relative))).digest("hex");
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.on("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  child.kill("SIGTERM");
  const finished = await Promise.race([exited.then(() => true), new Promise<boolean>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 5000))]);
  if (!finished) {
    child.kill("SIGKILL");
    await exited;
  }
}

/**
 * Start the real gateway on a private loopback port. A missing interpreter,
 * bundle or fixture is an infrastructure failure the caller must surface,
 * never a silent skip.
 */
export async function startRealBackend(options: { overlay?: boolean } = {}): Promise<RealBackend> {
  if (!existsSync(PYTHON)) throw new Error(`real backend requires the worktree interpreter at ${PYTHON}`);
  if (!existsSync(SERVER)) throw new Error(`missing real-gateway server ${SERVER}`);
  if (!existsSync(LISTING)) throw new Error(`missing synthetic listing fixture ${LISTING}`);
  if (!existsSync(BUNDLE)) throw new Error(`real backend requires a built bundle at ${BUNDLE}; run npm --prefix frontend run build`);
  const port = await freePort();
  const scratch = await mkdtemp(resolve(tmpdir(), `jev-real-backend-${port}-`));
  const argv = ["-u", SERVER, "--port", String(port), "--scratch", scratch, "--listing", LISTING];
  if (options.overlay) argv.push("--overlay");
  const child = spawn(
    PYTHON,
    argv,
    { cwd: REPO_ROOT, env: { ...process.env, PYTHONPATH: REPO_ROOT, PYTHONDONTWRITEBYTECODE: "1" } },
  ) as ChildProcessWithoutNullStreams;
  const backend: RealBackend = { origin: `http://127.0.0.1:${port}`, scratch, stop: async () => { await stopChild(child); } };
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    let buffered = "";
    let settled = false;
    const fail = (message: string) => { if (!settled) { settled = true; rejectReady(new Error(message)); } };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("READY ")) { if (!settled) { settled = true; resolveReady(); } }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => fail(`real backend stderr: ${chunk}`));
    child.on("exit", (code) => fail(`real backend exited early with code ${code}`));
  });
  try {
    await ready;
  } catch (error) {
    await stopChild(child);
    throw error;
  }
  return backend;
}

/** Enter the synthetic management key through the real connection page. */
export async function connectRealDashboard(page: Page, backend: RealBackend): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("jev-dashboard-locale", "en"));
  await page.goto(`${backend.origin}/dashboard/`);
  await page.getByLabel("Gateway API key").fill(GATEWAY_KEY);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
}

export async function gotoSuppliers(page: Page): Promise<void> {
  const nav = page.locator("[data-dashboard-view-nav]").getByRole("button", { name: "Suppliers", exact: true });
  if (await nav.getAttribute("aria-pressed") !== "true") await nav.click();
}

/** Read the server's outbound socket-guard state; proves no real origin was reached. */
export async function guardState(page: Page, backend: RealBackend): Promise<{ blocked: string[]; count: number }> {
  const response = await page.request.get(`${backend.origin}/__guard__`);
  return (await response.json()) as { blocked: string[]; count: number };
}

export const realGatewayKey = GATEWAY_KEY;

export { expect };
