// Kiểm tra mọi liên kết ngoài trong dist/ (chạy sau node build.mjs).
// node tools/check-external.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const urls = new Map();
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/href="(https?:\/\/[^"]+)"/g)) {
        const u = m[1].replace(/&amp;/g, '&');
        if (u.includes('github.io/so-tay-rag') || u.includes('github.com/mekongaidnhk-blip/so-tay-rag')) continue;
        if (!urls.has(u)) urls.set(u, path.relative(DIST, p));
      }
    }
  }
})(DIST);

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 so-tay-rag-linkcheck';
async function check(u) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(u, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
      clearTimeout(t);
      if (r.ok) return { ok: true, status: r.status };
      if (method === 'GET') return { ok: false, status: r.status };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: e.name === 'AbortError' ? 'timeout' : e.message };
    }
  }
}
const list = [...urls.keys()];
const bad = [];
let i = 0;
async function worker() {
  while (i < list.length) {
    const u = list[i++];
    const r = await check(u);
    if (!r.ok) bad.push([u, r.status, urls.get(u)]);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Đã kiểm tra ${list.length} URL ngoài.`);
if (bad.length) {
  console.log('Có vấn đề:');
  for (const [u, s, f] of bad) console.log(`  [${s}] ${u}  (trong ${f})`);
  process.exitCode = 1;
} else console.log('Tất cả liên kết ngoài phản hồi OK.');
