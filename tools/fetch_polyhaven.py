#!/usr/bin/env python3
"""Fetch Poly Haven (CC0) textures / models into the project's asset tiers.
  python3 tools/fetch_polyhaven.py tex white_oak_veneer brown_leather ...
  python3 tools/fetch_polyhaven.py model pot_enamel_01 ...     (needs node + npx gltf-transform)
Textures -> assets/tex (2k), assets/tex_h (1k), assets/tex_m (512) as <id>_diffuse / _nor_gl / _arm .jpg
Models   -> assets/models/<id>.glb (1k textures, resized to 512, draco-free, meshopt-free)
"""
import sys, os, json, urllib.request, io, subprocess, tempfile, shutil
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), '..')
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'forest-camper-3d/1.0 (asset fetch)'})
    with urllib.request.urlopen(req, timeout=90) as r: return r.read()
def files(aid): return json.loads(get('https://api.polyhaven.com/files/' + aid))

def tex(aid):
    f = files(aid)
    maps = {'_diffuse': 'Diffuse', '_nor_gl': 'nor_gl', '_arm': 'arm'}
    for suf, key in maps.items():
        if key not in f: print('  skip', aid, key); continue
        src = f[key]['2k']['jpg']['url'] if '2k' in f[key] else f[key]['1k']['jpg']['url']
        im = Image.open(io.BytesIO(get(src))).convert('RGB')
        for d, s, q in (('tex', 2048, 85), ('tex_h', 1024, 86), ('tex_m', 512, 85)):
            os.makedirs(os.path.join(ROOT, 'assets', d), exist_ok=True)
            im.resize((s, s), Image.LANCZOS).save(os.path.join(ROOT, 'assets', d, aid + suf + '.jpg'), quality=q, optimize=True)
    print('tex ok', aid)

def model(aid, res='1k', size=512):
    f = files(aid)
    g = f['gltf'][res]['gltf']
    tmp = tempfile.mkdtemp()
    open(os.path.join(tmp, 'm.gltf'), 'wb').write(get(g['url']))
    for rel, inc in g['include'].items():
        p = os.path.join(tmp, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
        data = get(inc['url'])
        if rel.endswith('.jpg') or rel.endswith('.png'):
            im = Image.open(io.BytesIO(data)); im = im.convert('RGBA' if im.mode in ('RGBA', 'LA') else 'RGB')
            im.thumbnail((size, size), Image.LANCZOS); b = io.BytesIO()
            im.save(b, 'PNG' if rel.endswith('.png') else 'JPEG', **({} if rel.endswith('.png') else {'quality': 85}))
            data = b.getvalue()
        open(p, 'wb').write(data)
    out = os.path.join(ROOT, 'assets', 'models', aid + '.glb')
    subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'copy', os.path.join(tmp, 'm.gltf'), out], check=True,
                   stdout=subprocess.DEVNULL)
    shutil.rmtree(tmp)
    print('model ok', aid, os.path.getsize(out))

if __name__ == '__main__':
    kind, ids = sys.argv[1], sys.argv[2:]
    for a in ids:
        try: (tex if kind == 'tex' else model)(a)
        except Exception as e: print('FAIL', a, e)
