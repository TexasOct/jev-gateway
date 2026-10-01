"""Native-pointer canvas layout regression against the isolated in-memory harness.

Run only after the parent confirms that the dashboard bundle is ready. Never
starts the real gateway, reads models.json, or contacts an upstream provider.
"""
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
from typing import Any

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE / "viewport-artifacts"
BROWSER = "/opt/homebrew/bin/agent-browser"
SESSION = "node-drag-" + uuid.uuid4().hex[:12]
EVIDENCE: dict = {"session": SESSION, "cases": [], "pointercancel": "unverified: agent-browser mouse exposes no cancel command", "group_drag": "unverified by this focused probe"}
ORIGIN = ""


def cli(*args: str) -> str:
    result = subprocess.run([BROWSER, "--session", SESSION, *args], capture_output=True, text=True, timeout=18)
    if result.returncode:
        raise RuntimeError(f"agent-browser {args}: {result.stderr[-400:]} {result.stdout[-200:]}")
    return result.stdout.strip()


def js(expression: str) -> Any:
    raw = cli("eval", expression)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def state() -> dict:
    with urllib.request.urlopen(ORIGIN + "/__test/state", timeout=5) as response:
        return json.load(response)


def control(**settings) -> None:
    data = json.dumps(settings).encode()
    with urllib.request.urlopen(urllib.request.Request(ORIGIN + "/__test/control", data=data,
            headers={"Content-Type": "application/json"}), timeout=5) as response:
        assert json.load(response)["ok"]


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def node(id: str) -> dict:
    return js("""(() => {const e=document.querySelector('[data-canvas-node=%s]');
      if(!e) return null; const r=e.getBoundingClientRect();
      return {style:{x:parseFloat(e.style.left),y:parseFloat(e.style.top)},
        rect:{x:r.x,y:r.y,w:r.width,h:r.height},
        scroll:{x:document.querySelector('.routing-canvas-scroll').scrollLeft,
                y:document.querySelector('.routing-canvas-scroll').scrollTop}}})()""" % json.dumps(id))


def prepare_hit(id: str) -> dict:
    # Scroll setup may legitimately persist a viewport. Clear its requests before dragging.
    js("document.querySelector('[data-canvas-node=%s]').scrollIntoView({block:'center',inline:'center'})" % json.dumps(id))
    hit = js("""(() => {const e=document.querySelector('[data-canvas-node=%s]'),r=e.getBoundingClientRect();
      const s=document.querySelector('.routing-canvas-scroll').getBoundingClientRect();
      for(const ox of [28,48,80,110]) for(const oy of [23,38,52]) {
        const x=Math.round(r.left+ox*Math.min(1,r.width/190)),y=Math.round(r.top+oy*Math.min(1,r.height/70));
        if(x<s.left+3||x>s.right-3||y<s.top+3||y>s.bottom-3)continue;
        const target=document.elementFromPoint(x,y);
        if(target?.closest('[data-canvas-node]')===e)return {x,y,owner:e.dataset.canvasNode,
          actual:target?.closest('[data-canvas-node]')?.dataset.canvasNode};
      }return null})()""" % json.dumps(id))
    check(isinstance(hit, dict) and hit.get("owner") == hit.get("actual") == id, f"node {id} has no unobstructed hit-tested point")
    # Canvas scroll persistence has a 450 ms debounce; wait until it settles,
    # then clear fixture requests so the drag assertion concerns this gesture.
    cli("wait", "550")
    return hit


