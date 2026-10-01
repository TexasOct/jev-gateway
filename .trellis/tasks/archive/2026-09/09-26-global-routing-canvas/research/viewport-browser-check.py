"""Isolated viewport geometry probe for the routing canvas workspace.

Uses the in-memory browser-harness.py fixture and a unique agent-browser session.
Never contacts configured upstreams or opens the user's gateway.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE / "viewport-artifacts"
ART.mkdir(exist_ok=True)
BROWSER = "/opt/homebrew/bin/agent-browser"
SESSION = "canvas-fixture-" + uuid.uuid4().hex[:10]
EVIDENCE: list[dict] = []
BASE = ""


def command(*args: str) -> str:
    result = subprocess.run([BROWSER, "--session", SESSION, *args], capture_output=True, text=True, timeout=18)
    if result.returncode:
        raise RuntimeError(f"browser {args}: {result.stderr[-600:]} {result.stdout[-300:]}")
    return result.stdout.strip()


def evaluate(js: str):
    raw = command("eval", js)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def record(name: str, value):
    EVIDENCE.append({"case": name, "result": value})
    print(name, json.dumps(value, ensure_ascii=False)[:850], flush=True)


def state():
    with urllib.request.urlopen(BASE + "/__test/state", timeout=5) as response:
        return json.load(response)


def measure():
    return evaluate('''(() => { const b=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),bottom:+r.bottom.toFixed(1),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollTop:e.scrollTop}};return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],header:b('.app-header'),main:b('.strategy-main'),workspace:b('.workflow-workspace'),surface:b('.routing-canvas-scroll'),heading:b('.workspace-chrome'),toolbar:b('.canvas-tools'),drawer:b('.workflow-drawer'),drawerBody:b('.workflow-info'),actions:b('.workflow-toolbar'),inspector:b('.workflow-inspector'),inspectorBody:b('.inspector-body'),node:b('[data-canvas-node="questions"]'),expanded:document.querySelector('.workflow-drawer-heading button')?.getAttribute('aria-expanded'),mode:Array.from(document.querySelectorAll('.canvas-tools button[aria-pressed]')).map(e=>[e.getAttribute('aria-label'),e.getAttribute('aria-pressed')]),alerts:Array.from(document.querySelectorAll('.workflow-workspace [role="alert"]')).map(e=>e.textContent.trim().slice(0,100))}})()''')


def run(*args: str):
    return command(*args)


server = subprocess.Popen([sys.executable, str(HERE / "browser-harness.py")], cwd=HERE.parents[3], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = server.stdout.readline().strip()
    match = re.search(r"http://127\.0\.0\.1:\d+", line)
    if not match:
        raise RuntimeError(f"fixture server unavailable: {line}")
    BASE = match.group()
    run("set", "viewport", "1430", "2511")
    run("open", BASE + "/dashboard")
    run("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    # Probe each dimension in a fresh browser context to reset locale/UI state.
    for width, height in ((1430,2511),(1280,800),(390,844),(320,700)):
        for locale in ("en","zh-CN"):
            if locale == "zh-CN":
                run("eval",'localStorage.setItem("jev-dashboard-locale","zh-CN")')
                run("reload")
                run("wait","250")
            else:
                run("eval",'localStorage.setItem("jev-dashboard-locale","en")')
                run("reload")
                run("wait","250")
            snap=run("snapshot","-i")
            strategy=re.search(r'button "(?:Strategy workflow|策略工作流)"[^\n]*ref=(e\d+)',snap)
            if not strategy: raise RuntimeError("Strategy navigation button absent: "+snap[:500])
            run("click","@"+strategy.group(1))
            run("wait","--fn","!!document.querySelector('.routing-canvas-scroll [data-canvas-node]')")
            run("set", "viewport", str(width), str(height))
            run("wait", "100")
            label=f"{width}x{height}-{locale}"
            record(label+"-collapsed",measure())
            run("screenshot",str(ART/(label+"-collapsed.png")))
            run("eval",'document.querySelector(".workflow-drawer-heading button").click()')
            expanded=measure()
            record(label+"-expanded",expanded)
            run("screenshot",str(ART/(label+"-expanded.png")))
            run("eval",'document.querySelector(".workflow-info").scrollTop=10000')
            record(label+"-drawer-scroll",measure()["drawerBody"])
            run("open",BASE+"/dashboard")
            run("wait","100")
            if locale == "zh-CN":
                run("eval",'localStorage.setItem("jev-dashboard-locale","en")')
                run("reload")
                run("wait","100")
finally:
    (ART/"results.json").write_text(json.dumps(EVIDENCE,ensure_ascii=False,indent=2))
    try: command("close")
    except Exception as exc: print("browser cleanup:",exc,file=sys.stderr)
    server.terminate()
    try: server.wait(timeout=5)
    except subprocess.TimeoutExpired: server.kill();server.wait(timeout=5)
