/* Sổ tay RAG — tương tác phía trình duyệt (không phụ thuộc thư viện). */
(function () {
  'use strict';
  var root = document.body.getAttribute('data-root') || '';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fold = function (s) { return String(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase(); };

  // ---------- Menu di động ----------
  var sidebar = $('#sidebar'), menuBtn = $('#menu-btn'), backdrop = $('#nav-backdrop');
  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    backdrop.hidden = !open;
    if (open) { var cur = $('a[aria-current="page"]', sidebar); (cur || $('a', sidebar)).focus(); }
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!sidebar.classList.contains('open')); });
    backdrop.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sidebar.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });
  }
  // Cuộn sidebar tới mục hiện tại
  var curLink = sidebar && $('a[aria-current="page"]', sidebar);
  if (curLink && window.matchMedia('(min-width: 1000px)').matches) {
    var r = curLink.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 40) sidebar.scrollTop = r.top - 160;
  }

  // ---------- Giao diện sáng/tối ----------
  var themeBtn = $('#theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var html = document.documentElement;
    var dark = html.dataset.theme ? html.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', html.dataset.theme); } catch (e) {}
  });

  // ---------- Bảng cuộn ngang & nút copy ----------
  $$('.prose table').forEach(function (t) {
    if (t.parentElement.classList.contains('table-wrap')) return;
    var w = document.createElement('div'); w.className = 'table-wrap'; w.tabIndex = 0;
    t.parentNode.insertBefore(w, t); w.appendChild(t);
  });
  $$('.prose pre').forEach(function (pre) {
    if (!navigator.clipboard) return;
    var b = document.createElement('button'); b.className = 'copy-btn'; b.type = 'button'; b.textContent = 'Sao chép';
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(pre.innerText.replace(/Sao chép$|Đã chép$/, '').trim()).then(function () { b.textContent = 'Đã chép'; setTimeout(function () { b.textContent = 'Sao chép'; }, 1500); });
    });
    pre.appendChild(b);
  });

  // ---------- Mục lục: đánh dấu mục đang đọc ----------
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {}; tocLinks.forEach(function (a) { var k = a.getAttribute('href').slice(1); (map[k] = map[k] || []).push(a); });
    var heads = $$('.prose h2[id], .prose h3[id]');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) { tocLinks.forEach(function (a) { a.classList.remove('active'); }); map[en.target.id].forEach(function (a) { a.classList.add('active'); }); }
      });
    }, { rootMargin: '-60px 0px -70% 0px' });
    heads.forEach(function (h) { obs.observe(h); });
  }

  // ---------- Tìm kiếm ----------
  var dlg = $('#search-dialog'), input = $('#search-input'), results = $('#search-results'), idx = null, lastFocus = null, sel = -1;
  function openSearch() {
    lastFocus = document.activeElement; dlg.hidden = false; input.focus(); input.select();
    if (!idx) fetch(root + 'search-index.json').then(function (r) { return r.json(); }).then(function (d) {
      idx = d.map(function (p) { return { p: p, t: fold(p.t), d: fold(p.d), h: fold(p.h.join(' | ')), x: fold(p.x) }; });
      run();
    }).catch(function () { results.innerHTML = '<li class="empty">Không tải được chỉ mục tìm kiếm.</li>'; });
  }
  function closeSearch() { dlg.hidden = true; if (lastFocus) lastFocus.focus(); }
  function snippet(p, terms) {
    var fx = fold(p.x), pos = -1;
    for (var i = 0; i < terms.length && pos < 0; i++) pos = fx.indexOf(terms[i]);
    if (pos < 0) return esc(p.d);
    var s = Math.max(0, pos - 60), raw = p.x.slice(s, s + 180);
    var out = esc((s > 0 ? '…' : '') + raw + '…');
    terms.forEach(function (t) {
      // tô sáng không phân biệt dấu: dựa trên vị trí trong chuỗi đã gập dấu (cùng độ dài với NFC tiếng Việt đơn giản)
      var f = fold(out), j = f.indexOf(t);
      if (j >= 0 && t.length > 1) out = out.slice(0, j) + '<mark>' + out.slice(j, j + t.length) + '</mark>' + out.slice(j + t.length);
    });
    return out;
  }
  function run() {
    if (!idx) { results.innerHTML = '<li class="empty">Đang tải…</li>'; return; }
    var q = fold(input.value.trim());
    sel = -1;
    if (!q) { results.innerHTML = '<li class="empty">Gõ từ khóa, ví dụ: <em>chunk</em>, <em>hybrid</em>, <em>đánh giá</em>, <em>prompt injection</em>.</li>'; return; }
    var terms = q.split(/\s+/).filter(Boolean);
    var scored = idx.map(function (e) {
      var sc = 0, all = true;
      terms.forEach(function (t) {
        var s = 0;
        if (e.t.indexOf(t) >= 0) s += 12;
        if (e.h.indexOf(t) >= 0) s += 5;
        if (e.d.indexOf(t) >= 0) s += 3;
        var c = e.x.split(t).length - 1; if (c) s += Math.min(6, 1 + Math.log(c + 1) * 1.5);
        if (!s) all = false; sc += s;
      });
      if (e.t.indexOf(q) >= 0) sc += 10;
      return { e: e, sc: all ? sc : sc * 0.3 };
    }).filter(function (r) { return r.sc > 1; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 12);
    if (!scored.length) { results.innerHTML = '<li class="empty">Không tìm thấy kết quả cho “' + esc(input.value) + '”. Thử từ khóa ngắn hơn hoặc xem <a href="' + root + 'tra-cuu/thuat-ngu/">bảng thuật ngữ</a>.</li>'; return; }
    results.innerHTML = scored.map(function (r) {
      var p = r.e.p;
      return '<li><a href="' + root + p.u + '"><span class="r-s">' + esc(p.s) + '</span> <span class="r-t">' + esc(p.t) + '</span><span class="r-x">' + snippet(p, terms) + '</span></a></li>';
    }).join('');
  }
  if (dlg) {
    $('#search-btn').addEventListener('click', openSearch);
    $('#search-close').addEventListener('click', closeSearch);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeSearch(); });
    input.addEventListener('input', run);
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && dlg.hidden && tag !== 'input' && tag !== 'textarea' && tag !== 'select') { e.preventDefault(); openSearch(); }
      else if (!dlg.hidden) {
        var links = $$('a', results);
        if (e.key === 'Escape') closeSearch();
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (!links.length) return;
          sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
          links.forEach(function (a, i) { a.classList.toggle('sel', i === sel); }); links[sel].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && sel >= 0 && links[sel] && document.activeElement === input) { e.preventDefault(); links[sel].click(); }
        else if (e.key === 'Tab') { // giữ focus trong hộp thoại
          var f = [input, $('#search-close')].concat(links), i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      }
    });
  }

  // =====================================================================
  // Widget tương tác: <div class="widget" data-widget="..."></div>
  // =====================================================================
  var W = {};

  // ---- 1. Chunking ----
  var SAMPLE = 'Chính sách đổi trả\n\nKhách hàng được đổi trả sản phẩm trong vòng 30 ngày kể từ ngày nhận hàng. Sản phẩm phải còn nguyên tem, nhãn và hóa đơn mua hàng. Hàng giảm giá trên 50% không áp dụng đổi trả.\n\nQuy trình hoàn tiền\n\nSau khi kho nhận và kiểm tra hàng trả lại, tiền được hoàn về phương thức thanh toán ban đầu trong 5–7 ngày làm việc. Với thanh toán khi nhận hàng (COD), tiền được chuyển khoản vào tài khoản ngân hàng do khách cung cấp.\n\nTrường hợp ngoại lệ\n\nSản phẩm lỗi do nhà sản xuất được đổi mới trong 12 tháng, không cần hóa đơn nếu có phiếu bảo hành. Thực phẩm và mỹ phẩm đã mở nắp không được đổi trả vì lý do vệ sinh.';
  function splitSentences(t) { return t.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [t]; }
  function chunkFixed(t, size, ov) {
    var out = [], step = Math.max(1, size - ov);
    for (var i = 0; i < t.length; i += step) { out.push({ s: i, e: Math.min(t.length, i + size) }); if (i + size >= t.length) break; }
    return out;
  }
  function packUnits(units, size, ov) {
    // ghép các đơn vị (câu/đoạn) liên tiếp tới khi vượt size; overlap = lùi lại các đơn vị cuối có tổng ≤ ov
    var out = [], i = 0, pos = [], p = 0;
    units.forEach(function (u) { pos.push(p); p += u.length; });
    while (i < units.length) {
      var j = i, len = 0;
      while (j < units.length && (len + units[j].length <= size || j === i)) { len += units[j].length; j++; }
      out.push({ s: pos[i], e: pos[j - 1] + units[j - 1].length });
      if (j >= units.length) break;
      var k = j, back = 0;
      while (k - 1 > i && back + units[k - 1].length <= ov) { back += units[k - 1].length; k--; }
      i = k;
    }
    return out;
  }
  W.chunker = function (el) {
    el.innerHTML = '<p class="widget-title">Cắt tài liệu thành chunk</p><p class="widget-note">Thay văn bản, chọn chiến lược và kích thước để thấy ranh giới chunk thay đổi thế nào. Phần tô cam là vùng chồng lấp (overlap). Kích thước tính bằng ký tự cho dễ quan sát; hệ thống thật thường tính bằng token.</p>' +
      '<label for="ck-text">Văn bản</label><textarea id="ck-text"></textarea>' +
      '<div class="row"><div><label for="ck-mode">Chiến lược</label><select id="ck-mode"><option value="fixed">Cố định theo ký tự</option><option value="sent" selected>Theo câu (gộp tới giới hạn)</option><option value="para">Theo đoạn (rơi xuống câu nếu quá dài)</option></select></div>' +
      '<div><label for="ck-size">Kích thước tối đa: <b id="ck-size-v"></b> ký tự</label><input id="ck-size" type="range" min="80" max="800" step="20" value="260"></div>' +
      '<div><label for="ck-ov">Overlap: <b id="ck-ov-v"></b> ký tự</label><input id="ck-ov" type="range" min="0" max="200" step="10" value="40"></div></div>' +
      '<div class="out" aria-live="polite"><div id="ck-stats"></div><div id="ck-out"></div></div>';
    var ta = $('#ck-text', el), mode = $('#ck-mode', el), size = $('#ck-size', el), ov = $('#ck-ov', el);
    ta.value = SAMPLE;
    function render() {
      var t = ta.value, sz = +size.value, o = Math.min(+ov.value, sz - 20), m = mode.value, ch;
      $('#ck-size-v', el).textContent = sz; $('#ck-ov-v', el).textContent = o;
      if (m === 'fixed') ch = chunkFixed(t, sz, o);
      else if (m === 'sent') ch = packUnits(splitSentences(t), sz, o);
      else {
        var paras = t.split(/(\n\s*\n)/), units = [];
        for (var i = 0; i < paras.length; i++) { if (paras[i].length > sz) units = units.concat(splitSentences(paras[i])); else units.push(paras[i]); }
        ch = packUnits(units.filter(function (u) { return u.length; }), sz, o);
      }
      ch = ch.filter(function (c) { return t.slice(c.s, c.e).trim(); });
      var cut = 0;
      var html = ch.map(function (c, n) {
        var prevEnd = n ? ch[n - 1].e : 0, ovEnd = Math.min(c.e, Math.max(c.s, prevEnd));
        var txt = esc(t.slice(c.s, ovEnd)) ? '<span class="ov">' + esc(t.slice(c.s, ovEnd)) + '</span>' : '';
        var body = t.slice(ovEnd, c.e);
        if (m === 'fixed' && c.e < t.length && /\S/.test(t[c.e] || '') && /\S/.test(t[c.e - 1] || '')) cut++;
        return '<div class="chunk"><span class="chunk-head">#' + (n + 1) + ' · ' + (c.e - c.s) + ' ký tự</span>' + txt + esc(body) + '</div>';
      }).join('');
      var avg = ch.length ? Math.round(ch.reduce(function (a, c) { return a + c.e - c.s; }, 0) / ch.length) : 0;
      var total = ch.reduce(function (a, c) { return a + c.e - c.s; }, 0);
      $('#ck-stats', el).innerHTML = '<span class="stat">Số chunk: <b>' + ch.length + '</b></span><span class="stat">TB: <b>' + avg + '</b> ký tự</span><span class="stat">Tăng dung lượng do overlap: <b>' + (t.length ? Math.round((total / t.length - 1) * 100) : 0) + '%</b></span>' + (m === 'fixed' ? '<span class="stat">Chunk cắt giữa từ: <b>' + cut + '</b></span>' : '');
      $('#ck-out', el).innerHTML = html;
    }
    [ta, mode, size, ov].forEach(function (x) { x.addEventListener('input', render); });
    render();
  };

  // ---- 2. Reciprocal Rank Fusion ----
  W.rrf = function (el) {
    el.innerHTML = '<p class="widget-title">Reciprocal Rank Fusion (RRF)</p><p class="widget-note">Nhập hai danh sách kết quả (mã tài liệu, cách nhau bằng dấu phẩy, theo thứ tự xếp hạng). RRF chỉ dùng thứ hạng, không dùng điểm gốc: điểm = Σ 1/(k + hạng).</p>' +
      '<div class="row"><div><label for="rrf-a">Kết quả BM25 (từ khóa)</label><input id="rrf-a" type="text" value="D3, D1, D7, D2, D9"></div><div><label for="rrf-b">Kết quả vector (ngữ nghĩa)</label><input id="rrf-b" type="text" value="D1, D5, D3, D8, D2"></div></div>' +
      '<div class="row"><div><label for="rrf-k">Hằng số k: <b id="rrf-kv"></b></label><input id="rrf-k" type="range" min="0" max="120" step="1" value="60"></div></div>' +
      '<div class="out" id="rrf-out" aria-live="polite"></div>';
    var a = $('#rrf-a', el), b = $('#rrf-b', el), k = $('#rrf-k', el);
    function parse(s) { var seen = {}; return s.split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; }); }
    function render() {
      var K = +k.value, la = parse(a.value), lb = parse(b.value), sc = {};
      $('#rrf-kv', el).textContent = K;
      la.forEach(function (d, i) { (sc[d] = sc[d] || { a: null, b: null, s: 0 }).a = i + 1; });
      lb.forEach(function (d, i) { (sc[d] = sc[d] || { a: null, b: null, s: 0 }).b = i + 1; });
      var rows = Object.keys(sc).map(function (d) { var r = sc[d]; r.s = (r.a ? 1 / (K + r.a) : 0) + (r.b ? 1 / (K + r.b) : 0); r.d = d; return r; }).sort(function (x, y) { return y.s - x.s; });
      $('#rrf-out', el).innerHTML = '<div class="table-wrap"><table class="rank-table"><thead><tr><th>#</th><th>Tài liệu</th><th>Hạng BM25</th><th>Hạng vector</th><th>Điểm RRF</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr' + (r.a && r.b ? ' class="hit"' : '') + '><td>' + (i + 1) + '</td><td><b>' + esc(r.d) + '</b></td><td>' + (r.a ? r.a + ' → 1/(' + K + '+' + r.a + ')' : '—') + '</td><td>' + (r.b ? r.b + ' → 1/(' + K + '+' + r.b + ')' : '—') + '</td><td>' + r.s.toFixed(4) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="widget-note">Dòng tô xanh: tài liệu xuất hiện ở cả hai danh sách. Thử kéo k về 0: tài liệu đứng đầu một danh sách được ưu tiên mạnh hơn; k lớn làm các hạng gần nhau có điểm gần nhau hơn.</p>';
    }
    [a, b, k].forEach(function (x) { x.addEventListener('input', render); });
    render();
  };

  // ---- 3. Chỉ số truy hồi ----
  W.metrics = function (el) {
    el.innerHTML = '<p class="widget-title">Tính Recall@k, Precision@k, MRR, nDCG@k</p><p class="widget-note">Nhập danh sách tài liệu hệ thống trả về (theo thứ tự) và tập tài liệu thực sự liên quan. Mức liên quan nhị phân (liên quan / không).</p>' +
      '<div class="row"><div><label for="m-ret">Kết quả truy hồi (theo thứ tự)</label><input id="m-ret" type="text" value="D4, D2, D9, D1, D7, D3"></div><div><label for="m-rel">Tài liệu liên quan (nhãn đúng)</label><input id="m-rel" type="text" value="D1, D2, D5"></div></div>' +
      '<div class="row"><div><label for="m-k">k = <b id="m-kv"></b></label><input id="m-k" type="range" min="1" max="10" value="5"></div></div><div class="out" id="m-out" aria-live="polite"></div>';
    var ret = $('#m-ret', el), rel = $('#m-rel', el), kk = $('#m-k', el);
    function parse(s) { return s.split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function render() {
      var R = parse(ret.value), G = {}, k = +kk.value; parse(rel.value).forEach(function (d) { G[d] = 1; });
      var nG = Object.keys(G).length; $('#m-kv', el).textContent = k;
      var top = R.slice(0, k), hits = top.filter(function (d) { return G[d]; }).length;
      var first = -1; for (var i = 0; i < R.length; i++) if (G[R[i]]) { first = i + 1; break; }
      var dcg = 0; top.forEach(function (d, i) { if (G[d]) dcg += 1 / Math.log2(i + 2); });
      var idcg = 0; for (var j = 0; j < Math.min(k, nG); j++) idcg += 1 / Math.log2(j + 2);
      var f = function (x) { return (Math.round(x * 1000) / 1000).toFixed(3); };
      $('#m-out', el).innerHTML = '<p>' + top.map(function (d, i) { return '<span class="badge" style="' + (G[d] ? 'background:var(--accent-soft);color:var(--accent-ink)' : '') + '">' + (i + 1) + '. ' + esc(d) + (G[d] ? ' ✓' : '') + '</span>'; }).join(' ') + '</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Chỉ số</th><th>Giá trị</th><th>Cách tính</th></tr></thead><tbody>' +
        '<tr><td>Hit@' + k + '</td><td><b>' + (hits ? 1 : 0) + '</b></td><td>Có ít nhất một tài liệu đúng trong top-' + k + '?</td></tr>' +
        '<tr><td>Recall@' + k + '</td><td><b>' + (nG ? f(hits / nG) : '—') + '</b></td><td>' + hits + ' đúng trong top-' + k + ' / ' + nG + ' tài liệu liên quan</td></tr>' +
        '<tr><td>Precision@' + k + '</td><td><b>' + f(hits / k) + '</b></td><td>' + hits + ' / ' + k + '</td></tr>' +
        '<tr><td>MRR (1 truy vấn)</td><td><b>' + (first > 0 ? f(1 / first) : '0.000') + '</b></td><td>' + (first > 0 ? '1 / hạng của tài liệu đúng đầu tiên = 1/' + first : 'Không có tài liệu đúng') + '</td></tr>' +
        '<tr><td>nDCG@' + k + '</td><td><b>' + (idcg ? f(dcg / idcg) : '—') + '</b></td><td>DCG ' + f(dcg) + ' / DCG lý tưởng ' + f(idcg) + '; mỗi tài liệu đúng ở hạng i đóng góp 1/log₂(i+1)</td></tr>' +
        '</tbody></table></div>';
    }
    [ret, rel, kk].forEach(function (x) { x.addEventListener('input', render); });
    render();
  };

  // ---- 4. Ước tính chi phí token ----
  W.cost = function (el) {
    el.innerHTML = '<p class="widget-title">Ước tính chi phí sinh câu trả lời</p><p class="widget-note">Đơn giá thay đổi theo nhà cung cấp và thời điểm — hãy nhập giá hiện hành từ trang giá chính thức. Công cụ chỉ nhân các con số, không chứa bảng giá nào.</p>' +
      '<div class="row"><div><label for="c-q">Truy vấn mỗi ngày</label><input id="c-q" type="number" min="0" value="5000"></div><div><label for="c-k">Số chunk đưa vào prompt</label><input id="c-k" type="number" min="0" value="8"></div><div><label for="c-t">Token mỗi chunk</label><input id="c-t" type="number" min="0" value="400"></div></div>' +
      '<div class="row"><div><label for="c-sys">Token system prompt + câu hỏi</label><input id="c-sys" type="number" min="0" value="600"></div><div><label for="c-out">Token đầu ra TB</label><input id="c-out" type="number" min="0" value="350"></div><div><label for="c-cache">Tỷ lệ cache hit prompt (%)</label><input id="c-cache" type="number" min="0" max="100" value="0"></div></div>' +
      '<div class="row"><div><label for="c-pi">Giá input (USD / 1 triệu token)</label><input id="c-pi" type="number" min="0" step="0.01" value="1"></div><div><label for="c-pc">Giá input đã cache (USD / 1 triệu)</label><input id="c-pc" type="number" min="0" step="0.01" value="0.1"></div><div><label for="c-po">Giá output (USD / 1 triệu token)</label><input id="c-po" type="number" min="0" step="0.01" value="5"></div></div>' +
      '<div class="out" id="c-out-r" aria-live="polite"></div>';
    var ids = ['c-q', 'c-k', 'c-t', 'c-sys', 'c-out', 'c-cache', 'c-pi', 'c-pc', 'c-po'];
    function v(id) { return Math.max(0, parseFloat($('#' + id, el).value) || 0); }
    function render() {
      var inTok = v('c-k') * v('c-t') + v('c-sys'), outTok = v('c-out'), hit = Math.min(100, v('c-cache')) / 100;
      var perQ = (inTok * (1 - hit) * v('c-pi') + inTok * hit * v('c-pc') + outTok * v('c-po')) / 1e6;
      var day = perQ * v('c-q');
      var share = perQ ? (v('c-k') * v('c-t') * ((1 - hit) * v('c-pi') + hit * v('c-pc')) / 1e6) / perQ : 0;
      $('#c-out-r', el).innerHTML = '<span class="stat">Token input / truy vấn: <b>' + inTok.toLocaleString('vi-VN') + '</b></span><span class="stat">Chi phí / truy vấn: <b>$' + perQ.toFixed(5) + '</b></span><span class="stat">/ ngày: <b>$' + day.toFixed(2) + '</b></span><span class="stat">/ 30 ngày: <b>$' + (day * 30).toFixed(0) + '</b></span><p class="widget-note" style="margin-top:8px">Phần ngữ cảnh truy hồi chiếm <b>' + Math.round(share * 100) + '%</b> chi phí mỗi truy vấn. Giảm số chunk hoặc rerank để giữ ít chunk hơn thường là đòn bẩy chi phí lớn nhất. Chưa tính embedding, vector DB, reranker và hạ tầng.</p>';
    }
    ids.forEach(function (id) { $('#' + id, el).addEventListener('input', render); });
    render();
  };

  // ---- 5. Cosine similarity 2D ----
  W.cosine = function (el) {
    el.innerHTML = '<p class="widget-title">Độ tương đồng cosine</p><p class="widget-note">Kéo thanh trượt để đổi góc của vector tài liệu B so với truy vấn A (mô phỏng 2 chiều; embedding thật có hàng trăm tới hàng nghìn chiều).</p>' +
      '<div class="row"><div><label for="cs-ang">Góc giữa A và B: <b id="cs-av"></b>°</label><input id="cs-ang" type="range" min="0" max="180" value="35"></div><div><label for="cs-len">Độ dài B: <b id="cs-lv"></b></label><input id="cs-len" type="range" min="0.2" max="2" step="0.1" value="1"></div></div>' +
      '<div class="out" style="display:grid;grid-template-columns:minmax(0,220px) 1fr;gap:14px;align-items:center"><svg viewBox="-110 -110 220 220" width="220" height="220" aria-label="Minh họa hai vector"><circle r="100" fill="none" stroke="var(--line)"/><line x1="-105" y1="0" x2="105" y2="0" stroke="var(--line)"/><line x1="0" y1="-105" x2="0" y2="105" stroke="var(--line)"/><line id="cs-a" x1="0" y1="0" x2="90" y2="0" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/><line id="cs-b" x1="0" y1="0" x2="0" y2="0" stroke="var(--warm)" stroke-width="4" stroke-linecap="round"/><text x="92" y="-6" fill="var(--accent)" font-size="13" font-weight="700">A</text><text id="cs-bt" fill="var(--warm)" font-size="13" font-weight="700">B</text></svg><div id="cs-out"></div></div>';
    var ang = $('#cs-ang', el), len = $('#cs-len', el);
    function render() {
      var a = +ang.value, L = +len.value, r = a * Math.PI / 180, x = Math.cos(r) * 45 * L, y = -Math.sin(r) * 45 * L;
      var B = $('#cs-b', el); B.setAttribute('x2', x); B.setAttribute('y2', y);
      var bt = $('#cs-bt', el); bt.setAttribute('x', x + (x >= 0 ? 4 : -14)); bt.setAttribute('y', y - 4);
      $('#cs-av', el).textContent = a; $('#cs-lv', el).textContent = L.toFixed(1);
      var cos = Math.cos(r), dot = 1 * L * cos;
      $('#cs-out', el).innerHTML = '<p style="margin:0"><span class="stat">cos(A,B) = <b>' + cos.toFixed(3) + '</b></span><br><span class="stat">Tích vô hướng A·B (|A|=1) = <b>' + dot.toFixed(3) + '</b></span></p><p class="widget-note" style="margin-top:8px">Cosine chỉ phụ thuộc góc: đổi độ dài B không đổi cosine nhưng đổi tích vô hướng. Vì vậy nếu vector đã chuẩn hóa về độ dài 1, xếp hạng theo cosine và theo tích vô hướng là như nhau.</p>';
    }
    [ang, len].forEach(function (x) { x.addEventListener('input', render); });
    render();
  };

  $$('.widget[data-widget]').forEach(function (el) {
    var f = W[el.getAttribute('data-widget')];
    if (f) { try { f(el); } catch (e) { console.error(e); } }
  });
})();
