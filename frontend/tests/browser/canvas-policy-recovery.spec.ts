import { writeFile } from "node:fs/promises";
import type { Page, Locator, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import type { RoutingOverlayPayload } from "../../src/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const policyPath = "/v1/routing/configuration";
const layoutPath = "/v1/dashboard/canvas-layout";
type Words = typeof en | typeof zhCN;
const initialLayout = { version: 1 as const, nodes: { "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };

async function activate(page: Page, target: Locator) { await expect(target).toBeEnabled(); await target.focus(); await page.keyboard.press("Enter"); }
async function open(page: Page, locale: "en" | "zh-CN", width: number) {
  await page.setViewportSize({ width, height: 900 }); await page.goto("/dashboard/");
  if (locale !== "en") {
    await activate(page, page.getByRole("button", { name: en.settings, exact: true }));
    await page.locator("[data-settings-language]").selectOption(locale);
  }
  const words = locale === "en" ? en : zhCN;
  await activate(page, page.getByRole("button", { name: words.strategyEditor, exact: true }));
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
  return words;
}
async function edit(page: Page, words: Words, instructions: string) {
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("textbox", { name: words.instructions, exact: true }).fill(instructions);
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.locator('[data-canvas-node="fallback"]'));
  await inspector.getByRole("combobox", { name: words.label, exact: true }).selectOption("quality");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await expect(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeEnabled();
}
async function evidence(page: Page, info: TestInfo, name: string, state: unknown) {
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(state, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

for (const [locale, width] of [["en", 1280], ["zh-CN", 320]] as const) test(`committed policy failed read blocks replay and recovers by GET only ${locale} ${width}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  let puts = 0, recoveryReads = 0, releasePut!: () => void, releaseFirst!: () => void, releaseLast!: () => void;
  const put = new Promise<void>(resolve => { releasePut = resolve; });
  const first = new Promise<void>(resolve => { releaseFirst = resolve; }), last = new Promise<void>(resolve => { releaseLast = resolve; });
  const order: string[] = [];
  page.on("request", request => { const path = new URL(request.url()).pathname; if (path.startsWith(policyPath) || path === layoutPath) order.push(`${request.method()} ${path}`); });
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() === "PUT") { puts++; await put; return route.fallback(); }
    if (route.request().method() !== "GET" || !puts) return route.fallback();
    const read = ++recoveryReads;
    if (read === 1) { await first; return route.fulfill({ status: 503, json: { error: { message: "Saved snapshot read failed once" } } }); }
    if (read === 2) return route.fulfill({ status: 503, json: { error: { message: "Saved snapshot read failed twice" } } });
    await last; return route.fallback();
  });
  const words = await open(page, locale, width);
  const raw = "  Retained instructions\n第二行 / exact raw input  ";
  await edit(page, words, raw);
  const layoutBefore = structuredClone(mockApi.canvasLayout);
  const layoutWritesBefore = order.filter(value => value === `PUT ${layoutPath}`);
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect.poll(() => puts).toBe(1);
  await expect(page.getByRole("button", { name: words.confirmAndSave, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: words.confirmAndSave, exact: true }).press("Enter");
  expect(puts).toBe(1); expect(recoveryReads).toBe(0); expect(mockApi.appliedConfiguration).toBeUndefined();
  releasePut();
  await expect.poll(() => recoveryReads).toBe(1);
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeDisabled();
  expect(puts).toBe(1);
  const committed = structuredClone(mockApi.appliedConfiguration!);
  expect(committed.questions.intent!.instructions).toBe(raw); expect(committed.fallback.label).toBe("quality");
  releaseFirst();
  await expect(page.getByRole("alert")).toContainText("Saved snapshot read failed once");
  await evidence(page, info, "failed-read", { committed, order, puts, layout: mockApi.canvasLayout, reviewDisabled: await page.getByRole("button", { name: words.reviewChanges, exact: true }).isDisabled() });
  await expect.soft(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: words.reviewChanges, exact: true }).press("Enter");
  expect(puts).toBe(1);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  const retry = page.getByRole("button", { name: locale === "en" ? "Retry configuration read" : "重试读取配置", exact: true });
  await expect(retry).toBeEnabled();
  await activate(page, retry);
  await expect(page.getByRole("alert")).toContainText("Saved snapshot read failed twice");
  await expect(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeDisabled();
  expect(puts).toBe(1); expect(recoveryReads).toBe(2);
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(page.getByRole("complementary", { name: words.nodeInspector }).getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(raw);
  await activate(page, retry);
  await expect.poll(() => recoveryReads).toBe(3);
  await expect(retry).toBeDisabled();
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeDisabled();
  expect(puts).toBe(1);
  releaseLast();
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.canvasRedo, exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".workflow-info")).toHaveCount(1);
  await expect(page.locator(".workflow-info")).not.toBeVisible();
  expect(puts).toBe(1); expect(mockApi.appliedConfiguration).toEqual(committed); expect(mockApi.canvasLayout).toEqual(layoutBefore);
  expect(order.filter(value => value.includes(policyPath))).toEqual([`GET ${policyPath}`, `POST ${policyPath}/validate`, `PUT ${policyPath}`, `GET ${policyPath}`, `GET ${policyPath}`, `GET ${policyPath}`]);
  expect(order.filter(value => value === `PUT ${layoutPath}`)).toEqual(layoutWritesBefore);
  await evidence(page, info, "recovered", { committed, order, layout: mockApi.canvasLayout });
});

for (const committed of [false, true]) test(`unknown policy response requires a read before mutation committed=${committed}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` });
  let puts = 0, reads = 0;
  const original = structuredClone(configuration);
  mockApi.appliedConfiguration = original;
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() === "GET") { reads++; return route.fallback(); }
    if (route.request().method() !== "PUT") return route.fallback();
    puts++;
    const payload = route.request().postDataJSON() as RoutingOverlayPayload;
    expect(payload.questions).toBeDefined(); expect(payload.fallback).toBeDefined();
    if (committed) mockApi.appliedConfiguration = { ...original, questions: payload.questions!, fallback: payload.fallback!, rules: payload.rules.map((rule, index) => ({ ...rule, index })), config_hash: "unknown-response-committed" };
    await route.abort("failed");
  });
  const words = await open(page, "en", 1280);
  const raw = "Exact draft whose delivery is unknown";
  await edit(page, words, raw);
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  const retry = page.getByRole("button", { name: "Retry configuration read", exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByText(words.routingWriteUnknown, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeDisabled();
  expect(puts).toBe(1); expect(reads).toBe(1);
  await activate(page, retry);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(retry).toHaveCount(0);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText(committed ? "quality" : "default");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(page.getByRole("complementary", { name: words.nodeInspector }).getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(committed ? raw : original.questions.intent!.instructions);
  expect(puts).toBe(1); expect(reads).toBe(2); expect(mockApi.canvasLayout).toEqual(initialLayout);
  await evidence(page, info, "unknown-resolved", { committed, puts, reads, snapshot: mockApi.appliedConfiguration, requests: mockApi.requests });
});

for (const suspension of ["metadata", "read-401"] as const) test(`committed recovery survives ${suspension} suspension and rejects old completion`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  let puts = 0, reads = 0, metadataCalls = 0, releaseMetadata!: () => void, releaseOld!: () => void;
  const metadata = new Promise<void>(resolve => { releaseMetadata = resolve; }), old = new Promise<void>(resolve => { releaseOld = resolve; });
  if (suspension === "metadata") await page.route("**/v1/routing/strategies", async route => {
    if (++metadataCalls !== 2) return route.fallback();
    await metadata; return route.fulfill({ status: 401, json: { error: { message: "Synthetic recovery suspension" } } });
  });
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() === "PUT") { puts++; return route.fallback(); }
    if (route.request().method() !== "GET" || !puts) return route.fallback();
    if (++reads !== 1) return route.fallback();
    if (suspension === "read-401") return route.fulfill({ status: 401, json: { error: { message: "Committed read lost authorization" } } });
    await old; return route.fulfill({ json: { ...configuration, config_hash: "obsolete-read-must-not-remount" } });
  });
  const words = await open(page, "en", 1280);
  const raw = "Retained across committed-read suspension";
  await edit(page, words, raw);
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect.poll(() => reads).toBe(1);
  const committed = structuredClone(mockApi.appliedConfiguration!);
  if (suspension === "metadata") releaseMetadata();
  await expect(page.locator("#gateway-api-key")).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-canvas-second-wave-key");
  await activate(page, page.getByRole("button", { name: words.connect, exact: true }));
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await activate(page, page.getByRole("button", { name: "Retry configuration read", exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await activate(page, page.locator('[data-canvas-node="fallback"]'));
  await page.getByRole("complementary", { name: words.nodeInspector }).getByRole("combobox", { name: words.label, exact: true }).selectOption("default");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  if (suspension === "metadata") {
    const completed = page.waitForResponse(response => response.url().endsWith(policyPath)); releaseOld(); await completed;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  expect(puts).toBe(1); expect(reads).toBe(2); expect(mockApi.appliedConfiguration).toEqual(committed);
  expect(mockApi.canvasLayout).toEqual(initialLayout);
  await evidence(page, info, "reconnected-recovery", { suspension, committed, puts, reads, requests: mockApi.requests });
});

test("successful apply and reset render fresh snapshots and reset history boundaries", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath }, { method: "DELETE", path: policyPath });
  const words = await open(page, "en", 1280);
  await edit(page, words, "Saved server instruction snapshot");
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await activate(page, page.locator('[data-canvas-node="fallback"]'));
  await page.getByRole("complementary", { name: words.nodeInspector }).getByRole("combobox", { name: words.label, exact: true }).selectOption("default");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.locator(".workflow-toolbar").getByRole("button", { name: words.cancel, exact: true }));
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await activate(page, page.getByRole("button", { name: words.resetBaseline, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmReset, exact: true }));
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.canvasRedo, exact: true })).toBeDisabled();
  expect(mockApi.appliedConfiguration).toBeUndefined(); expect(mockApi.configurationApplied).toBe(false);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([{ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath }, { method: "DELETE", path: policyPath }]);
  expect(mockApi.canvasLayout).toEqual(initialLayout);
  await evidence(page, info, "reset-boundary", { requests: mockApi.requests, layout: mockApi.canvasLayout });
});

test("failed policy apply retains draft and history for explicit retry", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "POST", path: `${policyPath}/validate` }, { method: "PUT", path: policyPath });
  const attempts: unknown[] = [];
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) return route.fulfill({ status: 503, json: { error: { message: "Policy rejected before commit" } } });
    return route.fallback();
  });
  const words = await open(page, "en", 1280);
  const raw = "Recoverable exact instruction input";
  await edit(page, words, raw);
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.getByRole("alert")).toContainText("Policy rejected before commit");
  expect(mockApi.appliedConfiguration).toBeUndefined();
  await activate(page, page.getByRole("button", { name: words.backToEditing, exact: true }));
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(page.getByRole("complementary", { name: words.nodeInspector }).getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(raw);
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.getByRole("button", { name: words.reviewChanges, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmAndSave, exact: true }));
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]); expect(mockApi.appliedConfiguration?.questions.intent!.instructions).toBe(raw);
  expect(mockApi.canvasLayout).toEqual(initialLayout);
  await evidence(page, info, "apply-retry", { attempts, committed: mockApi.appliedConfiguration, requests: mockApi.requests });
});

test("same-hash reset read recovery retains raw draft and the disclosed baseline preview", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout);
  mockApi.allowedWrites.push({ method: "DELETE", path: policyPath });
  let deletes = 0, reads = 0;
  await page.route(`**${policyPath}`, async route => {
    if (route.request().method() === "DELETE") { deletes++; return route.fallback(); }
    if (route.request().method() !== "GET" || !deletes) return route.fallback();
    if (++reads <= 2) return route.fulfill({ status: 503, json: { error: { message: "Baseline read still unavailable" } } });
    return route.fallback();
  });
  const words = await open(page, "en", 1280), raw = "  Pending reset draft\n保留原始输入  ";
  await edit(page, words, raw);
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  await inspector.getByRole("textbox", { name: words.questionName, exact: true }).fill("  待重命名  ");
  await inspector.getByRole("textbox", { name: words.newCriterion, exact: true }).fill("  未完成条件  ");
  await inspector.getByRole("textbox", { name: words.newQuestion, exact: true }).fill("  未完成问题  ");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  await activate(page, page.getByRole("button", { name: words.resetBaseline, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmReset, exact: true }));
  await expect(page.getByRole("alert")).toContainText("Baseline read still unavailable");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  await expect(page.getByRole("button", { name: words.resetBaseline, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeDisabled();
  const retry = page.getByRole("button", { name: words.routingRetryRead, exact: true });
  await activate(page, retry); await expect.poll(() => reads).toBe(2);
  await expect(retry).toBeEnabled();
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(page.getByRole("complementary", { name: words.nodeInspector }).getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(raw);
  await expect(inspector.getByRole("textbox", { name: words.questionName, exact: true })).toHaveValue("  待重命名  ");
  await expect(inspector.getByRole("textbox", { name: words.newCriterion, exact: true })).toHaveValue("  未完成条件  ");
  await expect(inspector.getByRole("textbox", { name: words.newQuestion, exact: true })).toHaveValue("  未完成问题  ");
  await activate(page, page.getByRole("button", { name: words.closeInspector, exact: true }));
  const information = page.getByRole("button", { name: words.canvasInformation, exact: true });
  if (await information.getAttribute("aria-expanded") !== "true") await activate(page, information);
  await expect(page.locator(".workflow-info")).toBeVisible();
  await activate(page, retry);
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.locator(".workflow-info")).toBeVisible();
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: words.canvasRedo, exact: true })).toBeDisabled();
  await expect(page.getByRole("complementary", { name: words.nodeInspector })).toHaveCount(0);
  await expect(page.locator("[data-canvas-node].selected")).toHaveCount(0);
  expect(deletes).toBe(1); expect(reads).toBe(3); expect(mockApi.appliedConfiguration).toBeUndefined();
  expect(mockApi.canvasLayout).toEqual(initialLayout);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([{ method: "DELETE", path: policyPath }]);
  await activate(page, page.locator('[data-canvas-node="questions"]'));
  await expect(inspector.getByRole("textbox", { name: words.questionName, exact: true })).toHaveValue("intent");
  await expect(inspector.getByRole("textbox", { name: words.newCriterion, exact: true })).toHaveValue("");
  await expect(inspector.getByRole("textbox", { name: words.newQuestion, exact: true })).toHaveValue("");
  await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(configuration.questions.intent!.instructions);
  await evidence(page, info, "same-hash-reset", { raw, deletes, reads, requests: mockApi.requests, layout: mockApi.canvasLayout });
});

test("same-hash confirmed baseline read preserves the subsequent root metadata failure", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = structuredClone(initialLayout); mockApi.allowedWrites.push({ method: "DELETE", path: policyPath });
  let deletes = 0;
  await page.route(`**${policyPath}`, async route => { if (route.request().method() === "DELETE") deletes++; return route.fallback(); });
  await page.route("**/v1/routing/strategies", async route => deletes ? route.fulfill({ status: 503, json: { error: { message: "Metadata failed after confirmed baseline read" } } }) : route.fallback());
  const words = await open(page, "en", 1280);
  await activate(page, page.getByRole("button", { name: words.resetBaseline, exact: true }));
  await activate(page, page.getByRole("button", { name: words.confirmReset, exact: true }));
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("Metadata failed after confirmed baseline read");
  await expect(page.getByRole("button", { name: words.routingRetryRead, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  expect(deletes).toBe(1); expect(mockApi.canvasLayout).toEqual(initialLayout);
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([{ method: "DELETE", path: policyPath }]);
  await evidence(page, info, "root-metadata-failure", { deletes, requests: mockApi.requests, layout: mockApi.canvasLayout });
});
