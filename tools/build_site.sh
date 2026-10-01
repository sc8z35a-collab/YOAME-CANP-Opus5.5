#!/usr/bin/env bash
# Production bundle: only what the game needs at runtime (no tools/, build/, docs/, tests).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html manifest.webmanifest CREDITS.md dist/
cp -r css js assets dist/
# (three.module.js imports three.core.min.js - both are required at runtime)
touch dist/.nojekyll
# stamp build id for cache-busting / support
echo "{\"build\":\"$(git rev-parse --short HEAD 2>/dev/null || date +%s)\",\"date\":\"$(date -u +%FT%TZ)\"}" > dist/version.json
# sanity: every relative ES-module import in the bundle must resolve inside dist/
node -e '
const fs=require("fs"),path=require("path");let bad=0;
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const f of walk("dist/js").filter(f=>f.endsWith(".js"))){const t=fs.readFileSync(f,"utf8");
 for(const m of t.matchAll(/(?:import|from)\s*[\x27\x22](\.{1,2}\/[^\x27\x22]+)[\x27\x22]/g)){const p=path.resolve(path.dirname(f),m[1]);if(!fs.existsSync(p)){console.log("unresolved",f,"->",m[1]);bad++;}}}
if(bad)process.exit(1);console.log("bundle imports OK");'
du -sh dist
