import sys,time,base64
from playwright.sync_api import sync_playwright
url,out=sys.argv[1],sys.argv[2]
with sync_playwright() as p:
  b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
  pg=b.new_page(viewport={'width':915,'height':412})
  pg.on('console',lambda m: print('C',m.type,m.text[:400]) if m.type in('error','warning') else None)
  pg.on('pageerror',lambda e: print('PAGEERR',e))
  t=time.time(); pg.goto(url)
  try: pg.wait_for_function("window.__QA && window.__QA.ready",timeout=300000)
  except Exception as e: print('TIMEOUT')
  d=pg.evaluate("window.__QA.shot||''")
  print('secs',round(time.time()-t),pg.evaluate("JSON.stringify(Object.assign({},window.__QA,{shot:0}))")[:300])
  if d: open(out,'wb').write(base64.b64decode(d.split(',')[1]))
  b.close()
