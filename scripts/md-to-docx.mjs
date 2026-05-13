// 把指定的 .md 轉成 .docx。一次性 dev 工具,需要先 npm install --no-save docx marked。
// 用法:node scripts/md-to-docx.mjs docs/移交清單.md docs/移交清單.docx

import { readFileSync, writeFileSync } from 'fs';
import { marked } from 'marked';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, ExternalHyperlink,
} from 'docx';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node scripts/md-to-docx.mjs <input.md> <output.docx>');
  process.exit(1);
}

const md = readFileSync(inPath, 'utf8');
const tokens = marked.lexer(md);

const ZH_FONT = 'Microsoft JhengHei';
const MONO_FONT = 'Consolas';

function inlineToRuns(tokens, formatting = {}) {
  const runs = [];
  for (const t of tokens) {
    if (t.type === 'text' || t.type === 'escape') {
      // text token may have nested tokens (escapes etc.) — flatten
      if (t.tokens && t.tokens.length > 0) {
        runs.push(...inlineToRuns(t.tokens, formatting));
      } else {
        runs.push(new TextRun({ text: t.text, font: ZH_FONT, ...formatting }));
      }
    } else if (t.type === 'strong') {
      runs.push(...inlineToRuns(t.tokens, { ...formatting, bold: true }));
    } else if (t.type === 'em') {
      runs.push(...inlineToRuns(t.tokens, { ...formatting, italics: true }));
    } else if (t.type === 'codespan') {
      runs.push(new TextRun({
        text: t.text, font: MONO_FONT, size: 20,
        shading: { fill: 'F4F4F5', type: ShadingType.CLEAR },
        ...formatting,
      }));
    } else if (t.type === 'link') {
      runs.push(new ExternalHyperlink({
        children: inlineToRuns(t.tokens, { ...formatting, color: '0563C1', underline: {} }),
        link: t.href,
      }));
    } else if (t.type === 'br') {
      runs.push(new TextRun({ text: '\n', ...formatting }));
    } else if (t.type === 'del') {
      runs.push(...inlineToRuns(t.tokens, { ...formatting, strike: true }));
    } else if (t.type === 'image') {
      runs.push(new TextRun({ text: `[image: ${t.text || t.href}]`, font: ZH_FONT, italics: true }));
    }
  }
  return runs;
}

function blockToDocx(tokens, depth = 0) {
  const children = [];
  for (const t of tokens) {
    if (t.type === 'heading') {
      const headingMap = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      children.push(new Paragraph({
        heading: headingMap[t.depth - 1] ?? HeadingLevel.HEADING_6,
        children: inlineToRuns(t.tokens),
      }));
    } else if (t.type === 'paragraph') {
      children.push(new Paragraph({
        children: inlineToRuns(t.tokens),
        spacing: { after: 120 },
      }));
    } else if (t.type === 'blockquote') {
      const inner = blockToDocx(t.tokens, depth + 1);
      for (const p of inner) {
        if (p instanceof Paragraph) {
          // shading + left border to mimic quote style
          // docx-js Paragraph constructor doesn't allow post-hoc mutation easily;
          // we re-create simple paragraphs with extra formatting via wrapping
        }
        children.push(p);
      }
    } else if (t.type === 'list') {
      const ref = t.ordered ? 'numbers' : 'bullets';
      for (const item of t.items) {
        // item.tokens is mix of paragraphs / nested lists
        const itemRuns = [];
        const nestedBlocks = [];
        for (const it of item.tokens) {
          if (it.type === 'text' && it.tokens) {
            itemRuns.push(...inlineToRuns(it.tokens));
          } else if (it.type === 'text') {
            itemRuns.push(new TextRun({ text: it.text, font: ZH_FONT }));
          } else if (it.type === 'paragraph') {
            // 把 paragraph 內容當作 list item 內文
            if (itemRuns.length > 0) itemRuns.push(new TextRun({ text: '\n', font: ZH_FONT }));
            itemRuns.push(...inlineToRuns(it.tokens));
          } else if (it.type === 'list') {
            // nested list — 用相同邏輯遞迴
            nestedBlocks.push(...blockToDocx([it], depth + 1));
          } else if (it.type === 'space') {
            // skip
          }
        }
        children.push(new Paragraph({
          numbering: { reference: ref, level: 0 },
          children: itemRuns,
        }));
        children.push(...nestedBlocks);
      }
    } else if (t.type === 'table') {
      const numCols = t.header.length;
      const tableWidth = 9360;
      const colWidth = Math.floor(tableWidth / numCols);
      const colWidths = new Array(numCols).fill(colWidth);
      colWidths[numCols - 1] = tableWidth - colWidth * (numCols - 1); // 最後一欄收尾

      const cellMargin = { top: 80, bottom: 80, left: 120, right: 120 };
      const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
      const borders = {
        top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder,
      };

      const headerRow = new TableRow({
        tableHeader: true,
        children: t.header.map((cell, i) => new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
          margins: cellMargin,
          children: [new Paragraph({
            children: inlineToRuns(cell.tokens, { bold: true }),
          })],
        })),
      });
      const bodyRows = t.rows.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          margins: cellMargin,
          children: [new Paragraph({
            children: inlineToRuns(cell.tokens),
          })],
        })),
      }));
      children.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: [headerRow, ...bodyRows],
      }));
      // 表格後加個空段落,避免兩個 table 黏在一起
      children.push(new Paragraph({ children: [new TextRun({ text: '', font: ZH_FONT })] }));
    } else if (t.type === 'code') {
      // multi-line code block
      const lines = t.text.split('\n');
      for (const line of lines) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, font: MONO_FONT, size: 20 })],
          shading: { fill: 'F4F4F5', type: ShadingType.CLEAR },
        }));
      }
    } else if (t.type === 'hr') {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } },
      }));
    } else if (t.type === 'space') {
      // skip
    } else if (t.type === 'html') {
      // skip raw html
    }
  }
  return children;
}

const docChildren = blockToDocx(tokens);

const doc = new Document({
  creator: 'Becca',
  styles: {
    default: { document: { run: { font: ZH_FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: ZH_FONT, color: '1F2937' },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: ZH_FONT, color: '1F2937' },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: ZH_FONT, color: '374151' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: ZH_FONT, color: '374151' },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 3 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: docChildren,
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log(`✓ ${outPath} written (${buffer.length} bytes)`);
