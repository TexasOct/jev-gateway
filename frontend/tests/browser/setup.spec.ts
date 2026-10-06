import { test, expect } from "./fixtures";

for (const locale of ["en", "zh-CN"] as const) {
  for (const width of [1280, 320]) {
    test(`first run can defer connection configuration (${locale}, ${width})`, async ({ page, mockApi }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
      let required = true;
      let submitted: unknown;
      const calls: string[] = [];
      await page.route("**/v1/setup", async (route) => {
        const request = route.request();
        calls.push(request.method());
        if (request.method() === "POST") {
          submitted = request.postDataJSON();
          required = false;
        } else if (!required) {
          expect(request.headers().authorization).toBe("Bearer fixture-management-key");
        }
        await route.fulfill({ json: { required, local_setup_available: true, revision: "empty-revision", has_providers: false, has_models: false, routing_ready: false, next_step: required ? "gateway_key" : "provider" } });
      });
      await page.goto("/dashboard/");
      await expect(page.locator("#setup-key")).toBeVisible();
      expect(mockApi.requests).toEqual([]);
      await page.locator("#setup-key").fill("fixture-management-key");
      await page.getByRole("button", { name: locale === "en" ? "Initialize gateway access key" : "初始化网关访问密钥" }).click();
      await expect(page.locator("#setup-key")).toHaveCount(0);
      expect(submitted).toEqual({ expected_revision: "empty-revision", api_key: "fixture-management-key" });
      await expect.poll(() => calls).toEqual(["GET", "POST", "GET"]);
      const progress = page.getByLabel(locale === "en" ? "Connection setup" : "连接配置进度", { exact: true });
      await expect(progress).toBeVisible();
      await progress.getByRole("button", { name: locale === "en" ? "Suppliers" : "供应商", exact: true }).click();
      await expect(page.getByRole("button", { name: locale === "en" ? "Add provider" : "添加供应商", exact: true })).toBeVisible();
      await progress.getByRole("button", { name: locale === "en" ? "Go to monitoring; configure later" : "进入监控，稍后配置" }).click();
      await expect(progress).toHaveCount(0);
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["jev-dashboard-locale"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

for (const key of ["fixture-existing-key", "  fixture-existing-key  "]) {
test(`initialized gateway reconnects through the existing Connect form (${key.startsWith(" ") ? "surrounding spaces" : "plain"})`, async ({ page }) => {
  const expectedAuthorization = "Bearer fixture-existing-key";
  let authenticatedReads = 0;
  await page.route("**/v1/setup", async (route) => {
    if (route.request().headers().authorization !== expectedAuthorization) {
      return route.fulfill({ status: 401, json: { error: { message: "Authentication required" } } });
    }
    authenticatedReads++;
    await route.fulfill({ json: { required: false, local_setup_available: false, revision: "existing", has_providers: true, has_models: true, routing_ready: true, next_step: "ready" } });
  });
  await page.goto("/dashboard/");
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.locator("#setup-key")).toHaveCount(0);
  await page.getByLabel("Gateway API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  expect(authenticatedReads).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  await page.getByLabel("Gateway API key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
  expect(authenticatedReads).toBe(2);
});
}

test("remote first run offers CLI guidance and retry", async ({ page }) => {
  await page.route("**/v1/setup", (route) => route.fulfill({ json: { required: true, local_setup_available: false, revision: "remote", has_providers: false, has_models: false, routing_ready: false, next_step: "gateway_key" } }));
  await page.goto("/dashboard/");
  await expect(page.getByText(/jev setup --secret-stdin/)).toBeVisible();
  await expect(page.locator("#setup-key")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry setup status" }).click();
  await expect(page.getByText(/jev setup --secret-stdin/)).toBeVisible();
});

for (const locale of ["en", "zh-CN"] as const) {
  test(`invalid new keys stay editable and never submit (${locale})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("jev-dashboard-locale", value), locale);
    let posts = 0;
    await page.route("**/v1/setup", async (route) => {
      if (route.request().method() === "POST") posts++;
      await route.fulfill({ json: { required: true, local_setup_available: true, revision: "fixture", has_providers: false, has_models: false, routing_ready: false, next_step: "gateway_key" } });
    });
    await page.goto("/dashboard/");
    const input = page.locator("#setup-key");
    await expect(input).toHaveAttribute("maxLength", "8192");
    await expect(page.locator("#setup-key-note")).toContainText("ASCII");
    for (const key of [" fixture-management-key", "fixture-management-key ", "fixture interior key", "fixture-管理-management", "fixture-management-\tkey"]) {
      await input.fill(key);
      await page.getByRole("button", { name: locale === "en" ? "Initialize gateway access key" : "初始化网关访问密钥" }).click();
      await expect(page.getByRole("alert")).toContainText(locale === "en" ? "without spaces or other whitespace" : "不能包含空格或其他空白字符");
      await expect(input).toHaveValue(key);
      expect(posts).toBe(0);
    }
  });
}

test("setup preserves printable symbols through the POST and canonical Bearer header", async ({ page }) => {
  const key = "fixture-symbols-!~";
  let required = true;
  let posts = 0;
  let authenticatedReads = 0;
  await page.route("**/v1/setup", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().api_key).toBe(key);
      posts++;
      required = false;
    } else if (!required) {
      expect(route.request().headers().authorization).toBe(`Bearer ${key}`);
      authenticatedReads++;
    }
    await route.fulfill({ json: { required, local_setup_available: true, revision: "fixture", has_providers: false, has_models: false, routing_ready: false, next_step: required ? "gateway_key" : "provider" } });
  });
  await page.goto("/dashboard/");
  await page.locator("#setup-key").fill(key);
  await page.getByRole("button", { name: "Initialize gateway access key" }).click();
  await expect(page.locator("#setup-key")).toHaveCount(0);
  expect(posts).toBe(1);
  await expect.poll(() => authenticatedReads).toBe(1);
});

test("failed setup retains the submitted draft and retries with the current revision", async ({ page }) => {
  let revision = "initial";
  let attempts = 0;
  await page.route("**/v1/setup", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ expected_revision: revision, api_key: "fixture-management-key" });
      attempts++;
      if (attempts === 1) {
        revision = "refreshed";
        return route.fulfill({ status: 409, json: { error: { message: "Configuration changed. Retry setup status." } } });
      }
    }
    await route.fulfill({ json: { required: attempts < 2, local_setup_available: true, revision, has_providers: false, has_models: false, routing_ready: false, next_step: attempts < 2 ? "gateway_key" : "provider" } });
  });
  await page.goto("/dashboard/");
  await page.locator("#setup-key").fill("fixture-management-key");
  await page.getByRole("button", { name: "Initialize gateway access key" }).click();
  await expect(page.getByRole("alert")).toContainText("Configuration changed");
  await expect(page.locator("#setup-key")).toHaveValue("fixture-management-key");
  await page.getByRole("button", { name: "Retry setup status" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.locator("#setup-key").fill("fixture-management-key");
  await page.getByRole("button", { name: "Initialize gateway access key" }).click();
  await expect(page.locator("#setup-key")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("setup admission waits for authenticated reads and shares the connection submission guard", async ({ page }) => {
  let required = true;
  let posts = 0;
  let releaseTheme!: () => void;
  const themeReady = new Promise<void>((resolve) => { releaseTheme = resolve; });
  await page.route("**/v1/setup", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      required = false;
    }
    await route.fulfill({ json: { required, local_setup_available: true, revision: "fixture", has_providers: false, has_models: false, routing_ready: false, next_step: required ? "gateway_key" : "provider" } });
  });
  await page.route("**/v1/dashboard/theme", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer fixture-management-key");
    await themeReady;
    await route.fallback();
  });
  await page.goto("/dashboard/");
  await page.locator("#setup-key").fill("fixture-management-key");
  await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.getByRole("heading", { name: "Connect", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gateway API key", { exact: true })).toBeDisabled();
  await expect(page.locator("[data-dashboard-view-nav], .app-header")).toHaveCount(0);
  await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  expect(posts).toBe(1);
  releaseTheme();
  await expect(page.locator("[data-dashboard-view-nav]")).toBeVisible();
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);
});
