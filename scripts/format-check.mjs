import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['src', 'test', 'scripts'];
let ok = true;
function walk(dir) {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|js|mjs|json|md|yml|yaml)$/.test(p)) {
      const s = readFileSync(p, 'utf8');
      if (!s.endsWith('\n')) { console.error(`${p}: missing trailing newline`); ok = false; }
      if (/\t/.test(s)) { console.error(`${p}: tab character found`); ok = false; }
    }
  }
}
for (const r of roots) walk(r);
process.exit(ok ? 0 : 1);
