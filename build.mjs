// Trình build tĩnh không phụ thuộc thư viện ngoài.
// node build.mjs  -> sinh thư mục dist/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
const SITE = JSON.parse(fs.readFileSync(path.join(CONTENT, 'site.json'), 'utf8'));
const NAV = JSON.parse(fs.readFileSync(path.join(CONTENT, 'nav.json'), 'utf8'));
const errors = [];
const warn = (m) => errors.push(m);

// Nguồn: gộp mọi file content/sources/*.json, phát hiện trùng id / trùng URL
const SOURCES = {};
{
  const dir = path.join(CONTENT, 'sources');
  const seenUrl = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { throw new Error(`sources/${f}: ${e.message}`); }
    for (const [k, v] of Object.entries(obj)) {
      if (SOURCES[k]) warn(`Nguồn trùng id "${k}" (sources/${f})`);
      if (!v.url || !v.title) warn(`Nguồn "${k}" thiếu url/title`);
      const u = String(v.url).replace(/\/$/, '').replace(/^http:/, 'https:');
      if (seenUrl[u]) warn(`Nguồn "${k}" trùng URL với "${seenUrl[u]}"`);
      seenUrl[u] = k;
      SOURCES[k] = v;
    }
  }
}

// ---------- tiện ích ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function slugify(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const stripTags = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

function readPage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) throw new Error('Thiếu front matter: ' + file);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error('Front matter JSON lỗi trong ' + file + ': ' + e.message); }
  return { meta, body: m[2] };
}

// ---------- nạp trang ----------
// id trang = đường dẫn tương đối không đuôi, ví dụ "nen-tang/rag-la-gi"; "index" là trang chủ.
const pages = new Map();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) {
      const id = path.relative(CONTENT, p).replace(/\\/g, '/').replace(/\.html$/, '');
      const { meta, body } = readPage(p);
      pages.set(id, { id, meta, body, file: p });
    }
  }
}
walk(CONTENT);

// Thứ tự đọc toàn cục theo nav.json
const order = [];
for (const sec of NAV.sections) {
  for (const pid of sec.pages) {
    const id = `${sec.id}/${pid}`;
    if (!pages.has(id)) warn(`nav.json nhắc tới trang không tồn tại: ${id}`);
    else { order.push(id); pages.get(id).section = sec; }
  }
}
for (const [id, p] of pages) {
  if (id.includes('/') && !p.section && !p.meta.standalone) warn(`Trang ${id} không có trong nav.json`);
}

const urlOf = (id) => (id === 'index' ? '' : id + '/');
const depthOf = (id) => (id === 'index' || id === '404' ? 0 : id.split('/').length);
function rel(fromId, toUrl) {
  if (fromId === '404') return SITE.basePath + toUrl;
  const up = '../'.repeat(depthOf(fromId));
  return (up + toUrl) || './';
}
function titleOf(id) {
  if (pages.has(id)) return pages.get(id).meta.title;
  const sec = NAV.sections.find((s) => s.id === id);
  if (sec) return sec.title;
  return null;
}
function existsTarget(id) {
  return pages.has(id) || NAV.sections.some((s) => s.id === id);
}

