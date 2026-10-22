# Sổ tay RAG

Website tiếng Việt về Retrieval-Augmented Generation (RAG): lộ trình cho người mới, giải thích cơ chế, so sánh phương án, đánh giá, chẩn đoán lỗi và vận hành — kèm nguồn kiểm chứng.

**Website:** https://mekongaidnhk-blip.github.io/so-tay-rag/

## Chạy cục bộ

Yêu cầu Node.js 18+ (không cần cài thư viện).

```bash
node build.mjs                      # sinh dist/, kiểm tra liên kết nội bộ & trích dẫn
python3 -m http.server 8765 -d dist # xem tại http://localhost:8765
node tools/check-external.mjs       # kiểm tra liên kết ngoài
node tools/check-live.mjs           # crawl website đã xuất bản, mọi trang/tài nguyên phải trả 200
```

Mỗi lần push lên `main`, GitHub Actions build và triển khai lên GitHub Pages (`.github/workflows/pages.yml`).

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md) để biết cấu trúc nội dung, shortcode và tiêu chuẩn biên tập. Báo lỗi nội dung qua Issues, xin kèm nguồn hoặc bằng chứng.

## Giấy phép

Nội dung: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Mã nguồn website: MIT.
