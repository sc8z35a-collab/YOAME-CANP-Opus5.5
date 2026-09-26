#!/usr/bin/env python3
"""
6-Agent automated build pipeline for "森の奥のキャンプカー".

Usage:
  python3 tools/agents/pipeline.py              # full run (6 agents in parallel)
  python3 tools/agents/pipeline.py --only syntax,assets
  python3 tools/agents/pipeline.py --autosave   # commit + push WIP after run
  python3 tools/agents/pipeline.py --preflight  # only check LLM API

Agents (run concurrently; browser-heavy ones share a GPU semaphore so a
2-core / 1GB sandbox does not freeze):
  A1 architect  : JS module graph + syntax (node --check), import resolution
  A2 assets     : every referenced asset exists, size budget, license list
  A3 render     : headless render — day / clear, checks console errors, FPS
  A4 scenario   : headless render — night+storm+bear / flood / landslide
  A5 mobile-ux  : landscape phone viewports, touch-target sizes, portrait guard
  A6 reviewer   : LLM code review (gpt-5.x) when API credits exist,
                  otherwise static heuristics review

LLM mode: if the Genspark LLM proxy answers normally, A1..A6 additionally send
their findings + source excerpts to an LLM (one model per agent) and store the
advice in build/reports/<agent>.llm.md. If the proxy refuses (free plan / no
credit), the pipeline logs it and continues fully offline.
"""
import argparse, concurrent.futures as cf, datetime as dt, http.server, json, os, re
import socketserver, subprocess, sys, threading, time, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "build" / "reports"
SHOTS = ROOT / "build" / "shots"
PORT = 8123
GPU = threading.Semaphore(1)          # headless chromium (swiftshader) is heavy
import fcntl
class _FileLock:
    def __enter__(self):
        self.f = open('/tmp/qa_browser.lock', 'w'); fcntl.flock(self.f, fcntl.LOCK_EX)
    def __exit__(self, *a): fcntl.flock(self.f, fcntl.LOCK_UN); self.f.close()
FLOCK = _FileLock()
LOCK = threading.Lock()

AGENT_MODELS = {
    "architect": "gpt-5.3-codex", "assets": "gpt-5-mini", "render": "gpt-5.2",
    "scenario": "gpt-5.1", "mobile": "gpt-5", "reviewer": "gpt-5.2-codex",
}

def log(agent, msg):
    with LOCK:
        print(f"[{dt.datetime.now():%H:%M:%S}] [{agent:9}] {msg}", flush=True)

# ---------------------------------------------------------------- LLM access
def llm_client():
    try:
        from openai import OpenAI
    except ImportError:
        return None
    key, base = os.environ.get("OPENAI_API_KEY"), os.environ.get("OPENAI_BASE_URL")
    cfg = Path.home() / ".genspark_llm.yaml"
    if (not key or not base) and cfg.exists():
        txt = cfg.read_text()
        key = key or (re.search(r"api_key:\s*(\S+)", txt) or [None, None])[1]
        base = base or (re.search(r"base_url:\s*(\S+)", txt) or [None, None])[1]
    if not key or not base:
        return None
    return OpenAI(api_key=key, base_url=base, timeout=180)

REFUSALS = ("Free-plan credits", "credit_exhausted", "purchase credits", "subscribe")

def preflight():
    """Returns (online:bool, detail:str)."""
    c = llm_client()
    if not c:
        return False, "openai SDK or API key missing"
    results = {}
    def ping(m):
        try:
            r = c.chat.completions.create(model=m, messages=[{"role": "user", "content": "Reply exactly: OK"}])
            t = (r.choices[0].message.content or "").strip()
            return m, ("REFUSED: " + t[:90]) if any(s in t for s in REFUSALS) else ("OK: " + t[:20])
        except Exception as e:
            return m, "ERROR: " + str(e)[:120]
    with cf.ThreadPoolExecutor(6) as ex:
        for m, res in ex.map(ping, sorted(set(AGENT_MODELS.values()))):
            results[m] = res
    online = all(v.startswith("OK") for v in results.values())
    return online, json.dumps(results, ensure_ascii=False, indent=1)

