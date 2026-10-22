// Trích các khối <pre><code> từ một trang nội dung để chạy thử.
// node tools/extract-code.mjs content/thuc-hanh/rag-dau-tien.html 1 > out.py   (bỏ qua N khối đầu)
import fs from 'node:fs';
const [file, skip = '0'] = process.argv.slice(2);
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)].map((m) => m[1]
  .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
process.stdout.write(blocks.slice(+skip).join('\n\n') + '\n');
