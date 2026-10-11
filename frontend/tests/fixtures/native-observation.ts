import { mkdir, writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";

export async function observeNativeAdmission(page: Page, info: TestInfo, runScenario: () => Promise<void>) {
  if (!process.env.JEV_NATIVE_OBSERVATION) return runScenario();
  const events: unknown[] = [];
  const bodies: Promise<void>[] = [];
  let truncated = false;
  const record = (event: unknown) => {
    if (events.length < 2048) events.push(event);
    else truncated = true;
  };
  await page.addInitScript(() => {
    const buffer: unknown[] = [];
    const owner = window as unknown as { __nativeObservation: { events: unknown[]; truncated: boolean } };
    owner.__nativeObservation = { events: buffer, truncated: false };
    const identify = (element: Element | null) => element ? {
      tag: element.tagName, text: element.textContent?.slice(0, 120), id: element.id,
      role: element.getAttribute("role"), aria: element.getAttribute("aria-label"),
      disabled: element.matches(":disabled"), node: element.getAttribute("data-canvas-node"),
    } : null;
    for (const name of ["focusin", "keydown", "click", "input", "change"]) document.addEventListener(name, event => {
      const target = event.target instanceof Element ? event.target : null;
      const read = {
        kind: name, time: performance.now(), key: event instanceof KeyboardEvent ? event.key : null,
        target: identify(target), active: identify(document.activeElement),
        instructions: document.querySelector<HTMLTextAreaElement>('[role="complementary"] textarea')?.value,
        draft: document.querySelector("[data-policy-draft]")?.getAttribute("data-policy-draft"),
        fallback: document.querySelector('[data-canvas-node="fallback"]')?.textContent,
        questions: document.querySelector('[data-canvas-node="questions"]')?.getAttribute("data-node-state"),
        disabledActions: [...document.querySelectorAll(".workflow-toolbar button:disabled")].map(element => element.textContent),
      };
      if (buffer.length < 2048) buffer.push(read);
      else owner.__nativeObservation.truncated = true;
    }, true);
  });
  page.on("request", request => {
    if (!request.url().includes("/v1/routing/configuration")) return;
    record({ kind: "request", method: request.method(), url: request.url(), body: request.postData(), time: Date.now() });
  });
  page.on("response", response => {
    if (!response.url().includes("/v1/routing/configuration")) return;
    if (bodies.length >= 2048) { truncated = true; return; }
    const done = response.text().then(body => { record({ kind: "response-complete", method: response.request().method(), url: response.url(), status: response.status(), body, time: Date.now() }); }).catch(error => { record({ kind: "response-body-error", error: String(error) }); });
    bodies.push(done);
  });
  try {
    await runScenario();
  } finally {
    await Promise.all(bodies);
    const native = await page.evaluate(() => (window as unknown as { __nativeObservation: unknown }).__nativeObservation).catch(error => ({ collectionError: String(error) }));
    const file = info.outputPath("native-observation.json");
    await mkdir(info.outputDir, { recursive: true });
    await writeFile(file, JSON.stringify({ title: info.title, events, native, truncated }, null, 2));
  }
}