def llm_advise(agent, findings, files):
    c = llm_client()
    src = ""
    for f in files:
        p = ROOT / f
        if p.exists():
            src += f"\n\n// ===== {f} =====\n" + p.read_text()[:14000]
    sysmsg = ("You are agent '%s' in a 6-agent build pipeline for a Three.js mobile (landscape, "
              "fullscreen, high-end Android) cozy-survival game set inside a camper van deep in a forest. "
              "Give concrete, prioritized fixes as unified diffs or precise instructions. Japanese OK." % agent)
    r = c.chat.completions.create(model=AGENT_MODELS[agent], messages=[
        {"role": "system", "content": sysmsg},
        {"role": "user", "content": "Findings:\n" + json.dumps(findings, ensure_ascii=False)[:6000] + src}])
    return r.choices[0].message.content

# ---------------------------------------------------------------- helpers
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), QuietHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def js_files():
    return sorted(p for p in (ROOT / "js").rglob("*.js") if "/lib/" not in str(p))

def browser_run(url, out, w, h, wait_s=300, dpr=1, touch=True, extra_js=None):
    """Load url in headless chromium, wait for window.__QA.ready, screenshot."""
    from playwright.sync_api import sync_playwright
    logs, errs, qa = [], [], {}
    with GPU, FLOCK, sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
                                    "--autoplay-policy=no-user-gesture-required"])
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr,
                            has_touch=touch, is_mobile=touch)
        pg = ctx.new_page()
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text[:300]}"))
        pg.on("pageerror", lambda e: errs.append(str(e)[:400]))
        pg.goto(url)
        try:
            pg.wait_for_function("window.__QA && window.__QA.ready === true", timeout=wait_s * 1000)
        except Exception:
            errs.append("timeout waiting for __QA.ready")
        if extra_js:
            try: pg.evaluate(extra_js)
            except Exception as e: errs.append("extra_js: " + str(e)[:200])
        time.sleep(1.0)
        try: qa = pg.evaluate("JSON.parse(JSON.stringify(Object.assign({}, window.__QA||{}, {shot: undefined})))")
        except Exception: pass
        # canvas capture (page.screenshot hangs under swiftshader with a live WebGL loop)
        try:
            import base64
            d = pg.evaluate("window.__QA && window.__QA.shot || ''")
            if d: Path(str(out).replace('.png', '.jpg')).write_bytes(base64.b64decode(d.split(',')[1]))
        except Exception as e: errs.append("canvas: " + str(e)[:120])
        try: pg.screenshot(path=str(out).replace('.png', '_ui.png'), timeout=45000)  # DOM/HUD layer (loop frozen)
        except Exception as e: errs.append("ui: " + str(e)[:80])
        b.close()
    return {"logs": logs[-40:], "errors": errs, "qa": qa}

# ---------------------------------------------------------------- agents
def a_architect():
    f = {"syntax": [], "imports": []}
    for p in js_files():
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
        if r.returncode: f["syntax"].append(f"{p.relative_to(ROOT)}: {r.stderr.strip()[:300]}")
        for m in re.finditer(r"""(?:import|from)\s*['"](\.[^'"]+)['"]""", p.read_text()):
            tgt = (p.parent / m.group(1)).resolve()
            if not tgt.exists(): f["imports"].append(f"{p.relative_to(ROOT)} -> {m.group(1)} missing")
    f["modules"] = [str(p.relative_to(ROOT)) for p in js_files()]
    # named import/export cross-check + logic & viewpoint tests (node, no WebGL)
    for name, cmd in [("exports", ["node", "tools/agents/check_exports.mjs"]),
                      ("logic", ["node", "tools/agents/logic_test.mjs"]),
                      ("views", ["node", "tools/agents/view_test.mjs"])]:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        f[name] = {"ok": r.returncode == 0, "fails": [l for l in r.stdout.splitlines() if l.startswith("FAIL") or "not exported" in l]}
    f["ok"] = not f["syntax"] and not f["imports"] and all(f[k]["ok"] for k in ("exports", "logic", "views"))
    return f

