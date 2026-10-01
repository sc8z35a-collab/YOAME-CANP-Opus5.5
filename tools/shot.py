import sys,asyncio
from playwright.async_api import async_playwright
async def main(url,out,w,h,wait):
  async with async_playwright() as p:
    b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':w,'height':h}, device_scale_factor=1)
    pg.on('console',lambda m: print('CONSOLE',m.text[:500]))
    pg.on('pageerror',lambda e: print('PAGEERR',e))
    await pg.goto(url)
    try: await pg.wait_for_function("document.title=='done'",timeout=wait*1000)
    except Exception as e: print('timeout')
    await pg.screenshot(path=out); await b.close()
a=sys.argv; asyncio.run(main(a[1],a[2],int(a[3]),int(a[4]),int(a[5]) if len(a)>5 else 60))
