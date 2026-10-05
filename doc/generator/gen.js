const fs = require('fs');
const path = require('path');
const {
  d, REPO, parseCql, FONT, BLUE, p, rich, h, border, borders, cell, buildDocument, write,
} = require('./lib');
const {
  HeadingLevel, Table, TableRow, WidthType, TableOfContents, ImageRun, Paragraph, TextRun,
  AlignmentType, PageBreak, TableLayoutType,
} = d;

// Usage: node gen.js <output.docx> <diagram-png-dir>
const OUT = process.argv[2];
const DIA = process.argv[3];
if (!OUT || !DIA) { console.error('usage: node gen.js <output.docx> <diagram-png-dir>'); process.exit(1); }

const { describe, PURPOSE } = require('./descriptions');

const GROUPS = [
  ['Production Hierarchy', 'Tables that describe the structure of a production, from sequences down to frames and layers.',
    ['production', 'sequence', 'scene', 'shot', 'frame', 'layer', 'exposure_sheet']],
  ['Assets, Audio and Notes', 'Tables for assets and the audio, dialog and notes attached to frames.',
    ['asset', 'track', 'audio_tracks', 'audio_ref', 'dialog', 'note']],
  ['Camera and Timeline', 'Tables for camera moves, keyframes, cameras and timelines.',
    ['camera', 'camera_move', 'keyframe', 'timeline']],
  ['Users and Projects', 'Tables for users, projects and project membership, with their lookup tables.',
    ['user', 'user_by_email', 'project', 'project_member', 'project_by_user']],
  ['Review', 'Tables for reviews of frames and their comments.',
    ['review', 'comment', 'review_by_frame']],
  ['Version Control', 'Tables for version control and revisions.',
    ['version_control', 'revision']],
];

const W = [1900, 1250, 1250, 4960]; // sums to 9360
function columnsTable(t) {
  const keyOf = c => {
    const i = t.partition.indexOf(c.name);
    if (i >= 0) return 'Partition';
    const j = t.clustering.indexOf(c.name);
    if (j >= 0) return t.descOrder === c.name ? 'Clustering (desc)' : 'Clustering';
    if (c.isStatic) return 'Static';
    return '';
  };
  // order: partition keys, clustering keys, then the rest in declared order
  const ordered = [
    ...t.partition.map(n => t.cols.find(c => c.name === n)),
    ...t.clustering.map(n => t.cols.find(c => c.name === n)),
    ...t.cols.filter(c => !t.partition.includes(c.name) && !t.clustering.includes(c.name)),
  ];
  const head = new TableRow({
    tableHeader: true,
    children: ['Column', 'Type', 'Key', 'Description'].map((x, i) => cell(x, W[i], { bold: true, fill: BLUE, color: 'FFFFFF', keepNext: true })),
  });
  const rows = ordered.map((c, ri) => new TableRow({
    cantSplit: true,
    children: [
      cell(c.name, W[0], { mono: true, fill: keyOf(c) && !c.isStatic ? 'EEF3FA' : undefined, keepNext: ri < ordered.length - 1 }),
      cell(c.type, W[1], { mono: true, keepNext: ri < ordered.length - 1 }),
      cell(keyOf(c), W[2], { keepNext: ri < ordered.length - 1 }),
      cell(describe(t.name, c.name), W[3], { keepNext: ri < ordered.length - 1 }),
    ],
  }));
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: W, rows: [head, ...rows], layout: TableLayoutType.FIXED });
}

function image(file, widthIn) {
  const buf = fs.readFileSync(path.join(DIA, file));
  const w = buf.readUInt32BE(16), hgt = buf.readUInt32BE(20);
  const pxW = Math.round(widthIn * 96);
  const scale = Math.min(1, 1);
  let width = pxW, height = Math.round(pxW * hgt / w);
  const maxH = 6.2 * 96;
  if (height > maxH) { height = maxH; width = Math.round(maxH * w / hgt); }
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, keepNext: false,
    children: [new ImageRun({ type: 'png', data: buf, transformation: { width, height }, altText: { title: file, description: file, name: file } })],
  });
}

// ---------- build ----------
const tables = parseCql();
const names = GROUPS.flatMap(g => g[2]);
const missing = Object.keys(tables).filter(n => !names.includes(n));
const extra = names.filter(n => !tables[n]);
if (missing.length || extra.length) throw new Error(`group mismatch missing=${missing} extra=${extra}`);

