import { test, expect } from "@playwright/test";

test("plain native select consumes Escape in the installed runner", async ({ page, browser }, info) => {
  await info.attach("runner", {
    body: JSON.stringify({ browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent) }),
    contentType: "application/json",
  });
  await page.setContent('<label>Capability<select><option value="null">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>');
  const select = page.getByLabel("Capability");
  await select.click();
  await expect.poll(() => select.evaluate((element) => element.matches(":open"))).toBe(true);
  await page.screenshot({ path: info.outputPath("plain-popup-open.png") });
  await page.keyboard.press("Escape");
  await expect.poll(() => select.evaluate((element) => element.matches(":open"))).toBe(false);
});
