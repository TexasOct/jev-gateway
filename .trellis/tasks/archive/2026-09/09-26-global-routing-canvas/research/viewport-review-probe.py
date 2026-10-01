"""Focused pre-fix browser reproduction of reviewer findings, isolated fixture only."""
import json
import re
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

HERE=Path(__file__).resolve().parent
OUT=HERE/'viewport-artifacts'
OUT.mkdir(exist_ok=True)
SESSION='canvas-review-'+uuid.uuid4().hex[:9]
BROWSER='/opt/homebrew/bin/agent-browser'
server=subprocess.Popen([sys.executable,str(HERE/'browser-harness.py')],cwd=HERE.parents[3],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
results={}

def cmd(*args):
    p=subprocess.run([BROWSER,'--session',SESSION,*args],capture_output=True,text=True,timeout=18)
    if p.returncode: raise RuntimeError(f'{args}: {p.stderr[-500:]} {p.stdout[-200:]}')
    return p.stdout.strip()

def ev(js):
    raw=cmd('eval',js)
    try:return json.loads(raw)
    except json.JSONDecodeError:return raw

def measure():
    return ev('''(() => {const b=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,visibility:getComputedStyle(e).visibility,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}};return {viewport:[innerWidth,innerHeight],workspace:b('.workflow-workspace'),heading:b('.workspace-chrome'),toolbar:b('.canvas-tools'),drawer:b('.workflow-drawer'),surface:b('.routing-canvas-scroll'),board:b('.routing-canvas-board'),content:b('.routing-canvas-content'),node:b('[data-canvas-node="questions"]'),inspector:b('.workflow-inspector'),inspectorBody:b('.inspector-body'),focus:document.activeElement?.outerHTML.slice(0,160)}})()''')

try:
    origin=re.search(r'http://127\.0\.0\.1:\d+',server.stdout.readline()).group()
    def current():
        with urllib.request.urlopen(origin+'/__test/state',timeout=5) as r:return json.load(r)
    def open_strategy(width,height):
        cmd('set','viewport',str(width),str(height))
        cmd('open',origin+'/dashboard')
        cmd('wait','--fn','!!document.querySelector(".app-header nav button")')
        ev('document.querySelectorAll(".app-header nav button")[1].click()')
        cmd('wait','--fn','!!document.querySelector(".routing-canvas-scroll [data-canvas-node]")')
    open_strategy(320,700)
    results['320-initial']=measure()
    ev('document.querySelector(".workflow-drawer-heading button").click()')
    results['320-expanded']=measure()
    ev('document.querySelector(".workflow-drawer-heading button").click()')
    ev('document.querySelector("[data-canvas-node=questions]").click()')
    results['320-question-inspector']=measure()
    cmd('screenshot',str(OUT/'review-320-inspector.png'))
    ev('document.querySelector("[data-canvas-node=\'rule-6\']")?.click()')
    results['320-rule6-inspector']=measure()
    cmd('screenshot',str(OUT/'review-320-rule6.png'))
    # select a field if inspector is present, then resize and expand drawer
    ev('document.querySelector(".workflow-inspector input, .workflow-inspector select")?.focus()')
    results['focus-before-resize']=measure()
    cmd('set','viewport','390','844')
    results['focus-after-resize']=measure()
    ev('document.querySelector(".workflow-drawer-heading button").click()')
    results['focus-after-drawer']=measure()
    cmd('set','viewport','1280','800')
    cmd('open',origin+'/dashboard')
    cmd('wait','--fn','!!document.querySelector(".app-header nav button")')
    ev('document.querySelectorAll(".app-header nav button")[1].click()')
    cmd('wait','--fn','!!document.querySelector(".routing-canvas-scroll [data-canvas-node]")')
    ev('Array.from(document.querySelectorAll(".canvas-tools button")).find(e=>e.getAttribute("aria-label")?.includes("Zoom out"))?.click()')
    results['zoom-half']=measure()
    cmd('screenshot',str(OUT/'review-zoom-half.png'))
    # Drag a verified unobstructed node at zoom 0.5 and compare persisted/reloaded canvas positions.
    hit=ev('''(() => {for(const e of document.querySelectorAll('[data-canvas-node]')){const r=e.getBoundingClientRect(),x=Math.round(r.left+30),y=Math.round(r.top+25);if(x>0&&x<innerWidth&&y>0&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('[data-canvas-node]')===e)return {id:e.dataset.canvasNode,x,y,before:{x:r.x,y:r.y}}}return null})()''')
    results['drag-hit']=hit
    if hit:
        cmd('mouse','move',str(hit['x']),str(hit['y']))
        cmd('mouse','down','left')
        for dx in (20,50,80):cmd('mouse','move',str(hit['x']+dx),str(hit['y']+30))
        cmd('mouse','up','left')
        results['zoom-drag-layout']=current()['layout']
        results['zoom-drag-after']=measure()
        cmd('reload')
        cmd('wait','--fn','!!document.querySelector(".app-header nav button")')
        ev('document.querySelectorAll(".app-header nav button")[1].click()')
        cmd('wait','--fn','!!document.querySelector(".routing-canvas-scroll [data-canvas-node]")')
        results['zoom-drag-reload']=measure()
        results['zoom-drag-requests']=current()['requests']
finally:
    (OUT/'review-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    try:cmd('close')
    except Exception as e:print('close:',e,file=sys.stderr)
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill();server.wait(timeout=5)
print(json.dumps({k:(v if k in ('drag-hit','zoom-drag-layout') else {'viewport':v['viewport'],'surface':v['surface'],'board':v['board'],'content':v['content'],'inspector':v['inspector'],'focus':v['focus']}) for k,v in results.items() if k!='zoom-drag-requests'},ensure_ascii=False))
