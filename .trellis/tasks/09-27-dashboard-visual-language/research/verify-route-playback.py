"""Check the built App with synthetic evidence and a deterministic browser clock.

Run after `npm --prefix frontend run build`. Only this loopback fixture server
is used; no catalog, database, credentials, or live gateway is accessed.
"""
from __future__ import annotations

import json
import mimetypes
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[4]
STATIC = ROOT / "jev_gateway/static"
SESSION = "jev-route-playback-check"
BROWSER = shutil.which("agent-browser")
REQUESTS: list[str] = []
PAGING = {"page_size": 30, "has_more": False, "next_cursor": None}
STORAGE = {"storage": {"enabled": True}, "evidence_available": True}


def evidence(name: str, *, gap: bool = False) -> dict:
    return {
        "request": {"request_id": name, "received_at": 1000, "content_captured": False},
        "decision": None if gap else {"strategy": "synthetic", "label": "fixture", "provider": "fixture", "upstream_model": "model"},
        "upstream_request": {"provider": "fixture", "model": "model", "content_captured": False},
        "outcome": {"ok": True},
    }


CLOCK = """<script>
(() => {
  let time = 0, id = 0;
  const frames = new Map();
  performance.now = () => time;
  window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.traceTestClock = {
    step(ms) { time += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); },
    pending() { return frames.size; },
    capture() { const pending = [...frames.values()]; return () => pending.forEach(callback => callback(time)); },
  };
})();
</script>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        pass

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        REQUESTS.append(self.path)
        payload = None
        if path == "/v1/dashboard/theme":
            payload = {"version": 1, "seed": "#6d7fd7"}
        elif path == "/v1/routing/providers/summary":
            payload = {**STORAGE, "providers": []}
        elif path == "/v1/routing/sessions":
            payload = {**PAGING, **STORAGE, "data": [{"session_id": name} for name in ["synthetic-a", "synthetic-b", "synthetic-empty"]]}
        elif path.startswith("/v1/routing/sessions/") and path.endswith("/requests"):
            name = path.split("/")[-2]
            rows = [evidence("synthetic-1"), evidence("synthetic-2", gap=True)] if name == "synthetic-a" else [evidence("synthetic-b1")] if name == "synthetic-b" else []
            payload = {**PAGING, **STORAGE, "session": {"session_id": name}, "requests": rows}
        elif path == "/v1/routing/configuration":
            payload = {"write_available": False}
        if payload is not None:
            body = json.dumps(payload).encode()
            content_type = "application/json"
        else:
            name = "index.html" if path in ("/dashboard", "/dashboard/") else path.removeprefix("/dashboard/")
            file = (STATIC / name).resolve()
            if not file.is_relative_to(STATIC.resolve()) or not file.is_file():
                self.send_error(404)
                return
            body = file.read_bytes()
            content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
            if name == "index.html":
                body = body.replace(b"<head>", ("<head>" + CLOCK).encode())
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def browser(*args: str) -> str:
    result = subprocess.run([BROWSER, "--session", SESSION, *args], capture_output=True, text=True, timeout=40)
    if result.returncode:
        raise RuntimeError(result.stderr[-1000:] + result.stdout[-1000:])
    return result.stdout.strip()


def evaluate(code: str) -> object:
    return json.loads(browser("eval", code))


# Async React commits are allowed to finish; animation time advances only on step().
SETUP = """
window.traceCheck = {
  wait: () => new Promise(resolve => setTimeout(resolve, 35)),
  assert(ok, name) { if (!ok) throw new Error(name); },
  packet() { const e = document.querySelector('.trace-packet'); return e ? JSON.stringify([e.style.left, e.style.top, e.dataset.traceSegment]) : null; },
  stages() { return [...document.querySelectorAll('.trace-stage')].map(e => e.className).join('|'); },
  click(selector) { document.querySelector(selector).click(); },
};
true
"""

PLAYBACK = """(async () => {
  const c = traceCheck, clock = traceTestClock;
  c.assert(!c.packet(), 'no autoplay');
  const status = document.querySelector('[role=status]');
  let replacements = 0;
  const observer = new MutationObserver(records => records.forEach(record => {
    if ([...record.removedNodes].some(node => node === status || node.contains?.(status))) replacements++;
  }));
  observer.observe(document.querySelector('.route-trace'), {childList: true, subtree: true});
  c.click('.trace-primary'); await c.wait();
  const segments = [];
  for (let i = 0; i < 30; i++) {
    clock.step(100); await c.wait();
    segments.push(Number(document.querySelector('.trace-packet').dataset.traceSegment));
    c.assert(document.querySelector('[role=status]') === status, 'stable status node');
    const packet = document.querySelector('.trace-packet');
    const svg = document.querySelector('.trace-connections');
    const path = svg.querySelectorAll('path')[segments.at(-1)];
    c.assert(!path.classList.contains('trace-segment-gap'), 'only available edge');
    const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength());
    const x = parseFloat(packet.style.left), y = parseFloat(packet.style.top);
    c.assert(x >= Math.min(start.x,end.x)-0.01 && x <= Math.max(start.x,end.x)+0.01 && y >= Math.min(start.y,end.y)-0.01 && y <= Math.max(start.y,end.y)+0.01, 'packet on drawn edge');
  }
  c.assert(JSON.stringify([...new Set(segments)]) === '[0,1,2]', 'sequential edges');
  const before = c.packet(), stages = c.stages(), stale = clock.capture();
  c.click('.trace-controls button:nth-child(2)'); await c.wait();
  c.assert(c.packet() === before && c.stages() === stages, 'pause retains exact frame');
  clock.step(9000); stale(); await c.wait();
  c.assert(c.packet() === before && c.stages() === stages, 'paused stale callback ignored');
  c.click('.trace-primary'); await c.wait(); clock.step(0); await c.wait();
  c.assert(c.packet() === before, 'resume exact position');
  clock.step(100); await c.wait(); c.assert(c.packet() !== before, 'resume advances');
  clock.step(1000); await c.wait();
  c.assert(!c.packet() && document.querySelectorAll('.trace-stage-visited').length === 4, 'complete');
  c.assert(replacements === 0, 'status never remounted'); observer.disconnect();
  c.click('.trace-primary'); await c.wait(); clock.step(300); await c.wait();
  const oldFrame = clock.capture();
  c.click('.request-card:not(.selected) .request-select'); await c.wait(); oldFrame(); await c.wait();
  c.assert(document.querySelector('.route-trace .meta').textContent === 'synthetic-2' && !c.packet() && clock.pending() === 0, 'request selection cancels old replay');
  c.click('.trace-primary'); await c.wait();
  for (let i = 0; i < 10; i++) {
    clock.step(250); await c.wait();
    c.assert(document.querySelector('.trace-packet').dataset.traceSegment === '2', 'missing prefix skipped without gap traversal');
    c.assert(!document.querySelector('.trace-stage-missing.trace-stage-visited,.trace-stage-missing.trace-stage-active'), 'missing stage never reached');
  }
  const resetStale = clock.capture();
  c.click('.trace-controls button:nth-child(3)'); await c.wait();
  c.assert(!c.packet() && !document.querySelector('.trace-stage-visited,.trace-stage-active'), 'reset clears');
  c.click('.trace-primary'); await c.wait(); const restart = c.packet(); resetStale(); await c.wait();
  c.assert(c.packet() === restart && clock.pending() === 1, 'old reset frame cannot advance restarted replay');
  c.click('.trace-controls button:nth-child(3)'); await c.wait();
  return ['sequential drawn edges', 'exact pause/resume', 'stale callbacks', 'stable status DOM', 'request selection', 'missing evidence gaps', 'reset/completion'];
})()"""

REDUCED = """(async () => {
  const c = traceCheck, clock = traceTestClock;
  c.assert(matchMedia('(prefers-reduced-motion: reduce)').matches, 'actual reduced motion media');
  c.assert(c.packet() === window.frozenPacket && c.stages() === window.frozenStages, 'reduced motion preserves current position and reached stages');
  clock.step(10000); await c.wait();
  c.assert(c.packet() === window.frozenPacket && clock.pending() === 0, 'no frames after reduced motion');
  c.click('.trace-primary'); await c.wait();
  c.assert(c.packet() === window.frozenPacket && document.querySelectorAll('.trace-stage-visited').length === 3, 'static emphasis without packet movement');
  c.assert([...document.querySelectorAll('.trace-stage-visited .trace-stage-index')].every(e => e.textContent.includes('✓')), 'reached markers not color only');
  c.click('.trace-controls button:nth-child(3)'); await c.wait(); c.click('.trace-primary'); await c.wait();
  c.assert(!c.packet() && document.querySelectorAll('.trace-stage-visited').length === 3, 'reduced motion replay from reset has no packet');
  return ['real reduced-motion toggle during replay', 'static position', 'visible reached markers'];
})()"""

SELECTION = """(async () => {
  const c = traceCheck, clock = traceTestClock;
  c.click('.trace-controls button:nth-child(3)'); await c.wait(); c.click('.trace-primary'); await c.wait();
  clock.step(300); await c.wait(); const stale = clock.capture();
  document.querySelectorAll('.session')[1].click(); await c.wait(); await c.wait(); stale(); await c.wait();
  c.assert(document.querySelector('.route-trace .meta').textContent === 'synthetic-b1' && !c.packet() && clock.pending() === 0, 'session switch cancels old replay');
  c.click('.trace-primary'); await c.wait(); clock.step(500); await c.wait();
  const instance = document.querySelector('.route-trace').dataset.traceInstance;
  [...document.querySelectorAll('button')].find(e => e.textContent === 'Refresh').click(); await c.wait(); await c.wait();
  c.assert(document.querySelector('.route-trace').dataset.traceInstance !== instance && !c.packet(), 'refresh resets replay');
  document.querySelectorAll('.session')[2].click(); await c.wait(); await c.wait();
  c.assert(!document.querySelector('.route-trace') && !document.querySelector('.request-select'), 'empty session');
  document.querySelectorAll('.session')[0].click(); await c.wait(); await c.wait();
  c.assert(document.querySelector('.route-trace .meta').textContent === 'synthetic-1' && !c.packet(), 'first request default restored');
  c.assert(performance.getEntriesByType('resource').every(e => new URL(e.name).origin === location.origin), 'loopback resources only');
  return ['session selection', 'refresh', 'empty session', 'default selected request', 'loopback only'];
})()"""


def main() -> None:
    if not BROWSER:
        raise RuntimeError("agent-browser is required")
    if not (STATIC / "index.html").exists():
        raise RuntimeError("Build frontend before running this check")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        browser("set", "viewport", "1440", "1000")
        browser("set", "media", "light", "no-preference")
        browser("open", f"http://127.0.0.1:{server.server_port}/dashboard")
        browser("wait", "--fn", "document.querySelectorAll('.session').length === 3")
        browser("click", ".session")
        browser("wait", "--fn", "document.querySelector('.route-trace') !== null")
        evaluate(SETUP)
        before = len(REQUESTS)
        print("PASS", evaluate(PLAYBACK), flush=True)
        assert len(REQUESTS) == before, "Replay/request selection performed network requests"
        evaluate("""(async () => { traceCheck.click('.trace-primary'); await traceCheck.wait(); traceTestClock.step(700); await traceCheck.wait(); window.frozenPacket = traceCheck.packet(); window.frozenStages = traceCheck.stages(); return true; })()""")
        browser("set", "media", "light", "reduced-motion")
        print("PASS", evaluate(REDUCED), flush=True)
        browser("set", "media", "light", "no-preference")
        print("PASS", evaluate(SELECTION), flush=True)
        for width in [390, 320]:
            browser("set", "viewport", str(width), "844")
            evaluate("traceCheck.wait().then(() => true)")
            assert evaluate("document.documentElement.scrollWidth <= innerWidth"), f"overflow at {width}"
        print("PASS narrow viewport overflow (390, 320)", flush=True)
        errors = browser("errors")
        assert not errors or "No errors" in errors, errors
        print("PASS no page errors; no live gateway used", flush=True)
    finally:
        server.shutdown()
        server.server_close()
        browser("close")


if __name__ == "__main__":
    main()