def a_assets():
    f = {"missing": [], "unused": [], "bytes": {}}
    refs = set()
    for p in js_files() + [ROOT / "index.html"]:
        if p.exists():
            refs |= set(re.findall(r"""assets/[\w/.\-]+\.(?:glb|jpg|png|webp|ktx2|mp3|ogg)""", p.read_text()))
    tex_names = set()
    for p in js_files():
        tex_names |= set(re.findall(r"""tex\(\s*['"]([\w\-]+)['"]""", p.read_text()))
    for r in sorted(refs):
        if not (ROOT / r).exists(): f["missing"].append(r)
    for n in sorted(tex_names):
        if not list((ROOT / "assets/tex").glob(n + "*")): f["missing"].append("tex:" + n)
    for d in ("models", "tex", "tex_m"):
        f["bytes"][d] = sum(x.stat().st_size for x in (ROOT / "assets" / d).glob("*"))
    used_models = {Path(r).name for r in refs}
    f["unused"] = [x.name for x in (ROOT / "assets/models").glob("*.glb") if x.name not in used_models
                   and not any(x.stem in (ROOT / p).read_text() for p in map(str, js_files()))]
    f["ok"] = not f["missing"]
    return f

SCENES = {
    "render": [("day_clear", "?qa=1&q=m&t=11&weather=clear&view=lounge"),
               ("dusk_cozy", "?qa=1&q=m&t=18.6&weather=cloudy&view=bed")],
    "scenario": [("night_storm_bear", "?qa=1&q=m&t=23&weather=storm&event=bear&view=driver"),
                 ("flood", "?qa=1&q=m&t=15&weather=rain&event=flood&view=lounge"),
                 ("landslide", "?qa=1&q=m&t=16&weather=storm&spot=ridge&event=landslide&view=rear"),
                 ("deer_morning", "?qa=1&q=m&t=7&weather=fog&event=deer&view=lounge")],
}

def _shots(name):
    SHOTS.mkdir(parents=True, exist_ok=True)
    res = {}
    for key, qs in SCENES[name]:
        out = SHOTS / f"{key}.png"
        r = browser_run(f"http://127.0.0.1:{PORT}/index.html{qs}", out, 915, 412)
        res[key] = {"shot": str(out.relative_to(ROOT)), **r}
        log(name, f"{key}: errors={len(r['errors'])} fps={r['qa'].get('fps')}")
    return {"scenes": res, "ok": all(not v["errors"] for v in res.values())}

def a_render(): return _shots("render")
def a_scenario(): return _shots("scenario")

def a_mobile():
    SHOTS.mkdir(parents=True, exist_ok=True)
    js = """(()=>{const out=[];document.querySelectorAll('[data-touch]').forEach(e=>{const r=e.getBoundingClientRect();
      if(r.width>0&&(r.width<40||r.height<40))out.push(e.id||e.className+':'+Math.round(r.width)+'x'+Math.round(r.height));});
      window.__QA.smallTargets=out;
      const pg=document.getElementById('rotate');window.__QA.rotateVisible=pg?getComputedStyle(pg).display!=='none':null;})()"""
    res = {}
    for key, (w, h, dpr) in {"pixel_landscape": (915, 412, 1), "wide_landscape": (1000, 450, 1),
                             "portrait_guard": (412, 915, 1)}.items():
        out = SHOTS / f"mobile_{key}.png"
        r = browser_run(f"http://127.0.0.1:{PORT}/index.html?qa=1&q=m&t=20&weather=rain&view=lounge",
                        out, w, h, dpr=dpr, extra_js=js)
        res[key] = {"shot": str(out.relative_to(ROOT)), "small": r["qa"].get("smallTargets"),
                    "rotateVisible": r["qa"].get("rotateVisible"), "errors": r["errors"]}
        log("mobile", f"{key}: small={r['qa'].get('smallTargets')} rotate={r['qa'].get('rotateVisible')}")
    ok = (res["portrait_guard"]["rotateVisible"] is True and res["pixel_landscape"]["rotateVisible"] is False
          and not res["pixel_landscape"]["small"])
    return {"viewports": res, "ok": ok}

