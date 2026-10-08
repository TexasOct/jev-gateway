import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

export async function fieldVisibility(target:Locator) {
  await target.scrollIntoViewIfNeeded();
  const state=await target.evaluate(el=>{const b=el.getBoundingClientRect();return{bounds:b.toJSON(),disabled:el.matches(":disabled"),focused:el===document.activeElement,hits:[b.left+2,b.left+b.width/2,b.right-2].map(x=>el.contains(document.elementFromPoint(x,b.top+b.height/2))),viewport:{width:innerWidth,height:innerHeight}};});
  expect(state.hits.every(Boolean),JSON.stringify(state)).toBe(true);expect(state.bounds.top).toBeGreaterThanOrEqual(0);expect(state.bounds.bottom).toBeLessThanOrEqual(state.viewport.height);return state;
}

export async function nativeTabTo(page: Page,target: Locator) {
  for(let i=0;i<120&&!(await target.evaluate(el=>el===document.activeElement));i++)await page.keyboard.press("Tab");
  await expect(target).toBeFocused();await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  const focus=await target.evaluate(el=>{const b=el.getBoundingClientRect();return{visible:el.matches(":focus-visible"),bounds:b.toJSON(),hits:[b.left+2,b.left+b.width/2,b.right-2].map(x=>el.contains(document.elementFromPoint(x,b.top+b.height/2)))}});
  expect(focus.visible).toBe(true);expect(focus.hits.every(Boolean),JSON.stringify(focus)).toBe(true);expect(focus.bounds.left).toBeGreaterThanOrEqual(0);expect(focus.bounds.right).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));expect(focus.bounds.top).toBeGreaterThanOrEqual(0);expect(focus.bounds.bottom).toBeLessThanOrEqual(await page.evaluate(()=>innerHeight));return focus;
}

export async function computedContrast(target: Locator,outputPath?:string) {
  const result=await target.evaluate(el=>{
    const c=document.createElement("canvas"),ctx=c.getContext("2d")!;
    const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return[...ctx.getImageData(0,0,1,1).data]};
    const chain:Element[]=[];for(let p:Element|null=el;p;p=p.parentElement)chain.unshift(p);
    let background=[255,255,255];const layers=[];
    for(const p of chain){const style=getComputedStyle(p),rgb=rgba(style.backgroundColor),alpha=rgb[3]!/255;expectOpacity(style.opacity);background=background.map((v,i)=>rgb[i]!*alpha+v*(1-alpha));layers.push({color:style.backgroundColor,image:style.backgroundImage,opacity:style.opacity});}
    function expectOpacity(opacity:string){if(Number(opacity)!==1)throw new Error("Composite opacity needs a painted-pixel oracle");}
    const foregroundRGBA=rgba(getComputedStyle(el).color),alpha=foregroundRGBA[3]!/255;
    return{foregroundRGBA,foreground:background.map((v,i)=>foregroundRGBA[i]!*alpha+v*(1-alpha)),background,layers,bounds:el.getBoundingClientRect().toJSON()};
  });
  const luminance=(rgb:number[])=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i]!,0),a=luminance(result.foreground),b=luminance(result.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  if(outputPath)await writeFile(outputPath,JSON.stringify({...result,ratio},null,2));
  expect(ratio).toBeGreaterThanOrEqual(4.5);return{...result,ratio};
}

export async function paintedContrast(target:Locator,outputPath:string) {
  // Transparent ancestors can sit over SVG or patterned backgrounds. Hide only
  // the ink while sampling the painted backdrop, then restore it before actions.
  const style=await target.evaluate(el=>{const c=document.createElement("canvas"),ctx=c.getContext("2d")!;ctx.fillStyle=getComputedStyle(el).color;ctx.fillRect(0,0,1,1);return{foreground:[...ctx.getImageData(0,0,1,1).data],color:(el as HTMLElement).style.getPropertyValue("color"),priority:(el as HTMLElement).style.getPropertyPriority("color"),bounds:el.getBoundingClientRect().toJSON()};});
  let png:Buffer;
  try {await target.evaluate(el=>(el as HTMLElement).style.setProperty("color","transparent","important"));png=await target.page().screenshot({path:outputPath.replace(/\.json$/,"-masked-backdrop.png"),clip:{x:style.bounds.x,y:style.bounds.y,width:style.bounds.width,height:style.bounds.height},scale:"css"});}
  finally {await target.evaluate((el,s)=>{if(s.color)(el as HTMLElement).style.setProperty("color",s.color,s.priority);else(el as HTMLElement).style.removeProperty("color");},style);}
  let width=0,height=0,channels=0;const chunks:Buffer[]=[];
  for(let at=8;at<png!.length;){const size=png!.readUInt32BE(at),type=png!.toString("ascii",at+4,at+8),data=png!.subarray(at+8,at+8+size);if(type==="IHDR"){width=data.readUInt32BE(0);height=data.readUInt32BE(4);expect(data[8]).toBe(8);expect(data[12]).toBe(0);expect([2,6]).toContain(data[9]);channels=data[9]===6?4:3;}if(type==="IDAT")chunks.push(data);at+=size+12;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,image=Buffer.alloc(height*stride);
  for(let row=0;row<height;row++){const filter=raw[row*(stride+1)]!;expect(filter).toBeLessThanOrEqual(4);for(let col=0;col<stride;col++){const left=col>=channels?image[row*stride+col-channels]!:0,up=row?image[(row-1)*stride+col]!:0,corner=row&&col>=channels?image[(row-1)*stride+col-channels]!:0,prediction=left+up-corner,a=Math.abs(prediction-left),b=Math.abs(prediction-up),c=Math.abs(prediction-corner),delta=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):a<=b&&a<=c?left:b<=c?up:corner;image[row*stride+col]=(raw[row*(stride+1)+col+1]!+delta)&255;}}
  const luminance=(rgb:number[])=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i]!,0),backgrounds=new Map<string,{rgb:number[];count:number;ratio:number}>();
  let minAlpha=255;
  for(let at=0;at<image.length;at+=channels){const rgb=[...image.subarray(at,at+3)],key=rgb.join(",");if(channels===4)minAlpha=Math.min(minAlpha,image[at+3]!);const previous=backgrounds.get(key);if(previous){previous.count++;continue;}const alpha=style.foreground[3]!/255,foreground=rgb.map((v,i)=>style.foreground[i]!*alpha+v*(1-alpha)),a=luminance(foreground),b=luminance(rgb),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);backgrounds.set(key,{rgb,count:1,ratio});}
  expect(minAlpha).toBe(255);
  const colors=[...backgrounds.values()],worst=colors.reduce((a,b)=>a.ratio<b.ratio?a:b),result={method:"CSS foreground over every painted masked-backdrop pixel",foregroundRGBA:style.foreground,bounds:style.bounds,width,height,pixels:width*height,worst,backgrounds:colors};
  await writeFile(outputPath,JSON.stringify(result,null,2));expect(worst.ratio).toBeGreaterThanOrEqual(4.5);return result;
}
