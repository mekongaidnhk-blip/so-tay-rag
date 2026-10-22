# Hướng dẫn biên soạn — Sổ tay RAG

Tài liệu này mô tả cấu trúc nội dung, quy ước định dạng và tiêu chuẩn biên tập. Mọi bài viết phải theo hướng dẫn này để website nhất quán.

## Cấu trúc thư mục

```
content/
  site.json            cấu hình chung (tên, URL, nhóm nguồn)
  nav.json             các phần (section) và thứ tự bài -> quyết định sidebar, prev/next, trang chủ đề
  sources/*.json       thư mục nguồn, gộp lại khi build; id phải duy nhất toàn site
  index.html           trang chủ
  <phần>/<bài>.html    bài viết
assets/                CSS, JS (widget tương tác), favicon
build.mjs              trình build: node build.mjs -> dist/
```

Build sẽ **thất bại** nếu có: liên kết nội bộ hỏng, trích dẫn tới nguồn không tồn tại, id nguồn hoặc URL nguồn trùng nhau, neo `#...` không tồn tại.

## Front matter

Mỗi file bài bắt đầu bằng JSON giữa hai dòng `---`:

```json
{
  "title": "Tiêu đề đầy đủ (có thể ở dạng câu hỏi)",
  "navTitle": "Tiêu đề ngắn cho sidebar",
  "description": "1–2 câu, dùng cho thẻ meta, trang chủ đề và kết quả tìm kiếm",
  "lead": "Đoạn mở đầu 2–3 câu: vấn đề người đọc gặp và bài này giúp gì",
  "level": "Người mới | Trung cấp | Nâng cao",
  "reviewed": "YYYY-MM-DD",
  "kinds": ["nen-tang", "nghien-cuu", "kinh-nghiem", "nhan-dinh"]
}
```

`kinds` liệt kê các loại nội dung có trong bài (xem phần callout).

## Shortcode

| Cú pháp | Kết quả |
|---|---|
| `[[cite:id]]` hoặc `[[cite:id1,id2]]` | Số trích dẫn [1], tự sinh danh sách “Tài liệu tham khảo” cuối bài |
| `[[link:phan/bai]]` | Liên kết nội bộ, chữ hiển thị = tiêu đề bài |
| `[[link:phan/bai|chữ tùy chọn]]` | Liên kết nội bộ với chữ tùy chọn |
| `[[link:phan/bai#neo|chữ]]` | Liên kết tới một mục trong bài khác |
| `[[link:phan]]` | Liên kết tới trang chủ đề của một phần |

Không viết thẻ `<a href>` thủ công cho liên kết nội bộ. Liên kết ngoài dùng `<a href="https://..." rel="noopener">`.

## Thành phần HTML có sẵn

- Tiêu đề: chỉ dùng `<h2>`, `<h3>` (h1 do layout sinh). Mục lục tự sinh từ h2/h3.
- Callout — **dùng để phân biệt loại tri thức**:
  - `<div class="callout tom-tat">` tóm tắt nhanh đầu bài (nên có)
  - `<div class="callout nen-tang">` kiến thức nền tảng, định nghĩa ổn định
  - `<div class="callout nghien-cuu">` kết quả nghiên cứu — luôn nêu điều kiện thí nghiệm và có trích dẫn
  - `<div class="callout kinh-nghiem">` kinh nghiệm triển khai — thực hành phổ biến, quy tắc kinh nghiệm, nêu rõ không phải định luật
  - `<div class="callout nhan-dinh">` nhận định của người biên soạn
  - `<div class="callout canh-bao">` lưu ý, lỗi thường gặp
  - `<div class="callout kiem-chung">` cách kiểm chứng / tự kiểm tra
