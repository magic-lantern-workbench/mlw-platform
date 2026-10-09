// Builds the release notes. Usage: node gen_release_notes.js <output.docx>
const {
  d, BLUE, p, h, cell, buildDocument, write,
} = require('./lib');
const {
  HeadingLevel, Table, TableRow, WidthType, TableOfContents, Paragraph, TextRun,
  PageBreak, ShadingType, TableLayoutType,
} = d;

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node gen_release_notes.js <output.docx>'); process.exit(1); }

const VERSION = '1.0.0';
const DATE = '2026-10-09';

const children = [];
const add = (...x) => children.push(...x);
const H1 = (t, o = {}) => add(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, ...o, children: [new TextRun(t)] }));
const H2 = t => add(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(t)] }));
const para = (t, o = {}) => add(p(t, o));
const runs = parts => (Array.isArray(parts) ? parts : [parts]).map(x => new TextRun(typeof x === 'string' ? { text: x } : x));
const b = text => ({ text, bold: true });
const bullet = parts => add(new Paragraph({ bullet: { level: 0 }, spacing: { after: 70 }, children: runs(parts) }));
const note = (label, text) => add(new Paragraph({
  spacing: { before: 80, after: 160 }, indent: { left: 120, right: 120 },
  shading: { type: ShadingType.CLEAR, fill: 'EEF3FA', color: 'auto' },
  children: [new TextRun({ text: label + ' ', bold: true, color: BLUE }), new TextRun(text)],
}));
function code(text, label) {
  const lines = text.replace(/\n$/, '').split('\n');
  if (label) add(new Paragraph({ keepNext: true, spacing: { before: 80, after: 40 }, children: [new TextRun({ text: label, bold: true, size: 20 })] }));
  lines.forEach((l, i) => add(new Paragraph({
    keepNext: i < lines.length - 1, keepLines: true,
    spacing: { after: i === lines.length - 1 ? 160 : 0, line: 252 },
    shading: { type: ShadingType.CLEAR, fill: 'F1F4F8', color: 'auto' },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: l === '' ? ' ' : l, font: 'Consolas', size: 18 })],
  })));
}
function grid(widths, head, rows, o = {}) {
  const total = widths.reduce((a, c) => a + c, 0);
  const mk = (r, header) => new TableRow({
    tableHeader: header, cantSplit: true,
    children: r.map((t, c) => cell(t, widths[c], header
      ? { bold: true, fill: BLUE, color: 'FFFFFF', keepNext: true }
      : { mono: (o.mono || []).includes(c), bold: (o.bold || []).includes(c) })),
  });
  add(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [mk(head, true), ...rows.map(r => mk(r, false))],
  }));
  add(new Paragraph({ spacing: { after: 160 }, children: [] }));
}

// ---------- front matter ----------
add(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'Magic Lantern Workbench Platform', size: 28, color: '666666' })] }));
add(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`Release Notes, Version ${VERSION}`)] }));
add(p(`Released ${DATE}  ·  MIT License  ·  Copyright (c) 2026 Wizzer Works`, { run: { color: '666666' } }));
add(p('Version 1.0.0 is the first release of the Magic Lantern Workbench Platform. It provides the Cassandra database for production management, a REST API and web user interface for the data, and login through Keycloak, all started with Docker Compose.'));
add(new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: BLUE })] }));
add(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }));

// ---------- 1 ----------
H1('1. Overview', { pageBreakBefore: true });
para('The platform is the core foundation of the Magic Lantern Workbench. This release delivers three parts that run together:');
bullet([b('Cassandra database.'), ' A schema of 28 tables that describes a production, from the production itself down to the frames and layers of every shot, with the audio, camera, timeline, review, user, project and version control data around it.']);
bullet([b('Application.'), ' A Go program that serves a REST API for every table and a web user interface for browsing and editing the data, with interactive API documentation.']);
bullet([b('Keycloak.'), ' The login service. People sign in to the web user interface through Keycloak, and the API accepts the access tokens it issues.']);
para('Everything runs in Docker containers started from the Compose files in the repository, for local development and for a server.');

// ---------- 2 ----------
H1('2. What Is in This Release');
H2('2.1 Database schema');
bullet(['28 tables in 13 CQL files (cql/), in the keyspace mlw. The files only use IF NOT EXISTS, so they can be applied repeatedly.']);
bullet(['The production hierarchy is ', b('production > episode > sequence > scene > shot > frame'), '. A production is one or more episodes, an episode is one or more sequences, and so on. Each table holds the children of one parent, so a single query returns them together.']);
bullet(['Every table that identifies a shot or a frame carries episode_id, as well as sequence_id, scene_id and shot_id.']);
bullet(['Each level of the hierarchy has a URL column that points at the item in an asset management tool: episode_url, sequence_url and scene_url (static columns, stored once per partition), shot_url and frame_url.']);
bullet(['Around the hierarchy: layers, assets, audio tracks and references, dialog, notes, camera moves, keyframes, cameras, timelines, exposure sheets, reviews and comments, users, projects and project members, and version control with revisions.']);
bullet(['Lookup tables (user_by_email, project_by_user, review_by_frame) are kept in step with their source tables by the application and are read-only.']);

