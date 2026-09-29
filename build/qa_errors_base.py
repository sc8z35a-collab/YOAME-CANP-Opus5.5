#!/usr/bin/env python3
"""Load the game headless and print unique console errors (shader compile logs included).
  python3 tools/qa_errors.py "<query>"
"""
import sys
from playwright.sync_api import sync_playwright
q = sys.argv[1] if len(sys.argv) > 1 else "qa=1&noevents&frames=2&q=m"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 900, "height": 420}); errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    pg.goto("http://127.0.0.1:8081/index.html?" + q, timeout=120000)
    try: pg.wait_for_function("window.__QA && window.__QA.ready", timeout=280000, polling=2000)
    except Exception: errs.append("TIMEOUT")
    b.close()
seen = set()
for e in errs:
    k = e[:90]
    if k in seen: continue
    seen.add(k)
    lines = [l for l in e.split("\n") if "ERROR" in l or "Material" in l or "PAGEERR" in l or "TIMEOUT" in l]
    print("----", "\n".join(lines[:8]) if lines else e[:400])
    if "-v" in sys.argv: print(e[:6000])
print("unique errors:", len(seen))
