#!/usr/bin/env python3
"""DOM screenshots of HUD / menus / tablet via tools/ui_harness.html (no WebGL: ~5s per shot).
  python3 tools/uishot.py -b name "open=menu&tab=car" name2 "open=tablet" ...  -> build/shots/<name>.png
  env UI_W / UI_H for the viewport (default 915x412 landscape phone)."""
import sys, fcntl, os, time, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8080").rstrip("/")
a = sys.argv[1:]; jobs = []
os.makedirs("build/shots", exist_ok=True)
for i in range(1 if a and a[0] == "-b" else 0, len(a) - 1, 2): jobs.append((a[i], a[i + 1]))
W, H = int(os.environ.get("UI_W", 915)), int(os.environ.get("UI_H", 412))
lock = open("/tmp/qa_browser.lock", "w"); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-gpu", "--js-flags=--max-old-space-size=384", "--renderer-process-limit=1"])
    for name, q in jobs:
        t0 = time.time(); errs = []
        pg = b.new_page(viewport={"width": W, "height": H}, has_touch=True)
        pg.on("console", lambda m: errs.append(m.type + ": " + m.text[:200]) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:300]))
        info = None
        try:
            pg.goto(f"{BASE}/tools/ui_harness.html?{q}", timeout=60000)
            pg.wait_for_function("document.title=='done'", timeout=180000, polling=500)
            info = pg.evaluate("window.__INFO")
            pg.screenshot(path=f"build/shots/{name}.png")
        except Exception as e:
            errs.append("ERR " + str(e)[:200])
        pg.close()
        print(json.dumps({"out": name, "secs": round(time.time() - t0), "info": info, "errors": errs[:10]}, ensure_ascii=False))
    b.close()
