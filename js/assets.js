// Texture / model loading with a shared progress manager.
import { THREE, G } from './core.js';
import { GLTFLoader } from './lib/addons/GLTFLoader.js';

export const manager = new THREE.LoadingManager();
export const progress = { loaded: 0, total: 0 };
manager.onProgress = (_u, l, t) => { progress.loaded = l; progress.total = t; };

const TL = new THREE.TextureLoader(manager);
const GL = new GLTFLoader(manager);
const texCache = new Map();
const glbCache = new Map();

const dir = () => (G.quality === 'm' ? 'assets/tex_m/' : 'assets/tex/');
let maxAniso = 8;
export function setAniso(n) { maxAniso = n; }

/** Load a texture by base file name (without .jpg). */
export function tex(name, { srgb = false, repeat = 1, flip = true } = {}) {
  const key = name + '|' + repeat + '|' + srgb;
  if (texCache.has(key)) return texCache.get(key);
  const t = TL.load(dir() + name + '.jpg');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = maxAniso;
  t.flipY = flip;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Poly Haven style PBR set: <base>_diffuse, <base>_nor_gl, <base>_arm (AO/Rough/Metal). */
export function pbr(base, { repeat = 1, arm = true, diff = '_diffuse', color, rough, metal = 0, normalScale = 1, extra = {} } = {}) {
  const p = {
    map: tex(base + diff, { srgb: true, repeat }),
    normalMap: tex(base + '_nor_gl', { repeat }),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    metalness: metal,
    ...extra,
  };
  if (arm) {
    const a = tex(base + '_arm', { repeat });
    p.aoMap = a; p.roughnessMap = a;
    if (metal > 0) p.metalnessMap = a;
    p.roughness = rough ?? 1;
  } else p.roughness = rough ?? 0.85;
  if (color) p.color = new THREE.Color(color);
  return new THREE.MeshStandardMaterial(p);
}

export function glb(name) {
  if (!glbCache.has(name)) {
    glbCache.set(name, new Promise((res, rej) => GL.load('assets/models/' + name + '.glb', res, undefined, rej)));
  }
  return glbCache.get(name);
}

/** Collect meshes of a GLB with their transform baked into geometry (for instancing). */
export async function glbParts(name, { scale = 1 } = {}) {
  const g = await glb(name);
  g.scene.updateMatrixWorld(true);
  const parts = [];
  g.scene.traverse(o => {
    if (o.isMesh) {
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (scale !== 1) geo.scale(scale, scale, scale);
      parts.push({ geo, mat: o.material, name: o.name });
    }
  });
  return parts;
}

/** Canvas texture helper. */
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.userData.ctx = ctx; t.userData.canvas = c;
  return t;
}
