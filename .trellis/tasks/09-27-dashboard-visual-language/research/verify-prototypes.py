"""Check local design prototypes only; no gateway or application build is used."""
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ART = HERE / 'verified-preview'
ART.mkdir(exist_ok=True)
BROWSER = '/opt/homebrew/bin/agent-browser'
SESSION = 'jev-design-verification'
RESULTS = []


def command(*args):
    result = subprocess.run([BROWSER, '--session', SESSION, *args], capture_output=True, text=True, timeout=35)
    if result.returncode:
        raise RuntimeError(result.stderr[-700:] + result.stdout[-700:])
    return result.stdout.strip()


def evaluate(code):
    raw = command('eval', code)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f'Browser returned invalid JSON: {raw[:200]}') from error


def check(name, value):
    RESULTS.append({'case': name, 'passed': bool(value)})
    print(name, 'PASS' if value else 'FAIL', flush=True)
    if not value:
        raise AssertionError(name)


def source_hashes():
    paths = subprocess.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', 'frontend'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in sorted(set(paths)) if (ROOT / p).is_file()}


def open_page(name, width=1440):
    command('set', 'viewport', str(width), '1000')
    command('open', (HERE / name).as_uri())
    command('wait', '--fn', 'document.readyState === "complete"')


before = source_hashes()
try:
    open_page('monitoring-prototype.html')
    check('initial-static-no-packet', evaluate('document.querySelector("#packet").getAttribute("visibility") === "hidden"'))
    command('focus', '#replay')
    command('press', 'Enter')
    command('wait', '--fn', 'document.querySelector("#packet").getAttribute("visibility") === "visible"')
    command('click', '#pause')
    check('pause-label', evaluate('document.querySelector("#replay").textContent === "Resume replay"'))
    check('pause-freezes-packet-and-highlights', evaluate('''(async () => {
      const snapshot = () => JSON.stringify({ x: document.querySelector('#packet').getAttribute('cx'), y: document.querySelector('#packet').getAttribute('cy'), classes: [...document.querySelectorAll('.route-node')].map(e => e.className) });
      const before = snapshot(); await new Promise(resolve => setTimeout(resolve, 400)); return before === snapshot();
    })()'''))
    command('click', '#replay')
    check('resume-continues-current-replay', evaluate('document.querySelector("#replay-state").textContent === "Illustrative replay running. No elapsed-time data is represented." && document.querySelector("#pause").disabled === false'))
    command('click', '#pause')
    command('click', '#reset')
    command('click', '#replay')
    command('wait', '--fn', 'document.querySelector("#replay").textContent === "Replay again"')
    check('completed-hides-packet', evaluate('document.querySelector("#packet").getAttribute("visibility") === "hidden"'))
    command('click', '#reset')
    check('reset-clears-state', evaluate('document.querySelectorAll(".visited,.active").length === 0 && document.querySelector("#replay").textContent === "Replay path"'))
    command('click', '[data-request-id="req-a3"]')
    check('recorded-failure', evaluate('document.querySelector("#outcome-chip").textContent === "Recorded failure"'))
    command('click', '#replay')
    command('select', '#session-select', 'sess-demo-b')
    check('switch-stops-replay', evaluate('document.querySelector("#packet").getAttribute("visibility") === "hidden" && document.querySelectorAll(".route-node.unavailable").length === 2'))
    command('click', '#replay')
    command('wait', '--fn', 'document.querySelector("#replay").textContent === "Replay again"')
    check('missing-stages-never-highlighted', evaluate('document.querySelectorAll(".unavailable.visited,.unavailable.active").length === 0 && document.querySelectorAll(".route-gap").length > 0'))
    command('select', '#session-select', 'sess-demo-c')
    check('empty-session-no-invented-request', evaluate('document.querySelectorAll(".request-choice").length === 0 && document.querySelector("#replay").disabled'))
    command('select', '#session-select', 'sess-demo-a')
    command('click', '#replay')
    command('set', 'media', 'dark', 'reduced-motion')
    check('live-motion-setting-stops-packet', evaluate('document.querySelector("#packet").getAttribute("visibility") === "hidden" && document.querySelector("#pause").disabled'))
    command('select', '#session-select', 'sess-demo-b')
    command('click', '#replay')
    check('reduced-motion-only-available-stages', evaluate('document.querySelectorAll(".visited").length === 2 && document.querySelectorAll(".unavailable.visited").length === 0'))
    command('close')

    for filename, stem in [('monitoring-prototype.html', 'monitoring'), ('style-board.html', 'style-board')]:
        for width in [1440, 390, 320]:
            open_page(filename, width)
            for theme in ['dark', 'light']:
                if theme == 'light':
                    command('click', '#theme-toggle' if stem == 'monitoring' else '[data-theme-choice="light"]')
                check(f'{stem}-{width}-{theme}-no-page-overflow', evaluate('document.documentElement.scrollWidth <= innerWidth'))
                check(f'{stem}-{width}-{theme}-local-resources-only', evaluate('performance.getEntriesByType("resource").every(e => e.name.startsWith("file:"))'))
                if width != 320:
                    command('screenshot', '--full', str(ART / f'{stem}-{width}-{theme}.png'))
            errors = command('errors')
            check(f'{stem}-{width}-no-page-errors', not errors or 'No errors' in errors)
            command('close')
    check('frontend-hashes-unchanged-this-verification', before == source_hashes())
finally:
    (ART / 'checks.json').write_text(json.dumps(RESULTS, indent=2) + '\n')
    try:
        command('close')
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f'Browser cleanup failed: {error}', flush=True)
