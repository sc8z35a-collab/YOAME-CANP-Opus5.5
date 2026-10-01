#!/usr/bin/env python3
"""Headless audio smoke test (runs tools/audio_test.html; fails on exceptions or silence)."""
import fcntl, json, sys
from playwright.sync_api import sync_playwright
lock = open("/tmp/qa_browser.lock", "w"); fcntl.flock(lock, fcntl.LOCK_EX)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page()
    pg.goto("http://127.0.0.1:8080/tools/audio_test.html")
    pg.wait_for_function("document.title=='done'", timeout=60000)
    r = pg.evaluate("window.__audio"); b.close()
print(json.dumps(r, ensure_ascii=False))
sys.exit(0 if not r["errors"] and r["rms"] > 0.001 else 1)
