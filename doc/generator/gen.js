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

// ---------- descriptions ----------
const GEN = {
  project_id: 'Identifier of the project the row belongs to (project.project_id).',
  sequence_id: 'Identifier of the sequence the row belongs to.',
  scene_id: 'Identifier of the scene the row belongs to.',
  shot_id: 'Identifier of the shot the row belongs to.',
  frame_number: 'Number of the frame within the shot.',
  start_frame: 'First frame number of the range, within the shot.',
  end_frame: 'Last frame number of the range, within the shot.',
  description: 'Free-text description of the item the row represents.',
  created_at: 'Date and time the row was created, stored as a UTC timestamp.',
};
const SPEC = {
  production: {
    sequence_id: 'Identifier of a sequence in the production. The table holds one row per sequence.',
    title: 'Title of the sequence.',
    description: 'Description of the sequence.',
  },
  sequence: {
    scene_id: 'Identifier of a scene in the sequence. The table holds one row per scene.',
    description: 'Description of the scene.',
  },
  scene: {
    shot_id: 'Identifier of a shot in the scene. The table holds one row per shot.',
    description: 'Description of the shot.',
  },
  shot: {
    shot_id: 'Identifier of the shot. The table holds one row per shot.',
    description: 'Description of the shot.',
    frame_rate: 'Frame rate of the shot in frames per second, for example 24 or 23.976.',
    start_frame: 'First frame number of the shot.',
    end_frame: 'Last frame number of the shot.',
  },
  frame: {
    layer_id: 'Layer the row belongs to (layer.layer_id). A frame has one row per layer.',
    audio_ref: 'Identifier of the audio reference attached to the frame (audio_ref.audio_ref_id).',
    dialog_ref: 'Identifier of the dialog attached to the frame (dialog.dialog_id).',
    note_ref: 'Identifier of the note attached to the frame (note.note_id).',
    description: 'Description of this layer of the frame.',
  },
  layer: {
    layer_id: 'Unique identifier of the layer within the shot.',
    name: 'Display name of the layer.',
    type: 'Kind of layer, as free text.',
    z_order: 'Stacking order of the layer within the shot.',
    visibility: 'Whether the layer is visible.',
    asset_ref: 'Identifier of the asset used by the layer (asset.asset_id).',
    description: 'Description of the layer.',
  },
  exposure_sheet: {
    xml_url: 'URL of the exposure sheet XML file.',
    svg_url: 'URL of the exposure sheet SVG file.',
    description: 'Description of the exposure sheet.',
  },
  asset: {
    asset_id: 'Unique identifier of the asset. Assets are shared across projects.',
    name: 'Display name of the asset.',
    category: 'Category the asset belongs to, as free text.',
    version: 'Version of the asset, as text (for example 1.2.0). The table holds only the current version.',
    source_url: 'URL the asset was obtained from or is stored at.',
    description: 'Description of the asset.',
  },
  audio_ref: {
    audio_ref_id: 'Unique identifier of the audio reference within the shot.',
    track: 'Identifier of the audio track being referenced (track.track_id).',
    start_frame: 'Frame at which the audio starts, within the shot.',
    end_frame: 'Frame at which the audio ends, within the shot.',
    description: 'Description of the audio reference.',
  },
  dialog: {
    dialog_id: 'Unique identifier of the dialog within the shot.',
    phoneme: 'Phoneme of the dialog, as text.',
    description: 'Description of the dialog.',
  },
  note: {
    note_id: 'Unique identifier of the note within the shot.',
    note_text: 'Text of the note.',
  },
  timeline: {
    timeline_id: 'Unique identifier of the timeline within the project.',
    position: 'Position of the entry in the timeline. Entries are read in ascending order. Use spaced values (10, 20, 30) to leave room for insertions.',
    name: 'Name of the timeline. Stored once per timeline and shared by all its entries.',
    description: 'Description of the timeline. Stored once per timeline and shared by all its entries.',
    sequence_id: 'Sequence of the frame this entry points at (frame.sequence_id).',
    scene_id: 'Scene of the frame this entry points at (frame.scene_id).',
    shot_id: 'Shot of the frame this entry points at (frame.shot_id).',
    frame_number: 'Number of the frame this entry points at (frame.frame_number). The entry covers all layers of that frame.',
  },
  camera_move: {
    camera_move_id: 'Unique identifier of the camera move within the shot.',
    type: 'Kind of camera move, as free text (for example pan or zoom).',
    start_frame: 'Frame at which the move starts, within the shot.',
    end_frame: 'Frame at which the move ends, within the shot.',
    description: 'Description of the camera move.',
  },
  keyframe: {
    keyframe_id: 'Unique identifier of the keyframe within the shot.',
    frame_number: 'Frame number of the keyframe, within the shot.',
    x: 'X position of the camera at the keyframe.',
    y: 'Y position of the camera at the keyframe.',
    z: 'Z position of the camera at the keyframe.',
    zoom: 'Zoom factor of the camera at the keyframe.',
    focal_length: 'Focal length of the camera at the keyframe.',
    interpolation: 'How values are interpolated from this keyframe to the next, as free text (for example linear).',
    note: 'Note about the keyframe.',
    description: 'Description of the keyframe.',
  },
  camera: {
    camera_id: 'Unique identifier of the camera within the shot.',
    name: 'Display name of the camera.',
    projection: 'Projection used by the camera, as free text (for example perspective or orthographic).',
    move_refs: 'Ordered list of camera moves belonging to the camera (camera_move.camera_move_id).',
    keyframe_refs: 'Ordered list of keyframes belonging to the camera (keyframe.keyframe_id).',
    description: 'Description of the camera.',
  },
  user: {
    user_id: 'Unique identifier of the user.',
    username: 'Login name of the user.',
    email: 'Email address of the user. Also the key of user_by_email.',
    display_name: 'Name shown for the user.',
    role: 'Role of the user in the application, as free text (for example admin or artist).',
    created_at: 'Date and time the user was created, stored as a UTC timestamp.',
    description: 'Description of the user.',
  },
  user_by_email: {
    email: 'Email address to look up (user.email).',
    user_id: 'Identifier of the user with that email address (user.user_id).',
  },
  project: {
    name: 'Display name of the project.',
    status: 'Status of the project, as free text (for example active or archived).',
    owner_id: 'Identifier of the user who owns the project (user.user_id).',
    created_at: 'Date and time the project was created, stored as a UTC timestamp.',
    description: 'Description of the project.',
  },
  project_member: {
    user_id: 'Identifier of the member (user.user_id). The table holds one row per member.',
    role: 'Role of the member in this project, as free text.',
    added_at: 'Date and time the member was added, stored as a UTC timestamp.',
  },
  project_by_user: {
    user_id: 'Identifier of the user (user.user_id).',
    project_id: 'Identifier of a project the user belongs to (project.project_id). The table holds one row per project.',
    role: 'Role of the user in the project. Copied from project_member.',
    added_at: 'Date and time the user was added to the project. Copied from project_member.',
  },
  review: {
    review_id: 'Unique identifier of the review within the project.',
    sequence_id: 'Sequence of the reviewed frame (frame.sequence_id).',
    scene_id: 'Scene of the reviewed frame (frame.scene_id).',
    shot_id: 'Shot of the reviewed frame (frame.shot_id).',
    frame_number: 'Number of the reviewed frame (frame.frame_number).',
    reviewer: 'Identifier of the user doing the review (user.user_id).',
    status: 'Status of the review, as free text (for example pending, approved or rejected).',
    comment_refs: 'Ordered list of comments on the review (comment.comment_id).',
    description: 'Description of the review.',
  },
  comment: {
    comment_id: 'Unique identifier of the comment within the project.',
    comment_text: 'Text of the comment.',
  },
  review_by_frame: {
    review_id: 'Identifier of a review of the frame (review.review_id). The table holds one row per review.',
    reviewer: 'Identifier of the reviewer. Copied from review.',
    status: 'Status of the review. Copied from review.',
    frame_number: 'Number of the reviewed frame (frame.frame_number).',
  },
  track: {
    track_id: 'Unique identifier of the audio track. Tracks are shared across projects.',
    name: 'Display name of the track.',
    type: 'Kind of track, as free text (for example music, dialog or effects).',
    file_name: 'Original name of the audio file.',
    url: 'URL of the audio file.',
    description: 'Description of the track.',
  },
  audio_tracks: {
    audio_tracks_id: 'Unique identifier of the group of audio tracks. Groups are shared across projects.',
    position: 'Position of the entry in the group. Entries are read in ascending order.',
    description: 'Description of the group. Stored once per group and shared by all its entries.',
    track_id: 'Identifier of the track in this entry (track.track_id).',
  },
  version_control: {
    version_control_id: 'Unique identifier of the version control within the project.',
    description: 'Description of the version control.',
  },
  revision: {
    version_control_id: 'Identifier of the version control the revision belongs to (version_control.version_control_id).',
    revision_number: 'Revision number. Revisions are read newest first.',
    author: 'Identifier of the user who made the revision (user.user_id).',
    created_at: 'Date and time of the revision, stored as a UTC timestamp.',
    description: 'Descriptive text for the revision.',
  },
};
function describe(table, col) {
  const s = SPEC[table] && SPEC[table][col];
  if (s) return s;
  if (GEN[col]) return GEN[col];
  const own = col.endsWith('_id') ? `Unique identifier of the ${table.replace(/_/g, ' ')}.` : null;
  if (own) return own;
  throw new Error(`no description for ${table}.${col}`);
}

