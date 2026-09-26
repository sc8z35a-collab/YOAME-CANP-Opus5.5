#!/usr/bin/env python3
"""Deterministic QA screenshot of the game (canvas capture after N frames).

  python3 tools/qa_shot.py "<query>" out.jpg [w h]

- Serialized with a file lock: only one headless Chromium at a time (1GB sandbox safe).
- Captures canvas via toDataURL inside the page (swiftshader page screenshots hang).
- Also captures HUD DOM overlay separately when ?ui=1 using a normal screenshot of a
  frozen page (render loop is stopped once QA is ready).
"""
import sys, time, base64, json, fcntl
from playwright.sync_api import sync_playwright

q, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 915
h = int(sys.argv[4]) if len(sys.argv) > 4 else 412
url = "http://127.0.0.1:8080/index.html?" + q.lstrip("?")

lock = open("/tmp/qa_browser.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX)
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                "--ignore-gpu-blocklist", "--js-flags=--max-old-space-size=512"])
    pg = b.new_page(viewport={"width": w, "height": h})
    errs = []
    pg.on("console", lambda m: errs.append(m.text[:300]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:300]))
    pg.goto(url, timeout=120000)
    try:
        pg.wait_for_function("window.__QA && window.__QA.ready", timeout=280000, polling=2000)
    except Exception:
        errs.append("TIMEOUT")
    d = pg.evaluate("window.__QA && window.__QA.shot || ''")
    info = pg.evaluate("JSON.stringify(Object.assign({}, window.__QA || {}, {shot: undefined}))")
    if d:
        open(out, "wb").write(base64.b64decode(d.split(",")[1]))
    if "ui=1" in q:
        try:
            pg.screenshot(path=out.replace(".jpg", "_ui.png"), timeout=60000)
        except Exception as e:
            errs.append("ui shot: " + str(e)[:100])
    b.close()
print(json.dumps({"secs": round(time.time() - t0), "errors": errs, "qa": json.loads(info)}, ensure_ascii=False)[:1200])
