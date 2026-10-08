import { inflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

// Decode Playwright's RGB/RGBA PNG so contrast uses the painted backdrop.
function pixel(png: Buffer, x: number, y: number): number[] {
  let width = 0, height = 0, channels = 0;
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const size = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + size);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); expect(data[12]).toBe(0);
      expect([2, 6]).toContain(data[9]); channels = data[9] === 6 ? 4 : 3;
    }
    if (type === "IDAT") chunks.push(data);
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, image = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]!;
    for (let col = 0; col < stride; col++) {
      const left = col >= channels ? image[row * stride + col - channels]! : 0;
      const up = row ? image[(row - 1) * stride + col]! : 0;
      const corner = row && col >= channels ? image[(row - 1) * stride + col - channels]! : 0;
      const prediction = left + up - corner, a = Math.abs(prediction - left), b = Math.abs(prediction - up), c = Math.abs(prediction - corner);
      const delta = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : a <= b && a <= c ? left : b <= c ? up : corner;
      image[row * stride + col] = (raw[row * (stride + 1) + col + 1]! + delta) & 255;
    }
  }
  return [...image.subarray((y * width + x) * channels, (y * width + x) * channels + 3)];
}

const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);

for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`neighbor Input ink stays behind the card and small text meets 4.5:1 ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { "rule-0": { x: 350, y: 80 }, fallback: { x: 550, y: 80 } } };
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.locator("[data-settings-scheme]").selectOption(scheme);
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const card = page.locator('[data-canvas-node="rule-0"]');
    const box = (await card.boundingBox())!;
    const clip = { x: box.x + 5, y: box.y + 5, width: box.width - 10, height: box.height - 10 };
    const before = await page.screenshot({ path: info.outputPath("neighbor-before.png"), clip });
    const input = page.locator('[data-canvas-input="fallback"]').locator("..").locator("span");
    const geometry = await input.evaluate(el => ({ label: el.getBoundingClientRect().toJSON(), card: document.querySelector('[data-canvas-node="rule-0"]')!.getBoundingClientRect().toJSON() }));
    expect(geometry.label.left).toBeLessThan(geometry.card.right);
    expect(geometry.label.right).toBeGreaterThan(geometry.card.left);
    await input.evaluate(el => (el as HTMLElement).style.visibility = "hidden");
    const after = await page.screenshot({ path: info.outputPath("neighbor-suppressed.png"), clip });
    expect.soft(before.equals(after), "external Input label must not paint over a neighboring card").toBe(true);
    await input.evaluate(el => (el as HTMLElement).style.visibility = "");
    const summary = card.locator(".canvas-node-summary");
    const sample = await summary.evaluate(el => {
      const color = getComputedStyle(el).color;
      const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
      context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return { color, rgb: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3), bounds: el.getBoundingClientRect().toJSON(), background: getComputedStyle(el.closest("button")!).backgroundColor };
    });
    // Suppress all DOM/pseudo-element text, external labels, icons and wire ink.
    // Variables, backgrounds, borders and layout remain unchanged.
    const suppression = await page.addStyleTag({ content: "* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } svg { visibility: hidden !important; }" });
    expect(await summary.evaluate(el => getComputedStyle(el.closest("button")!).backgroundColor)).toBe(sample.background);
    expect(await summary.evaluate(el => el.getBoundingClientRect().toJSON())).toEqual(sample.bounds);
    const backdrop = await page.screenshot({ path: info.outputPath("clean-backdrop.png"), clip: { x: sample.bounds.x, y: sample.bounds.y, width: sample.bounds.width, height: sample.bounds.height } });
    const background = pixel(backdrop, 10, 5), foregroundL = luminance(sample.rgb), backgroundL = luminance(background);
    const contrast = (Math.max(foregroundL, backgroundL) + 0.05) / (Math.min(foregroundL, backgroundL) + 0.05);
    await suppression.evaluate(el => el.parentNode?.removeChild(el));
    await writeFile(info.outputPath("contrast.json"), JSON.stringify({ locale, scheme, geometry, sample, background, contrast }, null, 2));
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([]);
  });
}