H2('2.2 REST API');
bullet(['One resource per table under /api/v1: create (POST), read one row or a page of rows (GET), replace (PUT), change (PATCH) and delete (DELETE). The tables are discovered from the database when the application starts, so the API follows the schema.']);
bullet(['Paging, static column handling, validation with clear JSON errors, and a health check.']);
bullet(['The API is described as an OpenAPI 3.0 specification (85 paths, 189 operations), served at /api/v1/openapi.yaml and shown in the web user interface as Swagger UI.']);

H2('2.3 Web user interface');
bullet(['Browse any table by key, page through rows, create, edit and delete rows.']);
bullet(['An API documentation page with “Try it out” that uses your login.']);
bullet(['A login page, the signed-in user’s name, and Sign out.']);

H2('2.4 Authentication and security');
bullet([b('Login with Keycloak'), ' (OpenID Connect, authorization code flow with PKCE). The realm mlw and its client are created from files in docker/keycloak when Keycloak starts. The local realm has a test user; the production realm has none.']);
bullet(['The API checks the signature, issuer, expiry and client of every access token, refuses ID tokens, and can require a realm role (OIDC_REQUIRED_ROLE).']);
bullet(['The static API token (API_TOKEN) is still supported, for scripts. The production Compose file requires one.']);
bullet(['HTTPS for the application and TLS for the Cassandra connection, with a script that makes development certificates (scripts/gen-certs.sh) and an overlay file (docker-compose.tls.yml).']);

H2('2.5 Docker Compose setup');
grid([2300, 3200, 3860], ['File', 'Used for', 'Adds'], [
  ['docker-compose.yml', 'All setups', 'Cassandra 5.0, Keycloak 26.4.0 and the application image.'],
  ['docker-compose.override.yml', 'Local development (loaded automatically)', 'Ports on localhost, the schema applied at startup, Keycloak in start-dev mode with the test realm and user.'],
  ['docker-compose.prod.yml', 'A server', 'Cassandra password authentication, restart on boot, Keycloak in production mode with its own PostgreSQL database, required passwords and addresses.'],
  ['docker-compose.tls.yml', 'HTTPS and TLS', 'HTTPS for the application and TLS to Cassandra.'],
], { mono: [0] });

H2('2.6 Documentation');
grid([4300, 5060], ['Document', 'Contents'], [
  ['README.md', 'Setup, schema files, configuration, HTTPS, Keycloak and login, development.'],
  ['doc/MLW_Cassandra_Schema.docx', 'Every table and column, with association diagrams.'],
  ['doc/MLW_REST_API.docx', 'The REST API, with a section for every table.'],
  ['doc/openapi.yaml', 'The REST API as an OpenAPI 3.0 specification.'],
  ['doc/MLW_Keycloak.docx', 'User guide for Keycloak and the application login, with screenshots.'],
  ['doc/licenses.txt', 'The licenses of this project and of the software it uses.'],
  ['doc/mlw-platform-v1.0.0-Release-Notes.docx', 'This document.'],
], { mono: [0] });
para('The Word documents and the OpenAPI file are generated by doc/generator/build.sh and follow the CQL files.');

// ---------- 3 ----------
H1('3. Requirements');
grid([2600, 6760], ['Item', 'Requirement'], [
  ['Docker', 'Docker Engine with Docker Compose v2. Everything else, including the Go and web builds, runs in containers.'],
  ['Ports (local)', '8090 for the application, 8180 for Keycloak, 9042 for Cassandra. All are bound to 127.0.0.1.'],
  ['Memory', 'The local Cassandra heap is 512 MB and the production heap is 2 GB (CASSANDRA_MAX_HEAP_SIZE). Plan for Keycloak and the application on top of that.'],
  ['Browser', 'A current browser with JavaScript enabled, for the web user interface and the Keycloak login.'],
  ['Development', 'Go 1.25 for the Go tests; Node.js for the web build and the login test; Chrome or Chromium for the login test. To rebuild the documents: Node.js, Graphviz, LibreOffice and Python 3.'],
]);

// ---------- 4 ----------
H1('4. Installing');
H2('4.1 Local development');
code('git clone <repo-url> && cd mlw-platform\ndocker compose up -d --build', 'Start');
para('The application waits for Cassandra and creates the schema. When Keycloak has started, open http://localhost:8090 and sign in as mlw with the password mlw. The Keycloak administrator is admin with the password admin (http://localhost:8180). These accounts exist only in local development.');