- Bảng: `<table>` thường (JS tự bọc để cuộn ngang trên điện thoại).
- Danh sách bước: `<ol class="steps">`.
- Hỏi đáp gập: `<details class="qa"><summary>Câu hỏi</summary><p>…</p></details>`.
- Mã: `<pre><code>…</code></pre>` (escape `<`, `>`, `&`).
- Sơ đồ: `<figure class="diagram"><svg viewBox=... role="img" aria-labelledby=...><title>…</title><desc>…</desc>…</svg><figcaption>…</figcaption></figure>`. Dùng class màu `box`, `box-a`, `box-b`, `box-w`, `box-v`, `ln`, `ln-a`, `ln-d`, `muted`, `arrowhead` để hợp chế độ sáng/tối. Không đặt màu cứng. Mỗi `<marker id>` phải duy nhất trong trang.
- Widget tương tác: `<div class="widget" data-widget="chunker|rrf|metrics|cost|cosine"><p>Bật JavaScript để dùng công cụ tương tác.</p></div>`.

## Tiêu chuẩn nội dung

1. **Tổ chức quanh câu hỏi của người đọc**: mở bằng vấn đề; mỗi bài nên có (khi phù hợp) vấn đề & bối cảnh → nguyên lý → ví dụ → lựa chọn thiết kế & đánh đổi → giới hạn & lỗi thường gặp → cách kiểm chứng → đọc tiếp.
2. **Phân biệt loại tri thức** bằng callout và cách viết: “Bài báo X báo cáo rằng, trên bộ dữ liệu Y, …” khác với “Thực hành phổ biến là …” khác với “Chúng tôi cho rằng …”.
3. **Không suy rộng benchmark**: nêu bộ dữ liệu, mô hình, thời điểm. Không đưa ra con số không có nguồn. Con số kinh nghiệm (ví dụ “chunk 200–800 token”) phải ghi là điểm khởi đầu cần đo lại.
4. **Mọi nhận định kỹ thuật quan trọng có trích dẫn** tới nguồn gốc (bài báo, tài liệu chính thức, mã nguồn). Không trích dẫn nguồn chưa kiểm tra tồn tại.
5. **Ghi phiên bản/thời điểm** khi nội dung phụ thuộc (API, thư viện, bảng xếp hạng). Ghi “tính đến 10/2026”.
6. **Diễn giải bằng ví dụ riêng**, ưu tiên ví dụ tiếng Việt và bối cảnh Việt Nam (tài liệu pháp lý, ngân hàng, thương mại điện tử…). Không sao chép văn bản nguồn.
7. **Liên kết thành hệ thống**: mỗi bài liên kết tới bài nền tảng nó dựa vào và bài đi sâu hơn; cuối bài có mục “Đọc tiếp”.
8. Thuật ngữ: dùng thuật ngữ tiếng Anh phổ biến kèm giải thích tiếng Việt ở lần đầu (ví dụ “chunk (đoạn cắt)”). Giữ nguyên tên kỹ thuật như BM25, HNSW, reranker.

## Nguồn tham khảo

Mỗi nguồn trong `content/sources/*.json`:

```json
"karpukhin2020": {
  "group": "một trong các nhóm khai báo ở site.json > sourceGroups",
  "kind": "Bài báo | Benchmark | Tài liệu chính thức | Mã nguồn | Blog kỹ thuật | Khảo sát | Case study",
  "authors": "Họ, T., Họ, T., et al.",
  "year": "2020",
  "title": "Tiêu đề gốc",
  "short": "Tên ngắn",
  "venue": "Hội nghị/tạp chí, arXiv:xxxx.xxxxx",
  "url": "https://...",
  "why": "1–2 câu tiếng Việt: nguồn này đóng góp gì, đọc để làm gì"
}
```

## Rà soát

- Cập nhật `reviewed` khi rà soát bài. Nội dung phụ thuộc phiên bản phải ghi thời điểm.
- Chạy `node build.mjs` và `node tools/check-external.mjs` (kiểm tra liên kết ngoài) trước khi xuất bản.
