import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { computedContrast, nativeTabTo, fieldVisibility } from "./canvas-wave3-focus";

const path = "/v1/routing/configuration";
const layout = { version: 1 as const, nodes: { "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };
async function activate(page: Page, target: Locator, focused?: () => Promise<void>) { await expect(target).toBeEnabled(); await target.focus(); if (focused) await focused(); await page.keyboard.press("Enter"); }
async function capture(page: Page, info: TestInfo, stage: string, state: unknown) { await writeFile(info.outputPath(stage+".json"),JSON.stringify(state,null,2));await page.screenshot({path:info.outputPath(stage+".png")}); }
async function open(page: Page, locale: "en"|"zh-CN", width: number, scheme: "light"|"dark") {
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");
  if(locale!=="en") {await activate(page,page.getByRole("button",{name:en.settings,exact:true}));await page.locator("[data-settings-language]").selectOption(locale);}
  const words=locale==="en"?en:zhCN;await activate(page,page.getByRole("button",{name:words.strategyEditor,exact:true}));await expect(page.getByRole("button",{name:words.canvasAddNode,exact:true})).toBeEnabled();return words;
}
for(const [locale,width,scheme,committed] of [["en",1280,"light",true],["zh-CN",320,"dark",true],["en",1280,"dark",false],["en",320,"dark",true],["zh-CN",1280,"light",true]] as const) test(`lost DELETE result retains work and requires GET confirmation ${locale} ${width} ${scheme}${committed?"":" uncommitted"}`,async({page,mockApi},info)=>{
  mockApi.canvasLayout=structuredClone(layout);
  const prior={...structuredClone(configuration),config_hash:"prior-reset-overlay",fallback:{label:"quality"},overlay:{...configuration.overlay,applied:true}};
  mockApi.appliedConfiguration=prior;
  const truth=committed?{...configuration,overlay:{...configuration.overlay,applied:false}}:prior;
  const readbacks:unknown[]=[];page.on("response",async r=>{if(new URL(r.url()).pathname===path&&r.request().method()==="GET"&&r.ok())readbacks.push(await r.json());});
  let deletes=0,reads=0;const requests:{method:string;path:string}[]=[];
  page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/v1/"))requests.push({method:r.method(),path:p});});
  await page.route(`**${path}`,async route=>{
    if(route.request().method()==="DELETE") {deletes++;if(committed){mockApi.appliedConfiguration=undefined;mockApi.configurationApplied=false;mockApi.routingModelOwnership={};}return route.abort("failed");}
    if(route.request().method()==="GET"&&deletes) {if(++reads<=2)return route.fulfill({status:503,json:{error:{message:"Reset snapshot temporarily unreadable"}}});}
    return route.fallback();
  });
  const words=await open(page,locale,width,scheme),raw="  Lost DELETE draft\n原始输入  ";
  await activate(page,page.locator('[data-canvas-node="questions"]'));
  const inspector=page.getByRole("complementary",{name:words.nodeInspector});
  await inspector.getByRole("textbox",{name:words.instructions,exact:true}).fill(raw);
  await inspector.getByRole("textbox",{name:words.newQuestion,exact:true}).fill("  未完成问题  ");
  await activate(page,page.getByRole("button",{name:words.closeInspector,exact:true}));
  await activate(page,page.getByRole("button",{name:words.resetBaseline,exact:true}));await activate(page,page.getByRole("button",{name:words.confirmReset,exact:true}));
  await expect(page.getByRole("alert")).toBeVisible();
  const before=structuredClone(mockApi.canvasLayout),writes=requests.filter(r=>r.method!=="GET");
  const reset=page.getByRole("button",{name:words.resetBaseline,exact:true}).or(page.getByRole("button",{name:words.confirmReset,exact:true}));
  await capture(page,info,"lost-response-before-confirmation",{committed,deletes,reads,requests,before,truth,controls:{resetDisabled:await reset.isDisabled(),settingsDisabled:await page.getByRole("button",{name:words.settings,exact:true}).isDisabled()}});
  await expect.soft(page.getByRole("button",{name:words.settings,exact:true})).toBeDisabled();
  await expect.soft(reset).toBeDisabled();
  const retry=page.getByRole("button",{name:words.routingRetryRead,exact:true});await expect(retry).toBeEnabled();
  const focus=await nativeTabTo(page,retry),contrast=await computedContrast(page.locator(".workspace-status"));
  await capture(page,info,"unknown-reset-reachable-contrast",{focus,contrast,deletes,reads,requests});
  expect(deletes).toBe(1);expect(reads).toBe(0);
  await activate(page,page.locator('[data-canvas-node="questions"]'));await page.locator('[data-canvas-node="questions"]').focus();await page.keyboard.press("Alt+ArrowRight");
  await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue(raw);await expect(inspector.getByRole("textbox",{name:words.newQuestion,exact:true})).toHaveValue("  未完成问题  ");
  for(const [name,stage] of [[words.instructions,"unknown-instructions-visible"],[words.newQuestion,"unknown-new-question-visible"]] as const){const field=inspector.getByRole("textbox",{name,exact:true});const visible=await fieldVisibility(field);expect(visible.disabled).toBe(true);await capture(page,info,stage,{visible,value:await field.inputValue(),deletes,reads,requests});}
  expect(mockApi.canvasLayout).toEqual(before);expect(requests.filter(r=>r.method!=="GET")).toEqual(writes);
  await activate(page,retry);await expect(page.getByRole("alert")).toContainText("Reset snapshot temporarily unreadable");
  await activate(page,retry);await expect.poll(()=>reads).toBe(2);await expect(retry).toBeEnabled();expect(deletes).toBe(1);
  await activate(page,page.getByRole("button",{name:words.closeInspector,exact:true}));
  const information=page.getByRole("button",{name:words.canvasInformation,exact:true});if(await information.getAttribute("aria-expanded")!=="true")await activate(page,information);
  await capture(page,info,"repeated-read-failure",{deletes,reads,requests,layout:mockApi.canvasLayout});
  await activate(page,retry);await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft","unchanged");
  await expect(page.locator(".workflow-info")).toBeVisible();await expect(page.getByRole("button",{name:words.canvasUndo,exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:words.canvasRedo,exact:true})).toBeDisabled();
  await expect(page.locator("[data-canvas-node].selected")).toHaveCount(0);await expect(inspector).toHaveCount(0);
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText(committed?"default":"quality");
  expect(readbacks.at(-1)).toEqual(truth);
  await capture(page,info,"confirmed-closed-inspector",{committed,deletes,reads,requests,truth,readbacks,layout:mockApi.canvasLayout});
  await activate(page,page.locator('[data-canvas-node="questions"]'));
  await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue(configuration.questions.intent!.instructions);await expect(inspector.getByRole("textbox",{name:words.newQuestion,exact:true})).toHaveValue("");
  await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  const restoredInstructions=inspector.getByRole("textbox",{name:words.instructions,exact:true});await nativeTabTo(page,restoredInstructions);const visibleField=await fieldVisibility(restoredInstructions);expect(visibleField.focused).toBe(true);expect(visibleField.disabled).toBe(false);
  expect(deletes).toBe(1);expect(reads).toBe(3);expect(requests.filter(r=>r.method!=="GET")).toEqual(writes);expect(mockApi.canvasLayout?.nodes).toEqual(before!.nodes);
  await capture(page,info,"confirmed-field-probe",{visibleField,committed,deletes,reads,requests,truth,layout:mockApi.canvasLayout});
});

test("known failed DELETE retains draft and permits one legitimate explicit retry",async({page,mockApi},info)=>{
  const chronology: unknown[] = [];
  const started = Date.now();
  const record = (kind: string, detail: unknown) => chronology.push({ elapsedMs: Date.now() - started, kind, detail });
  page.on("request", request => { if (new URL(request.url()).pathname === path) record("request", { method: request.method(), url: request.url() }); });
  page.on("response", response => { if (new URL(response.url()).pathname === path) record("response", { method: response.request().method(), status: response.status(), url: response.url() }); });
  page.on("requestfailed", request => { if (new URL(request.url()).pathname === path) record("requestfailed", { method: request.method(), failure: request.failure() }); });
  page.on("pageerror", error => record("pageerror", error.message));
  const diagnosticState = () => page.evaluate(() => {
    const describe = (element: Element | null) => element ? { tag: element.tagName, text: element.textContent, ariaLabel: element.getAttribute("aria-label"), disabled: element.matches(":disabled"), ariaBusy: element.getAttribute("aria-busy"), outerHTML: element.outerHTML } : null;
    const buttons = [...document.querySelectorAll("button")].filter(element => /reset|Back to editing/i.test(element.textContent ?? "")).map(element => {
      const rect = element.getBoundingClientRect();
      const points = [0.2, 0.5, 0.8].map(fraction => { const x = rect.left + rect.width * fraction, y = rect.top + rect.height / 2, hit = document.elementFromPoint(x, y); return { x, y, exposed: !!hit && element.contains(hit), hit: describe(hit) }; });
      return { element: describe(element), bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, points };
    });
    return { activeElement: describe(document.activeElement), buttons, alerts: [...document.querySelectorAll('[role="alert"]')].map(describe), owner: [...document.querySelectorAll('.workspace-heading, .workspace-status, .workflow-toolbar, [data-connection-page], [aria-busy]')].map(describe), draft: document.querySelector('[data-policy-draft]')?.getAttribute('data-policy-draft') };
  });
  try {
  const requests:{method:string;path:string}[]=[];page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/v1/"))requests.push({method:r.method(),path:p});});
  mockApi.canvasLayout=structuredClone(layout);mockApi.allowedWrites.push({method:"DELETE",path});
  const prior={...structuredClone(configuration),fallback:{label:"quality"},config_hash:"known-failed-reset-prior"};mockApi.appliedConfiguration=prior;
  let deletes=0;await page.route(`**${path}`,async route=>{if(route.request().method()==="DELETE"&&++deletes===1){record("first-delete-handler",{deletes});await route.fulfill({status:503,json:{error:{message:"Reset rejected before commitment"}}});record("first-503-fulfilled",{deletes});return;}return route.fallback();});
  const words=await open(page,"en",1280,"light"),raw="Known reset failure retains this draft";
  await activate(page,page.locator('[data-canvas-node="questions"]'));const inspector=page.getByRole("complementary",{name:words.nodeInspector});await inspector.getByRole("textbox",{name:words.instructions,exact:true}).fill(raw);await activate(page,page.getByRole("button",{name:words.closeInspector,exact:true}));
  await expect(page.getByRole("button",{name:words.canvasUndo,exact:true})).toBeEnabled();
  await activate(page,page.getByRole("button",{name:words.resetBaseline,exact:true}));await activate(page,page.getByRole("button",{name:words.confirmReset,exact:true}), async () => { record("first-confirmation-focused-before-enter",await diagnosticState()); });
  record("first-confirmation-enter-returned",await diagnosticState());
  await expect(page.getByRole("alert")).toContainText("Reset rejected before commitment");await expect(page.getByRole("button",{name:words.routingRetryRead,exact:true})).toHaveCount(0);expect(mockApi.appliedConfiguration).toEqual(prior);expect(deletes).toBe(1);
  await capture(page,info,"known-rejected-reset",{deletes,requests,truth:mockApi.appliedConfiguration});
  await activate(page,page.locator(".workflow-toolbar").getByRole("button",{name:words.backToEditing,exact:true}));
  await expect(page.getByRole("button",{name:words.canvasUndo,exact:true})).toBeEnabled();
  await activate(page,page.locator('[data-canvas-node="questions"]'));await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue(raw);await activate(page,page.getByRole("button",{name:words.closeInspector,exact:true}));
  await page.getByRole("button",{name:words.resetBaseline,exact:true}).click();
  await page.getByRole("button",{name:words.confirmReset,exact:true}).click();
  await capture(page,info,"explicit-retry-native-admission",{deletes,requests,truth:mockApi.appliedConfiguration,focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,name:document.activeElement?.getAttribute("aria-label")}))});
  await expect.poll(()=>deletes).toBe(2);await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft","unchanged");await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.getByRole("button",{name:words.canvasUndo,exact:true})).toBeDisabled();expect(deletes).toBe(2);expect(mockApi.appliedConfiguration).toBeUndefined();expect(mockApi.canvasLayout).toEqual(layout);
  expect(requests.filter(r=>r.method!=="GET")).toEqual([{method:"DELETE",path},{method:"DELETE",path}]);await capture(page,info,"explicit-reset-retry-confirmed",{deletes,requests,truth:{...configuration,overlay:{...configuration.overlay,applied:false}}});
  } finally {
    try { record("finally",await diagnosticState()); } catch (error) { record("finally-capture-error",String(error)); }
    await writeFile(info.outputPath("known-reset-admission-diagnostic.json"),JSON.stringify({chronology,fixture:{configuration:mockApi.appliedConfiguration,layout:mockApi.canvasLayout},status:info.status,errors:info.errors},null,2));
    try { await page.screenshot({path:info.outputPath("known-reset-admission-finally.png")}); } catch (error) { await writeFile(info.outputPath("known-reset-screenshot-error.txt"),String(error)); }
  }
});

