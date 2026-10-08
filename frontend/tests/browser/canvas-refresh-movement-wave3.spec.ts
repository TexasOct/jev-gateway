import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

for(const kind of ["node","connection"] as const)for(const [locale,width,scheme] of [["en",1280,"light"],["zh-CN",390,"dark"],["en",320,"dark"],["zh-CN",1280,"light"],["zh-CN",320,"light"]] as const)test(`moved ${kind} is superseded by pre-admitted Root refresh ${locale} ${width} ${scheme}`,async({page,mockApi},info)=>{
  const nodes={questions:{x:50,y:80},"rule-0":{x:350,y:80},fallback:{x:350,y:300}};
  mockApi.canvasLayout={version:1,nodes:structuredClone(nodes),viewport:{x:0,y:0}};
  const requests:{method:string;path:string}[]=[];page.on("request",r=>{const p=new URL(r.url()).pathname;if(p.startsWith("/v1/"))requests.push({method:r.method(),path:p});});
  let hold=false,reads=0,release!:()=>void;const gate=new Promise<void>(r=>{release=r});
  const fresh={...structuredClone(configuration),config_hash:"movement-new-root-hash",fallback:{label:"quality"},questions:{intent:{...configuration.questions.intent!,instructions:"New Root refresh snapshot"}}};
  await page.route("**/v1/routing/configuration",async route=>{if(route.request().method()==="GET"&&hold){reads++;await gate;return route.fulfill({json:fresh});}return route.fallback();});
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");
  if(locale==="zh-CN"){await page.getByRole("button",{name:en.settings,exact:true}).click();await page.locator("[data-settings-language]").selectOption(locale);}
  const words=locale==="en"?en:zhCN;await page.getByRole("button",{name:words.strategyEditor,exact:true}).click();await expect(page.getByRole("button",{name:words.canvasAddNode,exact:true})).toBeEnabled();
  if(width<600){await page.getByRole("button",{name:words.canvasZoomFit,exact:true}).click();await expect(page.getByRole("button",{name:words.settings,exact:true})).toBeEnabled();}
  const target=kind==="node"?page.locator('[data-canvas-node="questions"]'):page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
  if(kind==="connection"&&width<600){await page.locator('[data-canvas-node="rule-0"]').focus();await page.keyboard.press("Enter");await page.getByRole("button",{name:words.closeInspector,exact:true}).click();await page.getByRole("button",{name:words.canvasZoomFit,exact:true}).click();}
  await expect(page.getByRole("button",{name:words.refresh,exact:true})).toBeEnabled();
  const saved=structuredClone(mockApi.canvasLayout),writesBefore=mockApi.canvasWrites?.length??0;
  hold=true;await page.getByRole("button",{name:words.refresh,exact:true}).click();await expect.poll(()=>reads).toBe(1);
  const handle=(await target.elementHandle())!;const point=await target.evaluate(el=>{const b=el.getBoundingClientRect(),x=b.left+(el.hasAttribute("data-canvas-node")?30:b.width/2),y=b.top+(el.hasAttribute("data-canvas-node")?18:b.height/2);return{x,y,hit:el.contains(document.elementFromPoint(x,y))}});expect(point.hit).toBe(true);
  await page.evaluate(()=>{document.addEventListener("pointerdown",e=>Object.assign(window,{movingPointerId:e.pointerId}),{once:true,capture:true});});
  const beforePlacement=await target.evaluate(el=>({left:Number.parseFloat((el as HTMLElement).style.left),top:Number.parseFloat((el as HTMLElement).style.top)}));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y+15,{steps:3});
  const id=await page.evaluate(()=>(window as unknown as {movingPointerId:number}).movingPointerId);expect(await handle.evaluate((el,id)=>el.hasPointerCapture(id),id)).toBe(true);
  let movement:unknown;
  if(kind==="node"){const after=await target.evaluate(el=>({left:Number.parseFloat((el as HTMLElement).style.left),top:Number.parseFloat((el as HTMLElement).style.top)}));expect(after.left-beforePlacement.left).toBeGreaterThan(10);movement={before:beforePlacement,after};}
  else {const preview=page.locator(".canvas-edge-preview");await expect(preview).toHaveCount(1);movement=await preview.evaluate(el=>({cx:el.getAttribute("cx"),cy:el.getAttribute("cy"),bounds:el.getBoundingClientRect().toJSON()}));}
  await writeFile(info.outputPath("moved-before-refresh.json"),JSON.stringify({kind,point,movement,saved,writesBefore,reads,pointerId:id,captured:true,requests},null,2));await page.screenshot({path:info.outputPath("moved-before-refresh.png")});
  mockApi.appliedConfiguration=fresh;release();await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("quality");
  expect(await handle.evaluate((el,id)=>el.hasPointerCapture(id),id)).toBe(false);
  await expect(page.getByRole("button",{name:words.settings,exact:true})).toBeEnabled();
  const writesAfterRefresh=mockApi.canvasWrites?.length??0;
  expect((mockApi.canvasWrites??[]).slice(writesBefore).every(value=>JSON.stringify(value.nodes)===JSON.stringify(saved!.nodes))).toBe(true);
  await page.mouse.move(point.x+80,point.y+45,{steps:3});await page.mouse.up();
  await expect(page.locator("[data-dragging],.canvas-edge-preview")).toHaveCount(0);await expect(page.locator("[data-canvas-node].selected")).toHaveCount(0);await expect(page.getByRole("button",{name:words.canvasUndo,exact:true})).toBeDisabled();
  expect(mockApi.canvasLayout?.nodes).toEqual(saved!.nodes);expect(mockApi.canvasWrites?.length??0).toBe(writesAfterRefresh);expect(mockApi.requests.filter(r=>r.method!=="GET"&&r.path!=="/v1/dashboard/canvas-layout")).toEqual([]);
  await writeFile(info.outputPath("closed-after-late-release.json"),JSON.stringify({kind,saved,current:mockApi.canvasLayout,writesBefore,writesAfterRefresh,reads,pointerId:id,captured:false,requests,truth:fresh},null,2));await page.screenshot({path:info.outputPath("closed-after-late-release.png")});
  await page.locator('[data-canvas-node="questions"]').focus();await page.keyboard.press("Enter");await expect(page.getByRole("complementary",{name:words.nodeInspector}).getByRole("textbox",{name:words.instructions,exact:true})).toHaveValue("New Root refresh snapshot");await page.screenshot({path:info.outputPath("fresh-field-probe.png")});
});
