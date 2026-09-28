#!/usr/bin/env python3
"""Interior-only QA shot (tools/interior.html). Much lighter than the full game.
  python3 tools/ishot.py out.jpg "pos=..&at=..&fov=.." [more "name|query" pairs via -b]
  python3 tools/ishot.py -b name1 "query1" name2 "query2" ...   -> build/shots/<name>.jpg
One browser, several shots, serialized with a file lock.
"""
import sys, base64, fcntl, os, time, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8080")
args = sys.argv[1:]
jobs = []
if args and args[0] == "-b":
    a = args[1:]
    for i in range(0, len(a) - 1, 2):
        jobs.append(("build/shots/" + a[i] + ".jpg", a[i + 1]))
else:
    jobs.append((args[0], args[1] if len(args) > 1 else ""))
lock = open("/tmp/qa_browser.lock", "w"); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                "--ignore-gpu-blocklist", "--js-flags=--max-old-space-size=384", "--renderer-process-limit=1"])
    for out, q in jobs:
        t0 = time.time(); errs = []
        pg = b.new_page(viewport={"width": 915, "height": 412})
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type in ("error", "log") else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:300]))
        try:
            pg.goto(BASE + "/tools/interior.html?" + q, timeout=90000)
            pg.wait_for_function("document.title=='done'", timeout=200000, polling=1000)
            d = pg.evaluate("window.__SHOT")
            open(out, "wb").write(base64.b64decode(d.split(",")[1]))
        except Exception as e:
            errs.append("ERR " + str(e)[:200])
        pg.close()
        print(json.dumps({"out": out, "secs": round(time.time() - t0), "errors": errs[:8]}, ensure_ascii=False))
    b.close()
