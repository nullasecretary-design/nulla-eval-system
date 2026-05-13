// 一次性 script:把 spec_v0.3.md 的 §0 CHANGELOG 移到文末「附錄 A」,
// 讓 §1~§14 規格本文從前面直接開始(模仿 v0.2 結構,docx 視覺較清爽)。

import { readFileSync, writeFileSync } from 'fs';

const FILE = 'docs/spec_v0.3.md';
const raw = readFileSync(FILE, 'utf8');
const lines = raw.split('\n');

// 找標記
const findLine = (pred) => lines.findIndex(pred);
const idxZero = findLine((l) => l.startsWith('## 〇、'));
const idxOne = findLine((l) => l.startsWith('## 一、'));

if (idxZero < 0 || idxOne < 0) {
  console.error('找不到 §〇 或 §一 標題');
  process.exit(1);
}

// 抓出 §0 整段內容(不含結尾的 ---)
// idxZero 是「## 〇、...」那行,idxOne - 1 通常是空行,idxOne - 2 是 ---
// 我們從 idxZero 取到 idxOne 之前的 ---
let endZero = idxOne - 1;
while (endZero > idxZero && (lines[endZero].trim() === '' || lines[endZero].trim() === '---')) {
  endZero--;
}
// endZero 現在指到 §0 最後一行有內容的(例如 §0.5 表格最後一列)
const zeroSection = lines.slice(idxZero, endZero + 1);

// 重新組合:
// part A:前言(line 0 ~ idxZero - 1,含中間 ---)
// 但中間 idxZero 之前的 --- 也要拿掉(它原本是分隔 「版本變更說明」 跟 §0,
// 現在直接接 §1,改成單一 --- 即可)
let preludeEnd = idxZero - 1;
// 倒過來移除尾端的空行 + ---
while (preludeEnd >= 0 && (lines[preludeEnd].trim() === '' || lines[preludeEnd].trim() === '---')) {
  preludeEnd--;
}
const prelude = lines.slice(0, preludeEnd + 1);

// part B:§1~§14
const body = lines.slice(idxOne);
// 移除 body 結尾的多餘空行
let bodyEnd = body.length - 1;
while (bodyEnd >= 0 && body[bodyEnd].trim() === '') bodyEnd--;
const bodyTrimmed = body.slice(0, bodyEnd + 1);

// 改 §0 標題為「附錄 A」
const appendixLines = [...zeroSection];
appendixLines[0] = '## 附錄 A:實作現況 CHANGELOG';

// 組合
const out = [
  ...prelude,
  '',
  '---',
  '',
  ...bodyTrimmed,
  '',
  '---',
  '',
  ...appendixLines,
  '',
].join('\n');

writeFileSync(FILE, out);
console.log(`✓ ${FILE} 重組完成`);
console.log(`  - 前言 ${prelude.length} 行`);
console.log(`  - §1~§14 規格本文 ${bodyTrimmed.length} 行`);
console.log(`  - 附錄 A:實作 CHANGELOG ${appendixLines.length} 行`);
