#!/usr/bin/env python3
"""Screenshot of a tools/*.html harness (no WebGL).  python3 tools/page_shot.py "<query>" out.png w h dpr page.html"""
import sys
from playwright.sync_api import sync_playwright
q, out = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 915
h = int(sys.argv[4]) if len(sys.argv) > 4 else 412
dpr = float(sys.argv[5]) if len(sys.argv) > 5 else 2
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=dpr)
    errs = []
    pg.on("console", lambda m: errs.append(m.text[:300]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:300]))
    pg.goto(__import__("os").environ.get("QA_BASE", "http://127.0.0.1:8080").rstrip("/") + "/tools/" + (sys.argv[6] if len(sys.argv) > 6 else "map_test.html") + "?" + q, timeout=120000)
    pg.wait_for_function("window.__done", timeout=120000)
    pg.screenshot(path=out)
    b.close()
print("errors:", errs)
