import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";

test("workflow header reads selected strategy metadata and actual source", async ({ page }) => {
  await page.route("**/v1/routing/strategies", route => route.fulfill({ json: { object: "list", default: "other", data: [
    { name: "other", description: "Unselected strategy", policy: {} },
    { name: configuration.strategy, description: "Routes requests using ordered intent rules.", policy: {} },
  ] } }));
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const header = page.locator(".workspace-heading");
  await expect(header.getByRole("heading")).toHaveText(configuration.strategy);
  await header.locator("summary").click();
  await expect(header).toContainText("Routes requests using ordered intent rules.");
  await expect(header).toContainText(configuration.baseline_source);
  await expect(header).not.toContainText("Unselected strategy");
  await expect(header.getByRole("status")).toHaveText(en.noPendingChanges);
});

test("layout authorization loss shows the root connection form", async ({ page }) => {
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await page.route("**/v1/dashboard/canvas-layout", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({ status: 401, json: { error: { message: "Synthetic expired authorization" } } });
  });
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.locator("#gateway-api-key")).toBeVisible();
  await expect(page.locator(".routing-canvas-scroll")).not.toBeVisible();
});

test("pending layout disables native departure and enables it after settlement", async ({ page, mockApi }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  await page.route("**/v1/dashboard/canvas-layout", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    entered = true;
    const next = route.request().postDataJSON();
    await blocked;
    mockApi.canvasLayout = next;
    await route.fulfill({ json: next });
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Alt+ArrowRight");
  try {
    await expect.poll(() => entered).toBe(true);
    await expect(page.getByRole("button", { name: en.settings, exact: true })).toBeDisabled();
    await expect(page.locator(".routing-canvas-scroll")).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole("button", { name: en.settings, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.settings, exact: true }).click();
  await expect(page.locator("[data-settings-language]")).toBeVisible();
});

test("pending policy disables native departure until apply settles", async ({ page, mockApi }) => {
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  await page.route("**/v1/routing/configuration", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    entered = true;
    await blocked;
    await route.fallback();
  });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await page.locator('[data-canvas-node="fallback"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: en.nodeInspector }).getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await expect(page.locator(".workspace-heading [data-policy-draft]")).toHaveAttribute("data-policy-draft", "pending");
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  try {
    await expect.poll(() => entered).toBe(true);
    await expect(page.getByRole("button", { name: en.settings, exact: true })).toBeDisabled();
    await expect(page.locator(".workspace-heading")).toContainText(en.canvasApplyingPolicy);
    await expect(page.locator(".routing-canvas-scroll")).toBeVisible();
  } finally { release(); }
  await expect(page.getByRole("button", { name: en.settings, exact: true })).toBeEnabled();
  await expect(page.locator(".workspace-heading [data-policy-draft]")).toHaveAttribute("data-policy-draft", "unchanged");
});
