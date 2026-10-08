// Shared by gen.js (schema document) and gen_api.js (REST API document).
const fs = require('fs');
const path = require('path');
const d = require('docx');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ShadingType, TableOfContents, ImageRun, Footer, PageNumber, AlignmentType, BorderStyle,
  PageBreak, TableLayoutType,
} = d;

const REPO = path.resolve(__dirname, '..', '..');

// ---------- parse the CQL files ----------
function parseCql() {
  const tables = {};
  const dir = path.join(REPO, 'cql');
  for (const f of fs.readdirSync(dir).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    const re = /CREATE TABLE IF NOT EXISTS mlw\.(\w+)\s*\(([\s\S]*?)\n\)\s*(WITH[^;]*)?;/g;
    let m;
    while ((m = re.exec(src))) {
      const [, name, body, opts] = m;
      const cols = [];
      let pk = null;
      // split on top-level commas (list<text> has none, PRIMARY KEY has parens)
      let depth = 0, cur = '', parts = [];
      for (const ch of body) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      for (let p of parts) {
        p = p.trim().replace(/\s+/g, ' ');
        if (!p) continue;
        if (/^PRIMARY KEY/i.test(p)) { pk = p.replace(/^PRIMARY KEY\s*/i, ''); continue; }
        const mm = p.match(/^(\w+) (.+?)( static)?$/);
        cols.push({ name: mm[1], type: mm[2], isStatic: !!mm[3] });
      }
      // primary key: ((a, b), c, d) or (a, b) or (a)
      const inner = pk.replace(/^\(|\)$/g, '');
      let partition, clustering;
      const pm = inner.match(/^\(([^)]*)\)\s*,?\s*(.*)$/);
      if (pm) {
        partition = pm[1].split(',').map(s => s.trim());
        clustering = pm[2] ? pm[2].split(',').map(s => s.trim()) : [];
      } else {
        const all = inner.split(',').map(s => s.trim());
        partition = [all[0]];
        clustering = all.slice(1);
      }
      const order = /CLUSTERING ORDER BY \((\w+) DESC\)/i.exec(opts || '');
      tables[name] = { name, cols, partition, clustering, file: f, descOrder: order ? order[1] : null };
    }
  }
  return tables;
}

// ---------- document helpers ----------
const FONT = 'Calibri';
const BLUE = '2F5C8F';
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text, ...(opts.run || {}) })] });
const rich = (parts, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: parts.map(x => typeof x === 'string' ? new TextRun(x) : new TextRun(x)) });
const h = (text, level) => new Paragraph({ heading: level, children: [new TextRun(text)] });
const border = { style: BorderStyle.SINGLE, size: 4, color: 'B7B7B7' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    children: [new Paragraph({ keepNext: !!opts.keepNext, children: [new TextRun({ text, bold: !!opts.bold, color: opts.color, font: opts.mono ? 'Consolas' : undefined, size: opts.mono ? 18 : 20 })] })],
  });
}


// ---------- example data generated from the schema ----------
const SAMPLE = {
  project_id: 'demo', episode_id: 'EP01', sequence_id: 'SQ010', scene_id: 'SC010', shot_id: 'SH010', layer_id: 'L1',
  user_id: 'u1', email: 'ann@example.org', username: 'ann', display_name: 'Ann Artist', role: 'artist',
  name: 'Example', status: 'active', type: 'example', title: 'Opening', description: 'Example description.',
  frame_rate: 24, frame_number: 1, start_frame: 1, end_frame: 48, position: 10, z_order: 1, visibility: true,
  created_at: '2026-10-05T12:00:00Z', added_at: '2026-10-05T12:00:00Z', revision_number: 1, author: 'u1', reviewer: 'u1',
  x: 0, y: 0, z: 10, zoom: 1, focal_length: 35, interpolation: 'linear', note: 'Hold for two frames.',
  url: 'https://example.org/audio/theme.wav', file_name: 'theme.wav', source_url: 'https://example.org/assets/bg.png',
  xml_url: 'https://example.org/xsheet/SH010.xml', svg_url: 'https://example.org/xsheet/SH010.svg',
  note_text: 'Check the lighting.', comment_text: 'Please brighten the sky.', phoneme: 'AH', owner_id: 'u1',
  category: 'background', version: '1.0.0', owner: 'u1',
};
function sample(col, typ) {
  if (SAMPLE[col] !== undefined) return SAMPLE[col];
  if (/^(list|set)</.test(typ)) return [col.replace(/s$/, '').replace(/_refs?$/, '') + '-1'];
  if (typ === 'text') return col.endsWith('_id') || col.endsWith('_ref') ? col.replace(/_(id|ref)$/, '').toUpperCase() + '1' : 'example';
  if (typ === 'int') return 1;
  if (typ === 'float') return 1.5;
  if (typ === 'boolean') return true;
  if (typ === 'timestamp') return '2026-10-05T12:00:00Z';
  return 'example';
}
const typeOf = (t, name) => t.cols.find(c => c.name === name).type;
const keyOf = t => [...t.partition, ...t.clustering];
const colsOrdered = t => [
  ...keyOf(t).map(n => t.cols.find(c => c.name === n)),
  ...t.cols.filter(c => !keyOf(t).includes(c.name)),
];
function exampleBody(t) {
  const o = {};
  for (const c of colsOrdered(t)) o[c.name] = sample(c.name, c.type);
  return o;
}

// Builds the document with the shared styles, a page number footer and the children.
function buildDocument(title, footerText, children) {
  return new Document({
    creator: 'Magic Lantern Workbench',
    title,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 56, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { after: 160 } } },
        { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '333333', font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2 } },
      ],
    },
    numbering: { config: [] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: footerText + '  ·  Page ', size: 18, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '777777' })] })] }) },
      children,
    }],
  });
}

function write(doc, out) {
  return Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log('wrote', out, buf.length); });
}

module.exports = { d, REPO, parseCql, FONT, BLUE, p, rich, h, border, borders, cell, buildDocument, write, sample, typeOf, keyOf, colsOrdered, exampleBody };