def open_strategy(width: int, height: int) -> None:
    cli("open", ORIGIN + "/dashboard")
    cli("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    js("document.querySelectorAll('.app-header nav button')[1].click()")
    cli("wait", "--fn", "!!document.querySelector('.routing-canvas-scroll [data-canvas-node]')")
    cli("set", "viewport", str(width), str(height))
    cli("wait", "--fn", "!!document.querySelector('[data-canvas-node=questions]')")
    js("document.querySelector('.workflow-inspector .inspector-heading button')?.click()")
    js("document.querySelector('.canvas-tools button[aria-pressed]')?.click()")


def set_zoom(zoom: float) -> None:
    # Query the zoom group by structure to avoid locale dependence.
    js("document.querySelector('.canvas-zoom button:nth-of-type(%d)').click()" % (3 if zoom == 1 else 1))
    output = js("document.querySelector('.canvas-zoom output')?.textContent")
    check(output == f"{round(zoom * 100)}%", f"zoom expected {zoom}, got {output}")


def assert_layout_only(before: dict, after: dict, id: str, case: dict) -> None:
    writes = after["requests"]
    check(writes and all(item["path"] == "/v1/dashboard/canvas-layout" and item["method"] == "PUT" for item in writes),
          f"layout-only action made unexpected writes: {[(w['method'],w['path']) for w in writes]}")
    for entry in writes:
        payload = entry["body"]
        check(set(payload) == {"version", "nodes", "viewport"} and payload["version"] == 1, "layout payload has extra keys")
        check(set(payload["viewport"]) == {"x", "y"}, "viewport shape changed")
        check(all(set(value) == {"x", "y"} and all(type(n) is int for n in value.values())
                  for value in payload["nodes"].values()), "node payload contains non-coordinate data")
    check(after["config"] == before["config"], "policy fixture changed after layout gesture")
    pending = js("document.querySelector('.workspace-status')?.textContent")
    check(pending == case["pending_before"], f"draft status changed: {pending}")
    check(js("!document.querySelector('.workflow-drawer .notice h4')"),
          "a review panel unexpectedly appeared")
    case["writes"] = [{"method": item["method"], "path": item["path"], "node": item["body"]["nodes"].get(id)} for item in writes]


def drag(id: str, zoom: float, case: dict) -> None:
    hit = prepare_hit(id)
    start = node(id)
    # Move toward the board interior; both CSS and stored coordinates are checked.
    board = js("(() => {const e=document.querySelector('.routing-canvas-content');return {w:e.offsetWidth,h:e.offsetHeight}})()")
    dx = 28 if start["style"]["x"] < board["w"] - 280 else -28
    dy = 24 if start["style"]["y"] < board["h"] - 130 else -24
    control(clear_requests=True)
    baseline = state()
    case["pending_before"] = js("document.querySelector('.workspace-status')?.textContent")
    cli("mouse", "move", str(hit["x"]), str(hit["y"]))
    cli("mouse", "down", "left")
    try:
        for fraction in (0.5, 1):
            cli("mouse", "move", str(round(hit["x"] + dx * fraction)), str(round(hit["y"] + dy * fraction)))
    finally:
        cli("mouse", "up", "left")
    finish = node(id)
    actual_css = {axis: round(finish["rect"][axis] - start["rect"][axis], 2) for axis in ("x", "y")}
    actual_board = {axis: finish["style"][axis] - start["style"][axis] for axis in ("x", "y")}
    for axis, intended in (("x", dx), ("y", dy)):
        check(abs(actual_css[axis] - intended) <= 3, f"{id} {zoom}: CSS delta {axis}={actual_css[axis]} vs {intended}")
        check(abs(actual_board[axis] * zoom - intended) <= 3, f"{id} {zoom}: board delta {axis}={actual_board[axis]}")
    # Poll the in-memory fixture for an actual request, with a bounded deadline.
    deadline = time.monotonic() + 5
    saved = state()
    while not saved["requests"] and time.monotonic() < deadline:
        time.sleep(0.05)
        saved = state()
    check(bool(saved["requests"]), f"{id}: no layout PUT after drag")
    assert_layout_only(baseline, saved, id, case)
    coords = saved["layout"]["nodes"].get(id)
    check(coords == finish["style"], f"{id}: persisted coords {coords} differ from board {finish['style']}")
    case.update({"hit": hit, "zoom": zoom, "css_delta": actual_css, "board_delta": actual_board,
                 "saved": coords, "viewport": saved["layout"]["viewport"]})
    cli("reload")
    cli("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    js("document.querySelectorAll('.app-header nav button')[1].click()")
    cli("wait", "--fn", "document.querySelector('[data-canvas-node=%s]')?.style.left === %s && document.querySelector('[data-canvas-node=%s]')?.style.top === %s" %
        (id, json.dumps(f"{coords['x']}px"), id, json.dumps(f"{coords['y']}px")))
    restored = node(id)["style"]
    check(restored == coords, f"{id}: reload restored {restored}, expected {coords}")
    case["restored"] = restored


def run_case(width: int, height: int, zoom: float, id: str) -> None:
    control(reset=True)
    open_strategy(width, height)
    set_zoom(zoom)
    case = {"viewport": [width, height], "zoom": zoom, "node": id}
    EVIDENCE["cases"].append(case)
    drag(id, zoom, case)
    cli("screenshot", str(ARTIFACTS / f"drag-{width}-{zoom}-{id}.png"))
    case["result"] = "pass"
    print(f"PASS {width}x{height} zoom={zoom} node={id}", flush=True)


def check_viewport_reload() -> None:
    control(reset=True)
    open_strategy(1280, 800)
    set_zoom(0.75)
    js("document.querySelector('.routing-canvas-scroll').scrollTo({left:400,top:450})")
    cli("wait", "650")
    def board_origin() -> dict:
        return js("""(() => {const e=document.querySelector('.routing-canvas-scroll');
          const r=e.getBoundingClientRect(),c=document.querySelector('.workspace-chrome').getBoundingClientRect();
          const zoom=parseFloat(document.querySelector('.canvas-zoom output').textContent)/100;
          const origin=parseFloat(e.style.getPropertyValue('--canvas-origin-y'))||0;
          const top=Math.max(r.top,c.bottom);
          return {x:e.scrollLeft/zoom,y:(e.scrollTop+(top-r.top)-origin)/zoom,zoom,
            scroll:{x:e.scrollLeft,y:e.scrollTop},origin,freeTop:top};})()""")
    before = board_origin()
    saved = state()["layout"]["viewport"]
    cli("reload")
    cli("wait", "--fn", "!!document.querySelector('.app-header nav button')")
    js("document.querySelectorAll('.app-header nav button')[1].click()")
    cli("wait", "--fn", "!!document.querySelector('.routing-canvas-scroll')")
    cli("wait", "400")
    after = board_origin()
    EVIDENCE["viewport_reload"] = {"before": before, "after": after, "saved": saved}
    for axis in ("x", "y"):
        check(abs(before[axis]-after[axis]) <= 1.5,
              f"canonical viewport reload drift {axis}: {before[axis]} -> {after[axis]}")
    EVIDENCE["viewport_reload"]["result"] = "pass"
    print("PASS nonzero zoomed viewport reload", flush=True)


def check_read_only() -> None:
    control(reset=True, write_available=False)
    open_strategy(1280, 800)
    hit = prepare_hit("questions")
    before = node("questions")["style"]
    control(clear_requests=True)
    cli("mouse", "move", str(hit["x"]), str(hit["y"]))
    cli("mouse", "down", "left")
    try:
        cli("mouse", "move", str(hit["x"] + 28), str(hit["y"] + 24))
    finally:
        cli("mouse", "up", "left")
    check(node("questions")["style"] == before, "read-only gesture moved a node")
    check(not state()["requests"], "read-only gesture sent a mutation")
    EVIDENCE["read_only"] = {"result": "pass", "node_before": before, "requests": 0}
    control(write_available=True)


def main() -> None:
    check(Path(BROWSER).is_file(), f"agent-browser missing: {BROWSER}")
    check((HERE.parents[3] / "jev_gateway/static/index.html").is_file(), "dashboard bundle missing; parent must build first")
    ARTIFACTS.mkdir(exist_ok=True)
    server = subprocess.Popen([sys.executable, str(HERE / "browser-harness.py")],
                              cwd=HERE.parents[3], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        global ORIGIN
        assert server.stdout is not None
        check(bool(select.select([server.stdout], [], [], 5)[0]), "fixture server startup timed out")
        line = server.stdout.readline().strip()
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        assert match is not None, f"fixture server did not start: {line}"
        ORIGIN = match.group()
        for width, height in ((1280, 800), (320, 700)):
            for zoom in (1, 0.75):
                for id in ("questions", "rule-0"):
                    run_case(width, height, zoom, id)
        check_viewport_reload()
        check_read_only()
    except Exception as exc:
        EVIDENCE["failure"] = {"type": type(exc).__name__, "message": str(exc)[:650]}
        if EVIDENCE["cases"]:
            EVIDENCE["cases"][-1].setdefault("result", "fail")
        raise
    finally:
        ARTIFACTS.mkdir(exist_ok=True)
        (ARTIFACTS / "node-drag-results.json").write_text(json.dumps(EVIDENCE, ensure_ascii=False, indent=2) + "\n")
        try:
            cli("close")
        except Exception as exc:
            print(f"browser cleanup: {exc}", file=sys.stderr)
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)


if __name__ == "__main__":
    main()
