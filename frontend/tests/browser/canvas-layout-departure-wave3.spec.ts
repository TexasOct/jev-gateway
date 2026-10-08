import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for(const outcome of ["queued","failed"] as const)for(const [locale,width,scheme] of [["en",1280,"light"],["zh-CN",390,"dark"]] as const)test(`layout ${outcome} departure respects write ownership ${locale} ${width} ${scheme}`,async({page,mockApi},info)=>{
  const saved={version:1 as const,nodes:{questions:{x:50,y:80},"rule-0":{x:350,y:80},fallback:{x:350,y:300}},viewport:{x:0,y:0}};mockApi.canvasLayout=structuredClone(saved);
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r});const payloads:unknown[]=[],requests:{method:string;path:string}[]=[],dialogs:string[]=[];
  page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/v1/"))requests.push({method:r.method(),path:p});});page.on("dialog",async d=>{dialogs.push(d.message());await d.dismiss();});
  await page.route("**/v1/dashboard/canvas-layout",async route=>{if(route.request().method()!=="PUT")return route.fallback();payloads.push(route.request().postDataJSON());if(payloads.length===1){await gate;if(outcome==="failed")return route.fulfill({status:503,json:{error:{message:"Owned layout write failed"}}});}return route.fallback();});
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");if(locale==="zh-CN"){await page.getByRole("button",{name:en.settings,exact:true}).click();await page.locator("[data-settings-language]").selectOption(locale);}const words=locale==="en"?en:zhCN;
  await page.getByRole("button",{name:words.strategyEditor,exact:true}).click();await expect(page.getByRole("button",{name:words.canvasAddNode,exact:true})).toBeEnabled();
  const node=page.locator('[data-canvas-node="questions"]');await node.focus();await page.keyboard.press("Alt+ArrowRight");await expect.poll(()=>payloads.length).toBe(1);
  if(outcome==="queued")await page.keyboard.press("Alt+ArrowRight");
  const settings=page.getByRole("button",{name:words.settings,exact:true});await expect(settings).toBeDisabled();await settings.press("Enter");await expect(page.locator("[data-settings-language]")).toHaveCount(0);expect(dialogs).toEqual([]);expect(mockApi.canvasLayout).toEqual(saved);
  await writeFile(info.outputPath("held-layout.json"),JSON.stringify({outcome,payloads,requests,dialogs,truth:mockApi.canvasLayout},null,2));await page.screenshot({path:info.outputPath("held-layout.png")});
  release();if(outcome==="failed")await expect(page.getByText(/Owned layout write failed/)).toBeVisible();else await expect.poll(()=>payloads.length).toBe(2);
  await expect(settings).toBeEnabled();const confirmed=structuredClone(mockApi.canvasLayout),before=requests.filter(r=>r.method!=="GET");expect(confirmed?.nodes.questions).toEqual({x:outcome==="queued"?90:50,y:80});
  await writeFile(info.outputPath("settled-before-departure.json"),JSON.stringify({outcome,payloads,requests,dialogs,truth:confirmed},null,2));await page.screenshot({path:info.outputPath("settled-before-departure.png")});
  await settings.focus();await page.keyboard.press("Enter");await expect(page.locator("[data-settings-language]")).toBeVisible();expect(dialogs).toEqual([]);expect(requests.filter(r=>r.method!=="GET")).toEqual(before);
  await page.getByRole("button",{name:words.strategyEditor,exact:true}).click();await expect(page.getByRole("button",{name:words.canvasAddNode,exact:true})).toBeEnabled();expect(mockApi.canvasLayout?.nodes).toEqual(confirmed!.nodes);expect(requests.filter(r=>r.method!=="GET")).toEqual(before);expect(before.every(r=>r.path==="/v1/dashboard/canvas-layout")).toBe(true);expect(mockApi.appliedConfiguration).toBeUndefined();
  await writeFile(info.outputPath("departed-and-reopened.json"),JSON.stringify({outcome,payloads,requests,dialogs,truth:mockApi.canvasLayout},null,2));
});