// ---------- shortcode ----------
function renderBody(page) {
  let html = page.body;
  const citeOrder = [];
  // [[cite:a,b]]
  html = html.replace(/\[\[cite:([^\]]+)\]\]/g, (_, ids) => {
    const parts = ids.split(',').map((s) => s.trim()).filter(Boolean);
    const links = parts.map((sid) => {
      if (!SOURCES[sid]) { warn(`${page.id}: nguồn không tồn tại "${sid}"`); return '[?]'; }
      if (!citeOrder.includes(sid)) citeOrder.push(sid);
      const n = citeOrder.indexOf(sid) + 1;
      return `<a href="#ref-${sid}" id="cite-${sid}-${n}" title="${esc(SOURCES[sid].title)}">${n}</a>`;
    });
    return `<sup class="cite">[${links.join(', ')}]</sup>`;
  });
  // [[link:id#hash|text]]
  html = html.replace(/\[\[link:([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, id, hash, text) => {
    id = id.trim();
    if (!existsTarget(id)) { warn(`${page.id}: liên kết hỏng tới "${id}"`); return text || id; }
    return `<a href="${rel(page.id, urlOf(id))}${hash || ''}">${text || esc(titleOf(id))}</a>`;
  });
  // [[src:id]] -> liên kết trực tiếp tới nguồn (dùng trong bảng)
  html = html.replace(/\[\[src:([^\]]+)\]\]/g, (_, sid) => {
    sid = sid.trim();
    if (!SOURCES[sid]) { warn(`${page.id}: nguồn không tồn tại "${sid}"`); return sid; }
    if (!citeOrder.includes(sid)) citeOrder.push(sid);
    return `<a href="#ref-${sid}">${esc(SOURCES[sid].short || SOURCES[sid].title)}</a>`;
  });
  // [[sections]] -> lưới các phần (dùng ở trang chủ)
  html = html.replace(/\[\[sections\]\]/g, () => `<ul class="sec-grid">${NAV.sections.map((s) => `<li><a class="sec-card" href="${rel(page.id, s.id + '/')}"><span class="num">PHẦN ${s.num}</span><span class="t">${esc(s.title)}</span><span class="d">${s.intro}</span><span class="c">${s.pages.length} bài</span></a></li>`).join('')}</ul>`);
  // {{root}} -> tiền tố tương đối về gốc
  html = html.replace(/\{\{root\}\}/g, '../'.repeat(depthOf(page.id)));

  // gắn id cho h2/h3 và dựng mục lục
  const toc = [];
  const used = new Set();
  html = html.replace(/<(h[23])([^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, inner) => {
    let id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (!id) {
      id = slugify(inner) || 'muc';
      let k = id, i = 2; while (used.has(k)) k = `${id}-${i++}`; id = k;
      attrs += ` id="${id}"`;
    }
    used.add(id);
    toc.push({ level: tag === 'h2' ? 2 : 3, id, text: stripTags(inner) });
    return `<${tag}${attrs}><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</${tag}>`;
  });
  // kiểm tra liên kết neo nội bộ
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    const a = m[1];
    if (a.startsWith('ref-') || used.has(a)) continue;
    if (!new RegExp(`id="${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html)) warn(`${page.id}: neo #${a} không tồn tại`);
  }
  return { html, toc, citeOrder };
}

function renderRefs(page, citeOrder) {
  if (!citeOrder.length) return '';
  const items = citeOrder.map((sid) => {
    const s = SOURCES[sid];
    return `<li id="ref-${sid}">${fmtSource(s)} <a class="ref-more" href="${rel(page.id, 'tra-cuu/nguon-tham-khao/')}#src-${sid}" title="Xem trong thư mục nguồn">↗ thư mục</a></li>`;
  });
  return `<section class="refs" aria-labelledby="tai-lieu-tham-khao"><h2 id="tai-lieu-tham-khao">Tài liệu tham khảo</h2><ol>${items.join('')}</ol></section>`;
}
function fmtSource(s) {
  const kind = s.kind ? `<span class="src-kind src-${slugify(s.kind)}">${esc(s.kind)}</span> ` : '';
  const authors = s.authors ? `${esc(s.authors)} ` : '';
  const year = s.year ? `(${esc(s.year)}). ` : '';
  const venue = s.venue ? ` <span class="venue">${esc(s.venue)}</span>.` : '';
  const note = s.note ? ` <span class="src-note">${esc(s.note)}</span>` : '';
  return `${kind}${authors}${year}<a href="${esc(s.url)}" rel="noopener" target="_blank"><cite>${esc(s.title)}</cite></a>.${venue}${note}`;
}

// ---------- layout ----------
const KIND_LABEL = { 'nen-tang': 'Nền tảng', 'nghien-cuu': 'Kết quả nghiên cứu', 'kinh-nghiem': 'Kinh nghiệm triển khai', 'nhan-dinh': 'Nhận định biên soạn' };

function sidebar(curId) {
  const secs = NAV.sections.map((sec) => {
    const open = curId.startsWith(sec.id + '/') || curId === sec.id;
    const items = sec.pages.map((pid) => {
      const id = `${sec.id}/${pid}`;
      const p = pages.get(id); if (!p) return '';
      const cur = id === curId ? ' aria-current="page"' : '';
      return `<li><a href="${rel(curId, urlOf(id))}"${cur}>${esc(p.meta.navTitle || p.meta.title)}</a></li>`;
    }).join('');
    return `<li class="nav-sec${open ? ' open' : ''}"><a class="nav-sec-title" href="${rel(curId, sec.id + '/')}"${curId === sec.id ? ' aria-current="page"' : ''}><span class="num">${sec.num}</span>${esc(sec.title)}</a><ul>${items}</ul></li>`;
  }).join('');
  const top = [['lo-trinh', 'Lộ trình học'], ['tra-cuu/thuat-ngu', 'Thuật ngữ'], ['tra-cuu/nguon-tham-khao', 'Thư mục nguồn'], ['gioi-thieu', 'Giới thiệu & phương pháp']]
    .map(([id, t]) => `<li><a href="${rel(curId, urlOf(id))}"${id === curId ? ' aria-current="page"' : ''}>${t}</a></li>`).join('');
  return `<nav class="sidebar" id="sidebar" aria-label="Mục lục website"><ul class="nav-top">${top}</ul><ul class="nav-secs">${secs}</ul></nav>`;
}

function layout({ id, title, description, content, toc = [], bodyClass = '' }) {
  const root = id === '404' ? SITE.basePath : '../'.repeat(depthOf(id));
  const fullTitle = id === 'index' ? `${SITE.name} — ${SITE.tagline}` : `${title} · ${SITE.name}`;
  const canonical = SITE.url + urlOf(id);
  const tocHtml = toc.length > 2 ? `<aside class="toc" aria-label="Trong bài này"><details open><summary>Trong bài này</summary><ol>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></details></aside>` : '';
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || SITE.description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title || SITE.name)}">
<meta property="og:description" content="${esc(description || SITE.description)}">
<meta property="og:type" content="${id.includes('/') ? 'article' : 'website'}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="vi_VN">
<meta name="theme-color" content="#0f5c4d">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/style.css?v=${SITE.version}">
<script>document.documentElement.classList.add('js');try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body class="${bodyClass}" data-root="${root}">
<a class="skip" href="#noi-dung">Bỏ qua tới nội dung</a>
<header class="topbar">
  <button class="icon-btn menu-btn" id="menu-btn" aria-controls="sidebar" aria-expanded="false" aria-label="Mở mục lục"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  <a class="brand" href="${root || './'}"><img src="${root}assets/favicon.svg" alt="" width="28" height="28"><span>${esc(SITE.name)}</span></a>
  <div class="top-actions">
    <button class="search-btn" id="search-btn" aria-haspopup="dialog" aria-label="Tìm kiếm"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="search-label">Tìm kiếm</span><kbd>/</kbd></button>
    <button class="icon-btn" id="theme-btn" aria-label="Đổi giao diện sáng/tối"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" fill="currentColor"/></svg></button>
  </div>
</header>
<div class="shell">
${sidebar(id)}
<div class="nav-backdrop" id="nav-backdrop" hidden></div>
<main id="noi-dung" class="main" tabindex="-1">
${tocHtml}
${content}
</main>
</div>
<footer class="footer">
  <div class="footer-inner">
    <p><strong>${esc(SITE.name)}</strong> — ${esc(SITE.tagline)}</p>
    <p>Nội dung phát hành theo <a href="https://creativecommons.org/licenses/by/4.0/deed.vi" rel="license noopener">CC BY 4.0</a>. Mã nguồn: <a href="${SITE.repo}" rel="noopener">GitHub</a>. Phát hiện sai sót? <a href="${SITE.repo}/issues" rel="noopener">Báo lỗi tại đây</a>.</p>
    <p><a href="${root}gioi-thieu/">Giới thiệu & phương pháp biên soạn</a> · <a href="${root}tra-cuu/nguon-tham-khao/">Thư mục nguồn</a> · Cập nhật lần cuối: ${SITE.updated}</p>
  </div>
</footer>
<div class="search-dialog" id="search-dialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm" hidden>
  <div class="search-box">
    <div class="search-input-row"><input id="search-input" type="search" placeholder="Tìm chủ đề, thuật ngữ… (ví dụ: reranking, chunk, HNSW)" autocomplete="off" aria-label="Từ khóa tìm kiếm"><button class="icon-btn" id="search-close" aria-label="Đóng tìm kiếm">✕</button></div>
    <ul id="search-results" class="search-results" aria-live="polite"></ul>
  </div>
</div>
<script src="${root}assets/app.js?v=${SITE.version}" defer></script>
</body>
</html>`;
}

function breadcrumbs(page) {
  const parts = [`<a href="${rel(page.id, '')}">Trang chủ</a>`];
  if (page.section) parts.push(`<a href="${rel(page.id, page.section.id + '/')}">${esc(page.section.title)}</a>`);
  return `<nav class="crumbs" aria-label="Vị trí">${parts.join('<span aria-hidden="true">›</span>')}</nav>`;
}

function prevNext(id) {
  const i = order.indexOf(id);
  if (i < 0) return '';
  const prev = order[i - 1], next = order[i + 1];
  const card = (pid, label, cls) => {
    const p = pages.get(pid);
    return `<a class="pn ${cls}" href="${rel(id, urlOf(pid))}"><span class="pn-label">${label}</span><span class="pn-title">${esc(p.meta.title)}</span><span class="pn-sec">${esc(p.section.title)}</span></a>`;
  };
  return `<nav class="prevnext" aria-label="Bài trước và bài tiếp theo">${prev ? card(prev, '← Bài trước', 'prev') : '<span></span>'}${next ? card(next, 'Bài tiếp theo →', 'next') : `<a class="pn next" href="${rel(id, 'lo-trinh/')}"><span class="pn-label">Hoàn thành chương trình →</span><span class="pn-title">Quay lại lộ trình học</span></a>`}</nav>`;
}

function articleMeta(page, text) {
  const words = text.split(/\s+/).length;
  const mins = Math.max(2, Math.round(words / 220));
  const m = page.meta;
  const bits = [];
  if (m.level) bits.push(`<span class="badge lvl">${esc(m.level)}</span>`);
  bits.push(`<span>${mins} phút đọc</span>`);
  if (m.reviewed) bits.push(`<span>Rà soát: <time datetime="${m.reviewed}">${fmtDate(m.reviewed)}</time></span>`);
  return `<div class="meta">${bits.join('<span class="dot" aria-hidden="true">·</span>')}</div>`;
}
const fmtDate = (d) => { const [y, mo, da] = d.split('-'); return `${da}/${mo}/${y}`; };

// ---------- render ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const searchIndex = [];
const citedBy = {}; // sid -> [page ids]

function writePage(id, html) {
  const out = id === 'index' ? path.join(DIST, 'index.html') : id === '404' ? path.join(DIST, '404.html') : path.join(DIST, id, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}

// Render các trang nội dung (trừ thư mục nguồn - render sau khi biết citedBy)
const rendered = new Map();
for (const [id, page] of pages) {
  const r = renderBody(page);
  rendered.set(id, r);
  for (const sid of r.citeOrder) (citedBy[sid] ||= []).push(id);
}

for (const [id, page] of pages) {
  if (id === 'tra-cuu/nguon-tham-khao') continue;
  const { html, toc, citeOrder } = rendered.get(id);
  const text = stripTags(html);
  let content;
  if (page.meta.layout === 'plain') {
    content = html;
  } else {
    const kinds = (page.meta.kinds || []).length ? `<p class="kinds-legend">Bài này có: ${page.meta.kinds.map((k) => `<span class="kind-tag k-${k}">${KIND_LABEL[k]}</span>`).join(' ')}</p>` : '';
    content = `<article class="article">
${page.section || page.meta.crumbs !== false ? breadcrumbs(page) : ''}
<header class="article-head">
${page.section ? `<p class="eyebrow">Phần ${page.section.num} · ${esc(page.section.title)}</p>` : ''}
<h1>${page.meta.title}</h1>
${page.meta.lead ? `<p class="lead">${page.meta.lead}</p>` : ''}
${articleMeta(page, text)}
${kinds}
</header>
<div class="prose">
${html}
</div>
${renderRefs(page, citeOrder)}
${prevNext(id)}
</article>`;
  }
  writePage(id, layout({ id, title: stripTags(page.meta.title), description: page.meta.description, content, toc: page.meta.layout === 'plain' ? [] : toc, bodyClass: page.meta.bodyClass || '' }));
  if (id !== '404') searchIndex.push({ u: urlOf(id), t: stripTags(page.meta.title), s: page.section ? page.section.title : '', d: page.meta.description || '', h: toc.map((t) => t.text), x: text.slice(0, 6000) });
}

// Trang chủ đề (section landing)
for (const sec of NAV.sections) {
  const id = sec.id;
  const list = sec.pages.map((pid) => {
    const p = pages.get(`${sec.id}/${pid}`); if (!p) return '';
    return `<li><a class="topic-card" href="${rel(id, urlOf(`${sec.id}/${pid}`))}"><span class="tc-title">${esc(p.meta.title)}</span><span class="tc-desc">${esc(p.meta.description || '')}</span>${p.meta.level ? `<span class="badge lvl">${esc(p.meta.level)}</span>` : ''}</a></li>`;
  }).join('');
  const qs = (sec.questions || []).map((q) => `<li>${q}</li>`).join('');
  const i = NAV.sections.indexOf(sec);
  const prev = NAV.sections[i - 1], next = NAV.sections[i + 1];
  const pn = `<nav class="prevnext">${prev ? `<a class="pn prev" href="${rel(id, prev.id + '/')}"><span class="pn-label">← Phần ${prev.num}</span><span class="pn-title">${esc(prev.title)}</span></a>` : '<span></span>'}${next ? `<a class="pn next" href="${rel(id, next.id + '/')}"><span class="pn-label">Phần ${next.num} →</span><span class="pn-title">${esc(next.title)}</span></a>` : '<span></span>'}</nav>`;
  const content = `<article class="article section-page">
<nav class="crumbs" aria-label="Vị trí"><a href="${rel(id, '')}">Trang chủ</a><span aria-hidden="true">›</span><span>Phần ${sec.num}</span></nav>
<header class="article-head"><p class="eyebrow">Phần ${sec.num}</p><h1>${esc(sec.title)}</h1><p class="lead">${sec.intro}</p></header>
${qs ? `<section class="questions"><h2 id="cau-hoi">Phần này trả lời câu hỏi gì?</h2><ul>${qs}</ul></section>` : ''}
<h2 id="cac-bai">Các bài trong phần này</h2>
<ol class="topic-list">${list}</ol>
${sec.prereq ? `<p class="prereq"><strong>Nên đọc trước:</strong> ${sec.prereq.replace(/\[\[link:([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, tx) => { if (!existsTarget(t)) warn('nav prereq hỏng ' + t); return `<a href="${rel(id, urlOf(t))}">${tx || esc(titleOf(t))}</a>`; })}</p>` : ''}
${pn}
</article>`;
  writePage(id + '/x', ''); // tạo thư mục
  fs.rmSync(path.join(DIST, id, 'x'), { recursive: true, force: true });
  fs.writeFileSync(path.join(DIST, id, 'index.html'), layout({ id, title: sec.title, description: stripTags(sec.intro), content }));
  searchIndex.push({ u: urlOf(id), t: sec.title, s: 'Chủ đề', d: stripTags(sec.intro), h: [], x: stripTags(qs) });
}

// Thư mục nguồn
{
  const id = 'tra-cuu/nguon-tham-khao';
  const page = pages.get(id);
  const groups = {};
  for (const [sid, s] of Object.entries(SOURCES)) (groups[s.group || 'Khác'] ||= []).push([sid, s]);
  const groupOrder = SITE.sourceGroups;
  const unused = Object.keys(SOURCES).filter((s) => !citedBy[s]);
  if (unused.length) console.log('Ghi chú: nguồn chưa được trích dẫn ở bài nào:', unused.join(', '));
  const body = groupOrder.filter((g) => groups[g]).map((g) => {
    const items = groups[g].sort((a, b) => String(a[1].year).localeCompare(String(b[1].year))).map(([sid, s]) => {
      const by = (citedBy[sid] || []).filter((p) => p !== id).map((p) => `<a href="${rel(id, urlOf(p))}">${esc(stripTags(pages.get(p).meta.title))}</a>`).join(', ');
      return `<li id="src-${sid}">${fmtSource(s)}${s.why ? `<p class="src-why">${s.why}</p>` : ''}${by ? `<p class="src-by">Được dùng trong: ${by}</p>` : ''}</li>`;
    }).join('');
    return `<h2 id="${slugify(g)}">${esc(g)}</h2><ul class="biblio">${items}</ul>`;
  }).join('');
  const missing = Object.keys(groups).filter((g) => !groupOrder.includes(g));
  if (missing.length) warn('Nhóm nguồn chưa khai báo trong site.json: ' + missing.join(', '));
  const { html } = rendered.get(id);
  const toc = groupOrder.filter((g) => groups[g]).map((g) => ({ level: 2, id: slugify(g), text: g }));
  const content = `<article class="article">${breadcrumbs(page)}<header class="article-head"><h1>${page.meta.title}</h1><p class="lead">${page.meta.lead}</p>${articleMeta(page, '')}</header><div class="prose">${html}${body}</div></article>`;
  writePage(id, layout({ id, title: page.meta.title, description: page.meta.description, content, toc }));
  searchIndex.push({ u: urlOf(id), t: page.meta.title, s: 'Tra cứu', d: page.meta.description, h: [], x: stripTags(body).slice(0, 8000) });
}

// Tài sản tĩnh
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify(searchIndex));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}sitemap.xml\n`);
const urls = ['index', 'lo-trinh', ...NAV.sections.map((s) => s.id), ...order, 'tra-cuu/thuat-ngu', 'tra-cuu/nguon-tham-khao', 'gioi-thieu'];
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE.url}${urlOf(u)}</loc><lastmod>${SITE.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);

// Kiểm tra liên kết tương đối trong toàn bộ dist
function checkLinks() {
  const files = [];
  (function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) w(p); else if (f.endsWith('.html')) files.push(p); } })(DIST);
  for (const f of files) {
    if (f.endsWith('404.html')) continue;
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      let u = m[1];
      if (/^(https?:|mailto:|#|data:)/.test(u)) continue;
      u = u.split('#')[0].split('?')[0];
      if (!u) continue;
      let target = path.resolve(path.dirname(f), u);
      if (u.endsWith('/') || u === '.' || u === './') target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) warn(`Liên kết hỏng trong ${path.relative(DIST, f)}: ${m[1]}`);
    }
  }
  return files.length;
}
const n = checkLinks();

if (errors.length) {
  console.error('LỖI BUILD:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`Build OK: ${n} trang HTML, ${Object.keys(SOURCES).length} nguồn, ${order.length} bài trong lộ trình.`);
