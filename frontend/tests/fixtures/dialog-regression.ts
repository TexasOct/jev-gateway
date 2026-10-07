import { test as base, expect, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { providerFixture } from "./provider-management";
import { configuration } from "./configuration";
import { activity, providers } from "./activity";
import { sessionsPageOne } from "./sessions";
import { policy, strategies } from "./strategies";
import type { ProviderConfiguration, ProviderMutation } from "../../src/shared/api/types";

type Receipt = { method: string; path: string; body: unknown; status?: number; received: number; replied?: number };
type Gate = { method: "POST" | "PUT"; status: number; receipt?: Receipt; release: () => void; wait: Promise<void> };
export type Fixture = { origin: string; data: ProviderConfiguration; receipts: Receipt[]; gate: (method: Gate["method"], status: number) => Gate; bytes: () => Record<string, string> };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// Every product request crosses a fresh loopback HTTP server. This fixture models
// transaction receipts and owned files; it does not run the gateway or an upstream.
export const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ browserName }, provide, info) => {
    if (browserName !== "chromium") throw new Error("Dialog business regression fixture uses Chromium");
    const work = resolve(import.meta.dirname, "../../..");
    if (process.env.JEV_OWNED_ROOT && resolve(process.env.JEV_OWNED_ROOT) !== work) throw new Error("Fixture source root must be the current owned worktree");
    const directory = info.outputPath("http-home");
    if (!resolve(directory).startsWith(`${work}/`)) throw new Error("Fixture output must remain under the owned worktree");
    mkdirSync(directory, { recursive: true });
    const data = providerFixture();
    data.models[0]!.display_name = "Owned Alpha";
    data.models[0]!.tags = ["retained-routing"];
    data.models[0]!.priority = 8;
    data.models[0]!.quality = 0.61;
    const files = ["models.json", ".env", "routing-overrides.json", "dashboard-theme.json", "routing-canvas-layout.json"];
    writeFileSync(join(directory, files[0]!), JSON.stringify(data, null, 2));
    writeFileSync(join(directory, files[1]!), "FIXTURE_KEY=synthetic-fixture-only\n");
    for (const name of files.slice(2)) writeFileSync(join(directory, name), "{}\n");
    const bytes = () => Object.fromEntries(files.map((name) => [name, sha(readFileSync(join(directory, name)))]));
    const receipts: Receipt[] = [];
    const unexpected: string[] = [];
    const gates: Gate[] = [];
    let gate: Gate | undefined;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url!, "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString();
      const receipt: Receipt = { method: request.method!, path: url.pathname, body: raw ? JSON.parse(raw) : null, received: performance.now() };
      receipts.push(receipt);
      const reply = (payload: unknown, status = 200) => {
        receipt.status = status; receipt.replied = performance.now();
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      if (url.pathname.startsWith("/dashboard/")) {
        const prefix = "/dashboard/";
        const asset = url.pathname === prefix ? "index.html" : url.pathname.slice(prefix.length);
        if (!/^(?:index\.html|assets\/[a-zA-Z0-9_.-]+\.(?:js|css|svg|png))$/.test(asset)) { unexpected.push(url.pathname); return reply({}, 404); }
        const buffer = readFileSync(join(work, "jev_gateway/static", asset));
        receipt.status = 200; receipt.replied = performance.now();
        response.writeHead(200, { "Content-Type": asset.endsWith(".js") ? "text/javascript" : asset.endsWith(".css") ? "text/css" : asset.endsWith(".svg") ? "image/svg+xml" : "text/html" });
        return response.end(buffer);
      }
      if (url.pathname === "/v1/setup") return reply({ required: false, local_setup_available: false, revision: data.revision, has_providers: true, has_models: true, routing_ready: true, next_step: "ready" });
      if (request.headers.authorization !== "Bearer synthetic-dashboard-key") return reply({ error: { code: "invalid_api_key" } }, 401);
      const reads: Record<string, unknown> = {
        "/v1/routing/providers/summary": providers, "/v1/routing/activity": activity,
        "/v1/routing/strategies": strategies, "/v1/routing/policy": policy,
        "/v1/routing/sessions": sessionsPageOne,
        "/v1/routing/configuration": { ...configuration, defaults: data.defaults, models: [...configuration.models, ...data.models.map((m) => ({ id: m.name, provider: m.provider, upstream_model: m.upstream_model, priority: m.priority, baseline_priority: m.priority, tags: m.tags, baseline_tags: m.tags }))] },
        "/v1/provider-configuration": data,
        "/v1/dashboard/theme": { version: 1, seed: "#3b66d9" },
        "/v1/dashboard/canvas-layout": { version: 1, nodes: {}, viewport: { x: 0, y: 0 } },
      };
      if (request.method === "GET" && reads[url.pathname] !== undefined) return reply(reads[url.pathname]);
      if ((url.pathname === "/v1/provider-configuration/validate" && request.method === "POST") || (url.pathname === "/v1/provider-configuration" && request.method === "PUT")) {
        const held = gate?.method === request.method ? gate : undefined;
        if (held) { gate = undefined; held.receipt = receipt; await held.wait; if (held.status !== 200) return reply({ error: { code: "synthetic_model_rejection" } }, held.status); }
        const body = receipt.body as ProviderMutation;
        expect(body.expected_revision).toBe(data.revision);
        const candidate = structuredClone(data);
        for (const operation of body.operations) {
          if (operation.action === "update_model") {
            const record = candidate.models.find((m) => m.name === operation.model_id)!;
            expect(operation.model.upstream_model).toBe(record.upstream_model);
            Object.assign(record, operation.model);
          } else if (operation.action === "import") {
            expect(operation.confirmed).toBe(true);
            for (const model of operation.models) candidate.models.push({ ...providerFixture().models[0]!, ...model, name: `${operation.provider_id}/${model.upstream_model}`, provider: operation.provider_id });
          } else throw new Error("Unexpected transaction operation");
        }
        if (request.method === "PUT") {
          candidate.revision = `r${receipts.filter((r) => r.method === "PUT").length + 1}`;
          Object.assign(data, candidate);
          writeFileSync(join(directory, "models.json"), JSON.stringify(data, null, 2));
        }
        return reply({ ...candidate, valid: true, applied: request.method === "PUT", imported: body.operations[0]?.action === "import" ? 1 : 0, skipped: 0 });
      }
      if (request.method === "POST" && url.pathname === "/v1/provider-discovery") return reply({ provider_id: "fixture", supported: true, complete: true, warnings: [], items: [{ upstream_model: "existing", qualified_id: "fixture/existing", imported: data.models.length > 0, metadata: { fields: {}, sources: [], warnings: [] }, metadata_envelope: { version: 1, sources: [] } }] });
      if (request.method === "POST" && url.pathname === "/v1/provider-metadata") return reply({ fetched_at: "2026-10-05T12:00:00Z", stale: false, items: [{ upstream_model: "existing", fields: {}, sources: [], warnings: [], metadata: { version: 1, sources: [] } }] });
      unexpected.push(`${request.method} ${url.pathname}`); return reply({}, 500);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture must own TCP loopback listener");
    try {
      await provide({ origin: `http://127.0.0.1:${address.port}`, data, receipts, bytes, gate(method, status) {
        let release!: () => void;
        const wait = new Promise<void>((done) => { release = done; });
        gate = { method, status, release, wait }; gates.push(gate); return gate;
      } });
    } finally {
      for (const held of gates) held.release();
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
      writeFileSync(info.outputPath("http-receipts.json"), JSON.stringify({ origin: address, pid: process.pid, cwd: process.cwd(), home: process.env.HOME, receipts, unexpected, files: bytes(), listenerClosed: !server.listening }, null, 2));
      expect(unexpected).toEqual([]);
    }
  },
});

export async function state(page: Page) {
  return page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
    return { modalVisible: !!modal?.getClientRects().length, focusInModal: !!modal?.contains(document.activeElement), active: document.activeElement?.outerHTML.slice(0, 400) };
  });
}
