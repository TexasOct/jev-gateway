"""Fresh native Chromium reproduction for delayed layout failure and wheel capture."""
from __future__ import annotations

import json
import re
import select
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "layout-race-artifacts"
BROWSER = "/opt/homebrew/bin/agent-browser"
SESSION = "layout-race-" + uuid.uuid4().hex[:12]
ORIGIN = ""
EVIDENCE: dict = {"session": SESSION, "scenarios": {}}
BASE = {"version": 1, "nodes": {"questions": {"x": 110, "y": 120}, "rule-0": {"x": 440, "y": 110}}, "viewport": {"x": 0, "y": 0}}


def cli(*args: str) -> str:
    process = subprocess.run([BROWSER, "--session", SESSION, *args], capture_output=True, text=True, timeout=17)
    if process.returncode:
        raise RuntimeError(f"browser {args}: {process.stderr[-350:]} {process.stdout[-150:]}")
    return process.stdout.strip()


def js(expression: str):
    raw = cli("eval", expression)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def request(path: str, data: dict | None = None):
    req = urllib.request.Request(ORIGIN + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=4) as response:
        return json.load(response)


def state():
    return request("/__test/state")


def wait(predicate, label: str, timeout: float = 5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = predicate()
        if value:
            return value
        time.sleep(0.06)
    raise AssertionError(f"timed out: {label}; state={str(state())[:900]}")


def check(value, message: str):
    if not value:
        raise AssertionError(message)


def dom():
    return js("""(() => {const s=document.querySelector('.routing-canvas-scroll');
      const nodes=Object.fromEntries(['questions','rule-0'].map(id=>{const e=document.querySelector('[data-canvas-node="'+id+'"]');
      return [id,{x:parseInt(e.style.left),y:parseInt(e.style.top),dragging:e.dataset.dragging==='true',
      captured:e.hasPointerCapture(window.__testPointerId||-1)}]}));
      return {nodes,scroll:{x:s.scrollLeft,y:s.scrollTop},status:document.querySelector('.workspace-status')?.textContent,
      error:document.querySelector('.canvas-section .notice.warn')?.textContent||null,
      pointerId:window.__testPointerId||null}})()""")


def hit(id: str):
    point = js("""(() => {const e=document.querySelector('[data-canvas-node=%s]');
      const r=e.getBoundingClientRect(),s=document.querySelector('.routing-canvas-scroll').getBoundingClientRect();
      for(const ox of [50,85,115]) for(const oy of [20,34]) {
        const x=Math.round(r.left+ox),y=Math.round(r.top+oy);
        if(x<s.left+5||x>s.right-5||y<s.top+5||y>s.bottom-5) continue;
        if(document.elementFromPoint(x,y)?.closest('[data-canvas-node]')===e)return {x,y};
      }return null})()""" % json.dumps(id))
    check(point, f"no hit-tested point on {id}: {dom()}")
    return point


def drag_start(id: str, dx: int, dy: int):
    p = hit(id)
    cli("mouse", "move", str(p["x"]), str(p["y"]))
    cli("mouse", "down", "left")
    cli("mouse", "move", str(p["x"] + dx), str(p["y"] + dy))
    return p


def release():
    cli("mouse", "up", "left")


def open_strategy():
    cli("set", "viewport", "1280", "800")
    cli("open", ORIGIN + "/dashboard")
    cli("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    js("document.querySelectorAll('.app-header nav button')[1].click()")
    cli("wait", "--fn", "!!document.querySelector('[data-canvas-node=questions]')")
    js("document.querySelector('.workflow-inspector .inspector-heading button')?.click()")
    js("document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-canvas-node]'))window.__testPointerId=e.pointerId},true)")
    cli("wait", "700")


def race():
    record = EVIDENCE["scenarios"]["delayed_failure"] = {}
    request("/__test/control", {"reset": True, "delay_first_put": True, "arm_first_put_failure": True})
    request("/__test/control", {"initial_layout": BASE})
    open_strategy()
    check(dom()["nodes"]["questions"]["x"] == 110, "base layout not loaded")
    request("/__test/control", {"clear_requests": True, "arm_first_put_failure": True})
    record["base"] = dom()
    drag_start("questions", 30, 20)
    release()
    wait(lambda: state()["held_first_put"], "first PUT held")
    record["held"] = {"dom": dom(), "requests": state()["requests"][:2]}
    check(record["held"]["dom"]["nodes"]["questions"]["x"] == 140, "first node did not preview new position")
    p = drag_start("rule-0", 20, 20)
    record["second_active"] = dom()
    check(record["second_active"]["nodes"]["rule-0"]["captured"] and record["second_active"]["nodes"]["rule-0"]["dragging"],
          "second native pointer capture not active")
    check(record["second_active"]["nodes"]["rule-0"]["x"] == 460, "second drag preview absent")
    cli("screenshot", str(OUT / "race-second-active.png"))
    request("/__test/control", {"release_first_put": True})
    wait(lambda: dom()["error"] is not None, "failed PUT notice")
    record["after_failure"] = {"dom": dom(), "requests": state()["requests"][:3]}
    cli("screenshot", str(OUT / "race-after-failure.png"))
    check(record["after_failure"]["dom"]["nodes"]["questions"]["x"] == 110, "Questions not rolled back")
    check(record["after_failure"]["dom"]["nodes"]["rule-0"]["x"] == 440, "Rule preview not rolled back")
    check(not record["after_failure"]["dom"]["nodes"]["rule-0"]["captured"] and not record["after_failure"]["dom"]["nodes"]["rule-0"]["dragging"],
          "active Rule drag retained capture after failed PUT")
    cli("mouse", "move", str(p["x"] + 34), str(p["y"] + 28))
    release()
    cli("wait", "650")
    record["late_input"] = {"dom": dom(), "requests": state()["requests"][:3]}
    check(len(record["late_input"]["requests"]) == 1, "canceled second gesture sent a later PUT")
    check(record["late_input"]["dom"]["nodes"]["rule-0"]["x"] == 440, "canceled gesture changed Rule")
    request("/__test/control", {"delay_first_put": False})
    drag_start("rule-0", 24, 20)
    release()
    wait(lambda: state()["layout"]["nodes"].get("rule-0") == {"x": 464, "y": 130}, "new drag persisted")
    record["retry"] = {"dom": dom(), "layout": state()["layout"], "requests": state()["requests"][:3]}
    cli("screenshot", str(OUT / "race-new-drag.png"))
    check(len(record["retry"]["requests"]) == 2 and record["retry"]["layout"]["nodes"]["questions"] == BASE["nodes"]["questions"],
          "retry did not preserve last saved Questions and a single new Rule PUT")
    check(all(r["method"] == "PUT" and r["path"] == "/v1/dashboard/canvas-layout" and set(r["body"]) == {"version", "nodes", "viewport"} for r in record["retry"]["requests"]),
          "unexpected policy write or layout shape")
    record["result"] = "pass"


def wheel():
    record = EVIDENCE["scenarios"]["wheel_capture"] = {}
    request("/__test/control", {"reset": True, "delay_first_put": False})
    request("/__test/control", {"initial_layout": BASE})
    cli("reload")
    cli("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    js("document.querySelectorAll('.app-header nav button')[1].click()")
    cli("wait", "--fn", "!!document.querySelector('[data-canvas-node=questions]')")
    js("document.querySelector('.workflow-inspector .inspector-heading button')?.click()")
    js("document.addEventListener('pointerdown',e=>{if(e.target.closest('[data-canvas-node]'))window.__testPointerId=e.pointerId},true)")
    js("document.querySelector('.routing-canvas-scroll').scrollTo({left:60,top:55,behavior:'instant'})")
    cli("wait", "700")
    before = dom()
    request("/__test/control", {"clear_requests": True})
    p = drag_start("questions", 24, 15)
    record["before_wheel"] = dom()
    check(record["before_wheel"]["nodes"]["questions"]["captured"], "wheel setup has no pointer capture")
    cli("mouse", "wheel", "100", "100")
    cli("wait", "120")
    record["after_wheel"] = dom()
    check(record["after_wheel"]["scroll"] == record["before_wheel"]["scroll"], "wheel changed scroll during captured drag")
    cli("mouse", "move", str(p["x"] + 30), str(p["y"] + 18))
    record["after_move"] = dom()
    check(record["after_move"]["scroll"] == record["before_wheel"]["scroll"], "scroll drift after pointer move")
    check(record["after_move"]["nodes"]["questions"]["x"] == 140 and record["after_move"]["nodes"]["questions"]["y"] == 138,
          "node did not follow 30x18 CSS pointer displacement")
    cli("screenshot", str(OUT / "wheel-captured-drag.png"))
    release()
    wait(lambda: state()["layout"]["nodes"].get("questions") == {"x": 140, "y": 138}, "drag PUT persisted")
    record["after_up"] = {"dom": dom(), "requests": state()["requests"][:3], "layout": state()["layout"]}
    check(len(record["after_up"]["requests"]) == 1 and record["after_up"]["requests"][0]["path"] == "/v1/dashboard/canvas-layout", "captured drag sent more than one layout PUT")
    # Programmatic scroll remains possible after releasing the pointer lock.
    js("""(() => {const e=document.querySelector('.routing-canvas-scroll');
      e.dispatchEvent(new WheelEvent('wheel',{deltaY:100,deltaX:100,bubbles:true,cancelable:true}));
      e.scrollTop += 100; e.scrollLeft += 100;})()""")
    record["post_release_scroll"] = dom()
    check(record["post_release_scroll"]["scroll"]["y"] > record["after_up"]["dom"]["scroll"]["y"],
          "scroll remained locked after pointer release")
    record["initial_scroll"] = before["scroll"]
    record["result"] = "pass"
    cli("screenshot", str(OUT / "wheel-after-release.png"))


def main():
    global ORIGIN
    OUT.mkdir(exist_ok=True)
    server = subprocess.Popen([sys.executable, str(HERE / "browser-harness.py")], cwd=HERE.parents[3], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        check(select.select([server.stdout], [], [], 5)[0], "harness startup timeout")
        line = server.stdout.readline()
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        check(match, f"harness failed: {line}")
        ORIGIN = match.group()
        race()
        wheel()
    except Exception as exc:
        EVIDENCE["failure"] = {"type": type(exc).__name__, "message": str(exc)[:950]}
        raise
    finally:
        (OUT / "results.json").write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2) + "\n")
        try:
            cli("close")
        except Exception as exc:
            print(f"browser cleanup: {exc}", file=sys.stderr)
        server.terminate()
        try:
            server.wait(timeout=4)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=4)


if __name__ == "__main__":
    main()
