// verify every named import exists as an export in the target module (non-lib)
import fs from 'fs'; import path from 'path';
const files = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f);
let bad = 0;
const exportsOf = f => { const t = fs.readFileSync(f, 'utf8'); const s = new Set();
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+(\w+)/g)) s.add(m[1]);
  for (const m of t.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach(x => s.add(x.trim().split(/\s+as\s+/).pop()));
  return s; };
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g)) {
    const tgt = path.normalize(path.join(path.dirname(f), m[2]));
    if (tgt.includes('lib')) continue;
    const ex = exportsOf(tgt);
    for (const n of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!ex.has(n)) { console.log(`${f}: '${n}' not exported by ${tgt}`); bad++; }
  }
}
process.exit(bad ? 1 : 0);