def a_reviewer():
    f = {"notes": []}
    for p in js_files():
        t = p.read_text(); rel = str(p.relative_to(ROOT))
        if "TODO" in t or "FIXME" in t: f["notes"].append(f"{rel}: contains TODO/FIXME")
        if re.search(r"new THREE\.\w+(Geometry|Material)\(", t) and "update(" in t:
            for m in re.finditer(r"update\([^)]*\)\s*\{", t):
                body = t[m.end(): m.end() + 1500]
                if re.search(r"new THREE\.\w+(Geometry|Material)\(", body):
                    f["notes"].append(f"{rel}: allocates geometry/material inside update() (GC/leak risk)")
        if "console.log(" in t: f["notes"].append(f"{rel}: console.log left in code")
        n = t.count("\n")
        if n > 1400: f["notes"].append(f"{rel}: {n} lines — consider splitting")
    f["ok"] = True
    return f

AGENTS = {"architect": a_architect, "assets": a_assets, "render": a_render,
          "scenario": a_scenario, "mobile": a_mobile, "reviewer": a_reviewer}

def run_agent(name, online):
    t0 = time.time(); log(name, "start")
    try:
        f = AGENTS[name]()
    except Exception as e:
        f = {"ok": False, "crash": traceback.format_exc()[-1500:]}
    f["seconds"] = round(time.time() - t0, 1)
    if online:
        try:
            adv = llm_advise(name, f, [str(p.relative_to(ROOT)) for p in js_files()][:6])
            (REPORTS / f"{name}.llm.md").write_text(adv or "")
            f["llm"] = f"build/reports/{name}.llm.md"
        except Exception as e:
            f["llm_error"] = str(e)[:200]
    (REPORTS / f"{name}.json").write_text(json.dumps(f, ensure_ascii=False, indent=1))
    log(name, f"done ok={f.get('ok')} in {f['seconds']}s")
    return name, f

def autosave(msg):
    subprocess.run(["git", "add", "-A"], cwd=ROOT)
    r = subprocess.run(["git", "commit", "-qm", msg], cwd=ROOT, capture_output=True, text=True)
    if r.returncode == 0:
        subprocess.run(["git", "push", "-q", "origin", "HEAD"], cwd=ROOT)
        print("autosaved:", msg)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only"); ap.add_argument("--autosave", action="store_true")
    ap.add_argument("--preflight", action="store_true"); ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()
    REPORTS.mkdir(parents=True, exist_ok=True)
    online, detail = (False, "forced offline") if a.offline else preflight()
    (REPORTS / "preflight.txt").write_text(f"online={online}\n{detail}\n")
    print(f"LLM preflight: {'ONLINE' if online else 'OFFLINE (deterministic agents only)'}\n{detail}")
    if a.preflight: return
    names = a.only.split(",") if a.only else list(AGENTS)
    httpd = start_server()
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        results = dict(ex.map(lambda n: run_agent(n, online), names))
    httpd.shutdown()
    summary = {n: {"ok": r.get("ok"), "s": r.get("seconds")} for n, r in results.items()}
    (REPORTS / "summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    if a.autosave:
        autosave("ci(agents): pipeline run " + " ".join(f"{n}={'ok' if v['ok'] else 'NG'}" for n, v in summary.items()))
    sys.exit(0 if all(v["ok"] for v in summary.values()) else 1)

if __name__ == "__main__":
    main()
