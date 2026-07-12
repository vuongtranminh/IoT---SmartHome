#!/usr/bin/env node
// Preprocess BAOCAO.md cho báo cáo Word chuẩn:
//  1. Ảnh CÓ SẴN → chèn + đánh số "Hình N: caption"
//  2. Ảnh CHƯA CÓ → xoá hoàn toàn (không để placeholder)
//  3. Loại bỏ Unicode box-drawing (═ ─ ⋯ …) — dùng --- chuẩn markdown
//  4. Loại emoji khỏi heading (##/###) để chuyên nghiệp
//  5. Bỏ các đoạn "Ảnh cần chèn" phía sau
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'BAOCAO.md');
const OUT = path.join(ROOT, 'BAOCAO.processed.md');

let md = fs.readFileSync(SRC, 'utf8');

// ─── 0. Loại bỏ title + subtitle + MỤC LỤC thủ công ──────────
// Word tự sinh TOC qua pandoc --toc, không cần section MỤC LỤC trong md.
// Title cover page cần metadata YAML, để pandoc xử lý riêng.
md = md.replace(/^# BÁO CÁO ĐỒ ÁN\s*\n## [^\n]+\s*\n\n---\s*\n\n/m, '');
md = md.replace(/^## MỤC LỤC[\s\S]*?(?=^---\s*$)/m, '');
md = md.replace(/^---\s*\n\n(?=## )/m, '');

// ─── 0.5. Chuyển heading level: ## N. Chương → # Chương ───
//   ### N.M. Mục   → ## Mục
//   #### text      → ### text
// Strip cả prefix "N.", "N.M." vì pandoc sẽ tự đánh số.
md = md.replace(/^#### /gm, '### ');
md = md.replace(/^### \d+(?:\.\d+)*\.?\s*/gm, '## ');
md = md.replace(/^## \d+(?:\.\d+)*\.?\s*/gm, '# ');

// ─── 1. Xử lý placeholder ảnh ────────────────────────────────
// Pattern: "📸 **Ảnh cần chèn**: `images/xxx.png`\n> **Chú thích**: caption\n"
const pattern = /📸 \*\*Ảnh cần chèn\*\*: `(images\/[^`]+\.png)`\s*\n> \*\*Chú thích\*\*: ([^\n]+(?:\n(?!\n)[^\n]+)*)\n?/g;

let figureNum = 0;
let inserted = 0;
let skipped = 0;
md = md.replace(pattern, (match, imagePath, caption) => {
  const absPath = path.join(ROOT, imagePath);
  const cleanCaption = caption.replace(/\s+/g, ' ').trim();
  if (fs.existsSync(absPath)) {
    figureNum++;
    inserted++;
    // Pandoc: image có alt text và đứng riêng đoạn → tự động apply Caption style.
    // Format: "Hình N: caption" dạng markdown image, sau đó tự pandoc gen caption.
    return `\n![Hình ${figureNum}: ${cleanCaption}](${imagePath})\n\n`;
  } else {
    skipped++;
    return '';  // xoá hoàn toàn placeholder
  }
});

// ─── 2. Loại bỏ Unicode box-drawing characters ────────────────
// Trong text: ═, ─, ⋯, ─── etc. thay bằng dấu gạch chuẩn
md = md
  .replace(/═+/g, '')     // ═══ → bỏ
  .replace(/─{3,}/g, '')  // ─── → bỏ (nếu chỉ decoration)
  .replace(/─/g, '-')     // ─ đơn → -
  .replace(/│/g, '|')
  .replace(/├─+|└─+|┌─+|┐|┘|├|┤/g, '');

// ─── 3. Loại emoji khỏi heading (h1-h4) ──────────────────────
// Giữ emoji trong body text (bullets, code, table) — chỉ strip trong # ...
md = md.replace(/^(#{1,4})\s+([^\n]+)$/gm, (m, hashes, title) => {
  // Bỏ mọi emoji + ký tự dạng special ở đầu title
  const cleaned = title
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '')  // emoji
    .replace(/^\s+/, '')
    .trim();
  return `${hashes} ${cleaned}`;
});

// ─── 4. Bỏ dòng --- decoration đứng riêng (giữ --- section break) ─
// pandoc treat --- là section break OK, không cần đổi

// ─── 5. Clean multi blank lines ──────────────────────────────
md = md.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(OUT, md);
console.log(`✓ ${inserted} ảnh chèn (đã đánh số Hình 1..${figureNum})`);
console.log(`✓ ${skipped} placeholder bị xoá (chưa có ảnh)`);
console.log(`→ ${OUT}`);