const children = [];
children.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'Magic Lantern Workbench Platform', size: 28, color: '666666' })] }));
children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Cassandra Database Schema')] }));
children.push(p(`Keyspace mlw  ·  ${Object.keys(tables).length} tables  ·  Generated ${new Date().toISOString().slice(0, 10)}`, { run: { color: '666666' } }));
children.push(p('This document describes the Apache Cassandra schema defined by the CQL files in the cql directory of the repository: what each table is for, what each column holds, and how the tables relate to each other.'));
children.push(new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: BLUE })] }));
children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1 Overview
children.push(h('1. Overview', HeadingLevel.HEADING_1));
children.push(h('1.1 Conventions', HeadingLevel.HEADING_2));
const bullets = [
  ['Keyspace. ', 'All tables are in the keyspace mlw, created with SimpleStrategy and a replication factor of 1. This suits a single node and must be changed for a multi-node cluster.'],
  ['Identifiers. ', 'Identifiers (project_id, shot_id and so on) are text, so they can hold readable values such as SQ010. Frame numbers and positions are int.'],
  ['Partition and clustering keys. ', 'The partition key decides which rows are stored and read together. Clustering keys order the rows within a partition. Most tables are partitioned by their parent, so one query returns all of a parent’s children.'],
  ['References. ', 'Tables refer to each other by identifier columns, for example frame.layer_id or layer.asset_ref. Cassandra does not enforce these references. The application must keep them consistent.'],
  ['Collections. ', 'A few columns hold ordered lists of identifiers (review.comment_refs, camera.move_refs and camera.keyframe_refs). They suit small lists that are mostly appended to.'],
  ['Static columns. ', 'A static column is stored once per partition and shared by all its rows. The schema uses them for the name and description of a timeline and for the description of an audio track group.'],
  ['Lookup tables. ', 'user_by_email, project_by_user and review_by_frame repeat data from another table under a different key, to support a query the main table cannot answer. They must be written together with the main table, in a logged batch.'],
  ['Timestamps. ', 'Timestamp columns are stored as UTC. Applications should write UTC values.'],
  ['Descriptions. ', 'Most tables have a description column holding free text about the item the row represents.'],
];
for (const [b, t] of bullets) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: b, bold: true }), new TextRun(t)] }));

children.push(h('1.2 Table summary', HeadingLevel.HEADING_2));
const SW = [2300, 7060];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA }, columnWidths: SW, layout: TableLayoutType.FIXED,
  rows: [
    new TableRow({ tableHeader: true, children: ['Table', 'Purpose'].map((x, i) => cell(x, SW[i], { bold: true, fill: BLUE, color: 'FFFFFF' })) }),
    ...GROUPS.flatMap(g => g[2].map(n => new TableRow({ cantSplit: true, children: [cell(n, SW[0], { mono: true }), cell(PURPOSE[n].split('. ')[0].replace(/\.$/, '') + '.', SW[1])] }))),
  ],
}));

// 2 Diagrams
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h('2. Table Associations', HeadingLevel.HEADING_1));
children.push(p('The diagrams below show how the tables are associated. They use the following notation:'));
for (const t of [
  'A solid arrow points from the table that holds a reference to the table it refers to. The arrow is labelled with the referencing column.',
  'A line with a diamond at one end means the table at the diamond contains the other table’s rows. The label gives the number of rows, for example 1..* for one or more.',
  'A dashed box is a lookup table. A dashed line between tables means they hold the same data under different keys and are kept in sync.',
  'Colours group the tables: blue for the production hierarchy, green for assets and audio, orange for camera and timeline, purple for users and projects, red for review and grey for version control.',
]) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun(t)] }));
const figs = [
  ['2.1 Production hierarchy', 'overview.png', 'A project contains a production of one or more sequences. Each sequence has one or more scenes, each scene one or more shots, and each shot a list of frames. Each table in the chain is partitioned by its parent, so all the children of a parent are read together.'],
  ['2.2 Shot contents', 'frame.png', 'Layers, audio references, dialog and notes belong to a shot. A frame refers to them by identifier: layer_id for its layer and audio_ref, dialog_ref and note_ref for the rest. A layer can use an asset, and an audio reference names an audio track. A shot also has one exposure sheet.'],
  ['2.3 Audio tracks', 'audio.png', 'Audio tracks are shared across projects. An audio reference in a shot names a track, and a group of audio tracks (audio_tracks) lists tracks in order. The same track can appear in many groups and many shots.'],
  ['2.4 Camera and timeline', 'camera.png', 'A shot has cameras. A camera refers to its camera moves and keyframes through ordered lists of identifiers. A timeline is a separate ordered list of frames: each entry points at a frame by sequence, scene, shot and frame number.'],
  ['2.5 Users, projects and version control', 'users.png', 'A project is owned by a user and has members, listed in project_member and, from the user side, in project_by_user. user_by_email finds a user by email address. A version control belongs to a project and contains revisions, each made by a user.'],
  ['2.6 Review', 'review.png', 'A review points at a frame, names a reviewer (a user) and refers to a list of comments. review_by_frame lists the reviews of a frame and is kept in sync with review.'],
];
for (const [title, file, text] of figs) {
  children.push(h(title, HeadingLevel.HEADING_2));
  children.push(p(text, { keepNext: true }));
  children.push(image(file, 6.4));
}

// 3 Tables
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h('3. Table Reference', HeadingLevel.HEADING_1));
children.push(p('Each table below lists its columns in key order: partition key columns first, then clustering key columns, then the other columns. The Key column shows the role of each column.'));
let gi = 0;
for (const [title, intro, list] of GROUPS) {
  gi++;
  children.push(h(`3.${gi} ${title}`, HeadingLevel.HEADING_2));
  children.push(p(intro));
  for (const n of list) {
    const t = tables[n];
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(`${n}`)] }));
    children.push(new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [new TextRun(PURPOSE[n])] }));
    const pk = t.clustering.length
      ? `Primary key: partition (${t.partition.join(', ')}), clustering (${t.clustering.join(', ')})${t.descOrder ? `, ${t.descOrder} descending` : ''}.`
      : `Primary key: partition (${t.partition.join(', ')}).`;
    children.push(new Paragraph({ keepNext: true, spacing: { after: 100 }, children: [new TextRun({ text: pk, italics: true, color: '444444' })] }));
    children.push(columnsTable(t));
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }
}

const doc = buildDocument('Cassandra Database Schema', 'MLW Cassandra Schema', children);
write(doc, OUT);