test("lost DELETE recovery rejects late 401 after suspension reconnect and a new edit",async({page,mockApi},info)=>{
  const requests:{method:string;path:string}[]=[];page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/v1/"))requests.push({method:r.method(),path:p});});
  mockApi.canvasLayout=structuredClone(layout);mockApi.appliedConfiguration={...structuredClone(configuration),fallback:{label:"quality"},config_hash:"reset-auth-prior"};
  let deletes=0,reads=0,metadataCalls=0,releaseMeta!:()=>void,releaseRead!:()=>void;
  const meta=new Promise<void>(r=>{releaseMeta=r}),old=new Promise<void>(r=>{releaseRead=r});
  await page.route("**/v1/routing/strategies",async route=>{if(++metadataCalls===2){await meta;return route.fulfill({status:401,json:{error:{message:"Current metadata suspends reset owner"}}});}return route.fallback();});
  await page.route(`**${path}`,async route=>{if(route.request().method()==="DELETE"){deletes++;mockApi.appliedConfiguration=undefined;mockApi.configurationApplied=false;mockApi.routingModelOwnership={};return route.abort("failed");}if(route.request().method()==="GET"&&deletes&&++reads===1){await old;return route.fulfill({status:401,json:{error:{message:"Obsolete reset-read 401"}}});}return route.fallback();});
  const words=await open(page,"en",1280,"dark");await activate(page,page.getByRole("button",{name:words.resetBaseline,exact:true}));await activate(page,page.getByRole("button",{name:words.confirmReset,exact:true}));
  await activate(page,page.getByRole("button",{name:words.routingRetryRead,exact:true}));await expect.poll(()=>reads).toBe(1);releaseMeta();await expect(page.locator("#gateway-api-key")).toBeVisible();
  await page.locator("#gateway-api-key").fill("synthetic-wave3-reset-key");await activate(page,page.getByRole("button",{name:words.connect,exact:true}));await expect(page.locator("[data-connection-page]")).toHaveCount(0);
  await activate(page,page.getByRole("button",{name:words.routingRetryRead,exact:true}));
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await activate(page,page.locator('[data-canvas-node="questions"]'));const inspector=page.getByRole("complementary",{name:words.nodeInspector});await inspector.getByRole("textbox",{name:words.instructions,exact:true}).fill("New owned edit after reset reconnect");await activate(page,page.getByRole("button",{name:words.closeInspector,exact:true}));
  const completed=page.waitForResponse(r=>r.url().endsWith(path)&&r.status()===401);releaseRead();await completed;await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  await expect(page.locator("[data-connection-page]")).toHaveCount(0);await expect(page.getByRole("alert")).toHaveCount(0);await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft","pending");
  await activate(page,page.locator('[data-canvas-node="questions"]'));await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue("New owned edit after reset reconnect");
  expect(deletes).toBe(1);expect(reads).toBe(3);expect(mockApi.canvasLayout).toEqual(layout);expect(requests.filter(r=>r.method!=="GET")).toEqual([{method:"DELETE",path}]);await capture(page,info,"new-owner-after-obsolete-401",{deletes,reads,requests,truth:{...configuration,overlay:{...configuration.overlay,applied:false}}});
  await page.locator(".routing-canvas-scroll").focus();await page.keyboard.press("ControlOrMeta+z");await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue(configuration.questions.intent!.instructions);
  await expect(page.getByRole("button",{name:words.settings,exact:true})).toBeEnabled();expect(requests.filter(r=>r.method!=="GET")).toEqual([{method:"DELETE",path},{method:"PUT",path:"/v1/dashboard/canvas-layout"}]);
});