H2('4.2 A server');
code('cp .env.example .env     # then edit it\ndocker compose -f docker-compose.yml -f docker-compose.prod.yml up -d', 'Start');
para('Set these values in .env first, because Compose refuses to start without them:');
bullet(['API_TOKEN, and the Cassandra password settings.']);
bullet(['KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_DB_PASSWORD and KEYCLOAK_HOSTNAME (the public address of Keycloak).']);
bullet(['APP_PUBLIC_URL (the address people open the application at).']);
para('Set APPLY_SCHEMA=true for the first start to create the tables. Put a reverse proxy that terminates HTTPS in front of Keycloak, and in front of the application unless it serves HTTPS itself. Then create the application users in the Keycloak admin console; see the Keycloak user guide.');
note('Important:', 'The production Cassandra starts with the default account cassandra / cassandra. Create your own superuser and change that password straight away (see the README).');

H2('4.3 Checking the installation');
bullet(['http://localhost:8090/api/v1/health answers {"status":"ok"} without a login.']);
bullet(['The login page appears at the application address, and signing in shows the 28 tables.']);

// ---------- 5 ----------
H1('5. Upgrade Notes');
para('This is the first release, so there is nothing to upgrade from. If you have a database from the pre-release schema (before the episode level was added), note this:');
bullet(['Cassandra cannot change a primary key. The tables whose keys now include episode_id (production, scene, shot, frame, exposure_sheet, layer, audio_ref, dialog, note, camera_move, keyframe, camera, review_by_frame) must be dropped and recreated, or a new keyspace used. Their data has to be reloaded.']);
bullet(['timeline and review only gained a regular column (ALTER TABLE ... ADD episode_id text).']);
bullet(['The URL columns can be added in place with ALTER TABLE (static for episode_url, sequence_url and scene_url).']);
bullet(['The Keycloak realm is created only when it does not exist. If you started Keycloak with an older realm, remove its volume (docker compose down -v, which deletes all data) or make the changes in the admin console.']);

// ---------- 6 ----------
H1('6. Known Limitations');
bullet([b('Single node.'), ' The keyspace uses SimpleStrategy with replication factor 1. Change it before running a multi-node cluster.']);
bullet([b('Authorization is coarse.'), ' Every user who may sign in can read and change all data. The only restriction is the optional required realm role (OIDC_REQUIRED_ROLE). There are no per-project or per-table permissions.']);
bullet([b('References are not enforced.'), ' Cassandra does not check references between tables, such as the frame references in a timeline or a review.']);
bullet([b('frame_url is stored per layer.'), ' A frame has one row per layer, so each layer row holds its own copy of the URL.']);
bullet([b('Keycloak is plain HTTP.'), ' It needs a reverse proxy for HTTPS, and docker-compose.tls.yml does not cover it.']);
bullet([b('Local defaults are insecure.'), ' The admin / admin and mlw / mlw accounts, and password sign-in through the API, exist only in the local setup. Never use them on a server.']);
bullet([b('No email.'), ' Keycloak has no mail server configured, so “Forgot Password?” does not send mail. An administrator resets passwords.']);
bullet([b('Message after a refused login.'), ' If the API refuses a login that never worked, the login page says “Your account does not provide access”, for example when the required role is missing. If a working login is refused later, it says “Your session has ended”.']);
bullet([b('Not covered by automated tests.'), ' The renewal of access tokens in the background (they last 5 minutes), and the steps for creating a permanent administrator in the Keycloak master realm.']);
bullet([b('File object store.'), ' The file object store named in the README is not part of this release.']);

// ---------- 7 ----------
H1('7. Quality and Testing');
para('For this release the following checks were run:');
grid([3300, 6060], ['Check', 'Result'], [
  ['go vet and gofmt', 'Clean.'],
  ['Go unit tests (api, config, oidcauth, schema, tlsutil, store)', 'Pass.'],
  ['Integration tests against Cassandra 5.0 (CRUD, paging, static columns, URL columns, lookup tables, review sync)', 'Pass, against a throw-away Cassandra container with the 13 CQL files applied.'],
  ['End-to-end login test (scripts/test-login.sh)', 'Passed when last run, with a real Keycloak and a headless Chrome: sign-in, wrong password, session, API access with valid, tampered and ID tokens, sign-out. It was not re-run for the final message change, which was tested in a browser separately.'],
]);
para('The integration tests write rows under the project id itest and remove them again. Run them with CASSANDRA_TEST_HOSTS set to a Cassandra that has the schema.');

// ---------- 8 ----------
H1('8. Licenses');
para('The platform is released under the MIT License, Copyright (c) 2026 Wizzer Works (file LICENSE). The software compiled or bundled into the application uses permissive licenses (MIT, BSD, ISC and Apache-2.0). The services in the Compose files are separate programs: Apache Cassandra and Keycloak (Apache-2.0) and PostgreSQL (PostgreSQL License). The complete list, with the obligations when you redistribute, is in doc/licenses.txt.');

const doc = buildDocument(`MLW Platform ${VERSION} Release Notes`, `MLW Platform ${VERSION} Release Notes`, children);
write(doc, OUT);
