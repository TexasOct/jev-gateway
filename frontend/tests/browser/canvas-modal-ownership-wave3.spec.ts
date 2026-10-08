import { writeFile } from "node:fs/promises";
import { test, expect } from "../fixtures/provider-browser";
import { installProviderFixture, providerFixture } from "../fixtures/provider-management";
import type { ProviderFixtureState } from "../fixtures/provider-management";
import { configuredModelEdit, openProviderModels } from "../fixtures/open-provider-models";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import { nativeTabTo } from "./canvas-wave3-focus";

for(const stage of ["validation","write"] as const)for(const [locale,width,scheme] of [["en",390,"light"],["zh-CN",320,"dark"],["en",1280,"light"],["en",320,"dark"],["zh-CN",1280,"dark"],["zh-CN",320,"light"]] as const)test(`dirty model ${stage} pending owns requests and focus ${locale} ${width} ${scheme}`,async({page,context},info)=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r});
  const state:ProviderFixtureState={configuration:providerFixture(),writes:[],validations:[],selectors:[]};
  if(stage==="validation")state.delayValidation=()=>gate;else state.delayWrite=()=>gate;
  await installProviderFixture(context,state);await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");
  if(locale==="zh-CN"){await page.getByRole("button",{name:en.settings,exact:true}).click();await page.locator("[data-settings-language]").selectOption(locale);}
  const words=locale==="en"?en:zhCN;await openProviderModels(page,"fixture",{locale});const trigger=configuredModelEdit(page,"fixture","existing",locale);await trigger.click();
  const dialog=page.getByRole("dialog"),raw="Pending model 原始名称";await dialog.getByLabel(words.mmDisplayName,{exact:true}).fill(raw);
  await dialog.getByRole("button",{name:words.mmSave,exact:true}).focus();await page.keyboard.press("Enter");
  await expect.poll(()=>stage==="validation"?state.validations.length:state.writes.length).toBe(1);
  await expect(dialog.getByLabel(words.mmDisplayName,{exact:true})).toBeDisabled();
  const focus=[];
  for(const key of ["Tab","Tab","Shift+Tab","Shift+Tab","Escape","Escape"]){await page.keyboard.press(key);await expect(dialog).toBeVisible();const f=await dialog.evaluate(el=>{const active=document.activeElement as HTMLElement,b=active.getBoundingClientRect();return{inside:el.contains(active),disabled:active.matches(":disabled"),name:active.getAttribute("aria-label")??active.textContent,bounds:b.toJSON(),hit:active.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2))};});expect(f.inside).toBe(true);expect(f.disabled).toBe(false);expect(f.hit).toBe(true);focus.push(f);}
  expect(state.validations).toHaveLength(1);expect(state.writes).toHaveLength(stage==="validation"?0:1);await expect(dialog.getByLabel(words.mmDisplayName,{exact:true})).toHaveValue(raw);
  await writeFile(info.outputPath("dirty-pending.json"),JSON.stringify({stage,focus,validations:state.validations,writes:state.writes},null,2));await page.screenshot({path:info.outputPath("dirty-pending.png")});
  release();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  expect(state.writes).toHaveLength(1);expect(state.validations).toHaveLength(1);expect(state.writes[0]?.operations).toMatchObject([{action:"update_model",model_id:"fixture/existing",model:{upstream_model:"existing",display_name:raw}}]);
  expect(await trigger.evaluate(el=>{const b=el.getBoundingClientRect();return el.matches(":focus-visible")&&el.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2));})).toBe(true);
  const restored=await nativeTabTo(page,trigger);
  await writeFile(info.outputPath("saved-trigger-return.json"),JSON.stringify({restored,validations:state.validations,writes:state.writes,truth:state.configuration},null,2));await page.screenshot({path:info.outputPath("saved-trigger-return.png")});
});

for(const failure of [503,401])for(const [locale,width,scheme] of [["en",1280,"dark"],["zh-CN",320,"light"]] as const)test(`dirty model failure ${failure} retains raw input and requires owned retry${locale==="en"?"":` ${locale} ${width} ${scheme}`}`,async({page,context},info)=>{
  const state:ProviderFixtureState={configuration:providerFixture(),writes:[],validations:[],selectors:[],rejectWrite:failure};await installProviderFixture(context,state);
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:scheme,reducedMotion:"reduce"});await page.goto("/dashboard/");if(locale==="zh-CN"){await page.getByRole("button",{name:en.settings,exact:true}).click();await page.locator("[data-settings-language]").selectOption(locale);}const words=locale==="en"?en:zhCN;await openProviderModels(page,"fixture",{locale});const trigger=configuredModelEdit(page,"fixture","existing",locale);await trigger.click();const dialog=page.getByRole("dialog"),raw="Failed model edit retains manual 名称";
  await dialog.getByLabel(words.mmDisplayName,{exact:true}).fill(raw);await dialog.getByRole("button",{name:words.mmSave,exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(1);
  if(failure===401){await expect(page.locator("#gateway-api-key")).toBeVisible();await expect(dialog).toHaveCount(0);await page.locator("#gateway-api-key").fill("synthetic-wave3-model-key");await page.getByRole("button",{name:words.connect,exact:true}).click();await expect(page.locator("[data-connection-page]")).toHaveCount(0);}
  await expect(dialog.getByRole("button",{name:words.mmSave,exact:true})).toBeEnabled();
  if(failure===503){await expect(dialog.getByRole("alert")).toBeVisible();await expect(page.getByRole("alert")).toHaveCount(1);}
  await expect(dialog).toBeVisible();await expect(dialog.getByLabel(words.mmDisplayName,{exact:true})).toHaveValue(raw);expect(state.writes).toHaveLength(1);expect(state.configuration.models[0]!.display_name).not.toBe(raw);
  for(const key of ["Tab","Shift+Tab"]){await page.keyboard.press(key);expect(await dialog.evaluate(el=>el.contains(document.activeElement)&&!document.activeElement?.matches(":disabled"))).toBe(true);}
  await writeFile(info.outputPath("failed-retained-input.json"),JSON.stringify({failure,validations:state.validations,writes:state.writes,truth:state.configuration},null,2));await page.screenshot({path:info.outputPath("failed-retained-input.png")});
  await nativeTabTo(page,dialog.getByRole("button",{name:words.mmSave,exact:true}));await page.keyboard.press("Enter");await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(state.writes).toHaveLength(2);expect(state.validations).toHaveLength(2);
  const withoutConfirmationTimes=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,value)=>key==="confirmed_at"?undefined:value));
  expect(withoutConfirmationTimes(state.writes[1])).toEqual(withoutConfirmationTimes(state.writes[0]));expect(state.configuration.models[0]!.display_name).toBe(raw);
  const restored=await nativeTabTo(page,trigger);
  await writeFile(info.outputPath("explicit-retry-saved.json"),JSON.stringify({restored,failure,validations:state.validations,writes:state.writes,truth:state.configuration},null,2));await page.screenshot({path:info.outputPath("explicit-retry-saved.png")});
});
