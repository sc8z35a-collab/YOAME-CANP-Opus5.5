#!/usr/bin/env python3
"""Agent D debug helper: open camper_preview, then evaluate a JS expression against the live modules.
  python3 tools/dbg_d.py "<preview query>" "<js body returning JSON-able value; C, IN, THREE, G available>"
"""
import sys, os, json, fcntl
from playwright.sync_api import sync_playwright
BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8084").rstrip("/")
q, js = sys.argv[1], sys.argv[2]
lock = open("/tmp/qa_browser.lock", "w"); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 640, "height": 360})
    pg.goto(f"{BASE}/tools/camper_preview.html?w=640&h=360&frames=1&{q}", timeout=90000)
    pg.wait_for_function("document.title=='done'", timeout=240000, polling=1000)
    r = pg.evaluate("""async (js) => { const C = (await import('/js/camper.js')); const I = await import('/js/interior.js');
      const T = await import('/js/core.js'); return (new Function('M','IN','THREE','G', js))(C, I.IN, T.THREE, T.G); }""", js)
    print(json.dumps(r, ensure_ascii=False, indent=1)); b.close()
