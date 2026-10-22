// Crawl website đã xuất bản: mọi trang trong sitemap + mọi liên kết nội bộ/tài nguyên phải trả về 200.
// node tools/check-live.mjs [base-url]
const BASE = process.argv[2] || 'https://mekongaidnhk-blip.github.io/so-tay-rag/';
const seen = new Map();
const queue = [];
const bad = [];
async function get(u) {
  const r = await fetch(u, { redirect: 'follow' });
  return { status: r.status, type: r.headers.get('content-type') || '', text: (r.headers.get('content-type') || '').includes('html') ? await r.text() : '' };
}
const sm = await (await fetch(BASE + 'sitemap.xml')).text();
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) queue.push([m[1], 'sitemap']);
queue.push([BASE + 'search-index.json', 'app.js'], [BASE + 'robots.txt', 'root'], [BASE + 'khong-ton-tai/', 'test-404']);
while (queue.length) {
  const [u, from] = queue.shift();
  if (seen.has(u)) continue;
  seen.set(u, true);
  const r = await get(u);
  const expect = from === 'test-404' ? 404 : 200;
  if (r.status !== expect) bad.push(`[${r.status}] ${u} (từ ${from})`);
  if (!r.text || from === 'test-404') continue;
  for (const m of r.text.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (/^(mailto:|data:)/.test(raw)) continue;
    const abs = new URL(raw, u).href.split('?')[0];
    if (abs.startsWith(BASE) && !seen.has(abs)) queue.push([abs, u.replace(BASE, '/')]);
  }
}
console.log(`Đã kiểm tra ${seen.size} URL nội bộ trên ${BASE}`);
console.log(bad.length ? 'Lỗi:\n  ' + bad.join('\n  ') : 'Tất cả trả về đúng mã trạng thái (trang 404 thử nghiệm trả 404).');
