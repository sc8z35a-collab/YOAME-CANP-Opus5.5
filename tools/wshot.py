# Agent C: capture tools/weather_check.html (weather-only scene, ~8s, low memory). usage: python3 tools/wshot.py "t=23&w=cloudy&ly=12" out.jpg  (needs http.server on 8083)
import sys, base64, json
from playwright.sync_api import sync_playwright
q, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--js-flags=--max-old-space-size=256"])
    pg = b.new_page(viewport={"width": 640, "height": 360}); errs = []
    pg.on("console", lambda m: errs.append(m.text[:400]) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:400]))
    pg.goto("http://127.0.0.1:8083/tools/weather_check.html?" + q, timeout=60000)
    try: pg.wait_for_function("window.__R", timeout=90000)
    except Exception: errs.append("TIMEOUT")
    d = pg.evaluate("window.__R || {}")
    if d.get("shot"): open(out, "wb").write(base64.b64decode(d.pop("shot").split(",")[1]))
    b.close()
print(json.dumps({"errors": errs[:6], "r": d}, ensure_ascii=False)[:1500])