const PURPOSE = {
  production: 'Holds the production hierarchy at its top level. A production is one or more sequences, so the table has one row per sequence, partitioned by project. Reading one partition returns all sequences of a project in order.',
  sequence: 'A sequence is one or more scenes. The table has one row per scene, partitioned by project and sequence, so one query returns all scenes of a sequence.',
  scene: 'A scene is one or more shots. The table has one row per shot, partitioned by project, sequence and scene, so one query returns all shots of a scene.',
  shot: 'Holds the attributes of a single shot: its frame rate and its first and last frame. There is one row per shot, found by the full shot key.',
  frame: 'A shot is a list of frames. The table has one row per layer of each frame, partitioned by shot and ordered by frame number and then layer. It references audio, dialog and notes attached to the frame.',
  layer: 'Layers available to a shot, one row per layer, partitioned by shot. A layer can use an asset.',
  exposure_sheet: 'Exposure sheet of a shot, held as references to an XML file and an SVG file. There is one row per shot.',
  asset: 'Reusable assets, one row per asset. Assets are not tied to a project, so they can be shared by all projects.',
  audio_ref: 'Audio attached to frames of a shot. Each row names an audio track and the range of frames it covers. Partitioned by shot.',
  dialog: 'Dialog attached to frames of a shot, held as a phoneme. Partitioned by shot.',
  note: 'Notes attached to frames of a shot. A note holds only text. Partitioned by shot.',
  timeline: 'A timeline is an ordered sequence of frames. The table has one row per entry, partitioned by timeline and ordered by position. Each entry points at a frame by its sequence, scene, shot and frame number.',
  camera_move: 'Camera moves of a shot, such as a pan or zoom, with the frame range they cover. Partitioned by shot.',
  keyframe: 'Camera keyframes of a shot: the camera position, zoom and focal length at a frame number, and how values are interpolated to the next keyframe. Partitioned by shot.',
  camera: 'A camera of a shot. A camera is a collection of camera moves and keyframes, held as ordered lists of their identifiers. Partitioned by shot.',
  user: 'Application users, one row per user, found by user identifier. No credentials are stored.',
  user_by_email: 'Lookup table that finds a user by email address. It duplicates data from user and must be kept in sync with it.',
  project: 'Projects, one row per project, found by project identifier. Every table that has a project_id column refers to this table.',
  project_member: 'The users who work on a project, one row per member, partitioned by project. Reading one partition lists the members of a project.',
  project_by_user: 'Lookup table that lists the projects a user belongs to, one row per project, partitioned by user. It duplicates data from project_member and must be kept in sync with it.',
  review: 'Reviews of frames, one row per review, partitioned by project. A review points at a frame, names a reviewer and has a status, and refers to its comments.',
  comment: 'Text of comments on reviews. A review refers to its comments through review.comment_refs.',
  review_by_frame: 'Lookup table that lists the reviews of a frame, one row per review, partitioned by frame. It duplicates data from review and must be kept in sync with it.',
  track: 'Audio tracks, one row per track. Tracks are shared across projects. A track points at its audio file by URL.',
  audio_tracks: 'A group of audio tracks, shared across projects. The table has one row per entry, partitioned by group and ordered by position. Each entry points at a track.',
  version_control: 'Version control of a project, one row per version control. Its revisions are the rows of revision that share its key.',
  revision: 'Revisions of a version control, one row per revision, partitioned by version control and read newest first.',
};

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
