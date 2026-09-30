#!/usr/bin/env python3
"""Camper-only preview shots (tools/camper_preview.html). Light enough for a 1GB sandbox.

  python3 tools/cshot.py "<query>" out.jpg [w h]
  python3 tools/cshot.py -b name1 "query1" name2 "query2" ...   -> build/shots/<name>.jpg

One Chromium at a time (shares /tmp/qa_browser.lock with qa_shot.py / ishot.py).
Needs a static server: python3 -m http.server 8080 (override with QA_BASE=http://127.0.0.1:8081).
"""
import sys, base64, fcntl, os, time, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8080").rstrip("/")
a = sys.argv[1:]
jobs = []
os.makedirs("build/shots", exist_ok=True)
if a and a[0] == "-b":
    for i in range(1, len(a) - 1, 2):
        jobs.append((a[i + 1], "build/shots/" + a[i] + ".jpg", 915, 412))
else:
    jobs.append((a[0], a[1], int(a[2]) if len(a) > 2 else 915, int(a[3]) if len(a) > 3 else 412))
lock = open("/tmp/qa_browser.lock", "w")
fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                "--ignore-gpu-blocklist", "--js-flags=--max-old-space-size=384", "--renderer-process-limit=1"])
    for q, out, w, h in jobs:
        t0 = time.time(); errs = []
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.on("console", lambda m: errs.append(m.type + ": " + m.text[:240]) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:300]))
        info = None
        try:
            sep = "&" if q else ""
            pg.goto(f"{BASE}/tools/camper_preview.html?w={w}&h={h}{sep}{q.lstrip('?')}", timeout=90000)
            pg.wait_for_function("document.title=='done'", timeout=240000, polling=1000)
            d = pg.evaluate("window.__SHOT")
            info = pg.evaluate("window.__INFO")
            errs += pg.evaluate("window.__ERRS || []")
            open(out, "wb").write(base64.b64decode(d.split(",")[1]))
        except Exception as e:
            errs.append("ERR " + str(e)[:200])
        pg.close()
        print(json.dumps({"out": out, "secs": round(time.time() - t0), "info": info, "errors": errs[:10]}, ensure_ascii=False))
    b.close()
