import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { computedContrast, nativeTabTo, paintedContrast, fieldVisibility } from "./canvas-wave3-focus";

for(const [locale,width,scheme,height] of [["en",320,"light",740],["en",390,"dark",740],["zh-CN",320,"dark",740],["zh-CN",390,"light",740],["en",320,"light",900],["en",320,"dark",900],["en",390,"light",900],["en",390,"dark",900],["zh-CN",320,"light",900],["zh-CN",320,"dark",900],["zh-CN",390,"light",900],["zh-CN",390,"dark",900]] as const)test(`narrow read-only inspection and focus remain reachable ${locale} ${width} ${scheme}${height===740?"":" original-height900"}`,async({page,mockApi},info)=>{
  mockApi.appliedConfiguration={...structuredClone(configuration),write_available:false};mockApi.canvasLayout={version:1,nodes:{questions:{x:50,y:80},"rule-0":{x:350,y:80},fallback:{x:350,y:300}},viewport:{x:0,y:0}};
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");if(locale==="zh-CN"){await page.getByRole("button",{name:en.settings,exact:true}).click();await page.locator("[data-settings-language]").selectOption(locale);}const words=locale==="en"?en:zhCN;
  await page.getByRole("button",{name:words.strategyEditor,exact:true}).click();await expect(page.getByRole("button",{name:words.canvasAddNode,exact:true})).toBeDisabled();
  const node=page.locator('[data-canvas-node="questions"]');await expect(node).toBeVisible();await node.focus();await page.keyboard.press("Enter");
  const inspector=page.getByRole("complementary",{name:words.nodeInspector});await expect(inspector.getByRole("textbox",{name:words.instructions,exact:true})).toBeDisabled();
  const field=await fieldVisibility(inspector.getByRole("textbox",{name:words.instructions,exact:true}));expect(field.disabled).toBe(true);await writeFile(info.outputPath("readonly-field-visible.json"),JSON.stringify(field,null,2));await page.screenshot({path:info.outputPath("readonly-field-visible.png")});
  const close=page.getByRole("button",{name:words.closeInspector,exact:true});const focus=await nativeTabTo(page,close);await page.keyboard.press("Enter");await expect(inspector).toHaveCount(0);
  const contrast=await computedContrast(page.locator('[data-canvas-node="questions"] .canvas-node-summary'));
  await page.screenshot({path:info.outputPath("readonly-closed-inspector.png")});
  const restriction=page.getByText(words.routingEditsDisabled,{exact:true});await expect(restriction).toBeVisible();const restrictionContrast=await paintedContrast(restriction,info.outputPath("readonly-restriction-contrast.json"));
  const nav=await nativeTabTo(page,page.getByRole("button",{name:words.settings,exact:true}));await page.keyboard.press("Enter");await expect(page.locator("[data-settings-language]")).toBeVisible();
  expect(mockApi.requests.filter(r=>r.method!=="GET")).toEqual([]);await writeFile(info.outputPath("readonly-focus-contrast.json"),JSON.stringify({locale,width,height,scheme,focus,nav,contrast,restrictionContrast,requests:mockApi.requests},null,2));await page.screenshot({path:info.outputPath("readonly-departed.png")});
});
