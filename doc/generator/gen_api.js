// Builds the REST API document. Usage: node gen_api.js <output.docx>
// The per-table sections are generated from cql/*.cql, so they follow the schema.
const {
  d, parseCql, FONT, BLUE, p, h, border, borders, cell, buildDocument, write,
  sample, typeOf, keyOf, exampleBody,
} = require('./lib');
const {
  HeadingLevel, Table, TableRow, WidthType, TableOfContents, Paragraph, TextRun,
  ShadingType, PageBreak, TableLayoutType,
} = d;

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node gen_api.js <output.docx>'); process.exit(1); }

const tables = parseCql();
const LOOKUP = { user_by_email: 'user', project_by_user: 'project_member', review_by_frame: 'review' };
const BASE = 'http://localhost:8090';

// ---------- helpers ----------
const children = [];
const add = (...x) => children.push(...x);
const H1 = t => add(h(t, HeadingLevel.HEADING_1));
const H2 = t => add(h(t, HeadingLevel.HEADING_2));
const H3 = t => add(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [new TextRun(t)] }));
const para = (t, o = {}) => add(p(t, o));
const lead = (t) => add(p(t, { keepNext: true }));
const bullet = (parts) => add(new Paragraph({
  bullet: { level: 0 }, spacing: { after: 70 },
  children: (Array.isArray(parts) ? parts : [parts]).map(x => typeof x === 'string' ? new TextRun(x) : new TextRun(x)),
}));
const b = (text) => ({ text, bold: true });
const mono = (text) => ({ text, font: 'Consolas', size: 20 });

// A block of code or JSON, one shaded paragraph per line so it stays together.
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
  const mk = (r, i, header) => new TableRow({
    tableHeader: header, cantSplit: true,
    children: r.map((t, c) => cell(t, widths[c], header
      ? { bold: true, fill: BLUE, color: 'FFFFFF', keepNext: true }
      : { mono: (o.mono || []).includes(c), bold: !head && c === 0, fill: !head && c === 0 ? 'EEF3FA' : undefined, keepNext: i < rows.length - 1 && !!o.keep })),
  });
  add(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [...(head ? [mk(head, -1, true)] : []), ...rows.map((r, i) => mk(r, i, false))],
  }));
  add(new Paragraph({ spacing: { after: 160 }, children: [] }));
}

const keyVals = (t, n) => keyOf(t).slice(0, n).map(k => encodeURIComponent(String(sample(k, typeOf(t, k)))));
const pathFor = (t, n) => '/api/v1/' + t.name + keyVals(t, n).map(v => '/' + v).join('');
const tmpl = (t, n) => '/api/v1/' + t.name + keyOf(t).slice(0, n).map(k => '/{' + k + '}').join('');

// ---------- front matter ----------
add(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'Magic Lantern Workbench Platform', size: 28, color: '666666' })] }));
add(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('REST API')] }));
add(p(`Version 1  ·  ${Object.keys(tables).length} resources  ·  Generated ${new Date().toISOString().slice(0, 10)}`, { run: { color: '666666' } }));
add(p('This document describes the REST API of the MLW application. The API creates, reads, updates and deletes the rows of the tables in the Cassandra keyspace mlw. The tables themselves are described in the separate document MLW_Cassandra_Schema.docx.'));
add(new Paragraph({ spacing: { before: 480, after: 120 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: BLUE })] }));
add(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }));
add(new Paragraph({ children: [new PageBreak()] }));

// ---------- 1 Overview ----------
H1('1. Overview');
H2('1.1 What the API does');
para('The application is a single Go program that serves this REST API and a web user interface (built with Vue and embedded in the program). Both talk to a Cassandra database, either the cassandra service in the Docker Compose files or a remote Cassandra.');
para('The API has one resource per table. The tables are discovered from the database when the application starts, so the API follows the schema. For each table the API supports the usual create, read, update and delete operations on the table’s rows:');
bullet([b('Create'), ' a row with POST.']);
bullet([b('Read'), ' one row, or a list of rows, with GET.']);
bullet([b('Update'), ' a row with PUT (replace) or PATCH (change some columns).']);
bullet([b('Delete'), ' a row with DELETE.']);
para('The API is also described as an OpenAPI 3.0 specification (section 2.2). The web user interface shows it as interactive documentation, and the file openapi.yaml can be loaded into Postman or a code generator.');
para('Tables and columns are not created or dropped through the API. The schema is defined by the CQL files in the cql directory.');

H2('1.2 Base URL');
para(`All endpoints are under /api/v1. With the Docker Compose files the application listens on port 8090 of the host by default (APP_PORT), bound to 127.0.0.1 (APP_BIND). The examples in this document use ${BASE}.`);
para('The web user interface is served from the root path (/) of the same server.');
para('The application can serve HTTPS itself: set TLS_CERT_FILE and TLS_KEY_FILE (section 5) and use https:// in the URLs. The docker-compose.tls.yml file does this for local development, with certificates made by scripts/gen-certs.sh. Alternatively put a reverse proxy that terminates HTTPS in front of the application. The examples in this document use plain HTTP; with HTTPS add --cacert <ca.pem> to curl when the certificate comes from a private CA.');

H2('1.3 Request and response format');
bullet('Requests with a body and all responses use JSON encoded as UTF-8. Send the header Content-Type: application/json with a body.');
bullet('Column names are used exactly as in the database (lower case with underscores).');
bullet('A column that has no value is null. When you create a row you can leave out columns that have no value.');
bullet('Timestamps are RFC 3339 strings in UTC, for example 2026-10-05T12:00:00Z. A value with another time zone offset is converted to UTC.');
bullet('Request bodies are limited to 1 MB.');

H2('1.4 Resource paths and keys');
para('A row is addressed by the values of its primary key, in key order, as path segments after the table name:');
code('/api/v1/{table}/{partition key values...}/{clustering key values...}');
para('Each key value is a URL-encoded path segment (a space is %20 and a slash is %2F). Integer key columns, such as frame_number, take the number as text. Key values must not be empty. The key columns of every table are listed in section 4.');
para('Cassandra stores the rows of one partition together, in clustering key order. A list request therefore needs all the partition key columns, and may add clustering key values to narrow the list.');

H2('1.5 Authentication');
para('If the application is started with the environment variable API_TOKEN, every request under /api/v1 (except the health check) must send the token as a bearer token:');
code(`curl -H 'Authorization: Bearer <token>' ${BASE}/api/v1/tables`);
para('If the application is also started with OIDC_ISSUER (login with Keycloak), the bearer token can instead be an access token issued by that realm to the client mlw-app. The application checks its signature, issuer, expiry and client, and the realm role in OIDC_REQUIRED_ROLE if one is set. ID tokens are refused. The web user interface logs in with the authorization code flow with PKCE and sends the access token; the endpoint GET /api/v1/auth/config, which needs no token, tells it the issuer and client id. A static API token and Keycloak login can be used together, for example the token for scripts.');
para('A missing or wrong token gives 401 Unauthorized. If neither API_TOKEN nor OIDC_ISSUER is set the API is open, and the application logs a warning at startup. The production Compose file requires a token. The token is sent in every request, so use HTTPS whenever the API is reachable over a network (section 1.2).');

H2('1.6 Errors');
para('Errors use an HTTP status code and a JSON body with a machine-readable code and a message:');
code('{\n  "error": {\n    "code": "not_found",\n    "message": "no row with this key"\n  }\n}');
grid([1000, 1800, 6560], ['Status', 'Code', 'Meaning'], [
  ['400', 'bad_request', 'The request cannot be used: invalid JSON, an unknown column, a value of the wrong type, a missing key column, the wrong number of key values in the path, or an invalid limit or pageState.'],
  ['401', 'unauthorized', 'The bearer token is missing or wrong.'],
  ['404', 'not_found', 'There is no such table or endpoint, or no row has the given key.'],
  ['405', 'read_only', 'The table is a lookup table that the API maintains itself (section 1.8) and cannot be written directly.'],
  ['409', 'conflict', 'A row with the key already exists (create), or the email is already used by another user.'],
  ['500', 'internal', 'An unexpected error. The message describes it.'],
  ['503', 'unavailable', 'The database cannot be reached or timed out. Try again.'],
], { mono: [0, 1] });

H2('1.7 Paging');
para('List requests return one page of rows. The query parameter limit sets the page size (1 to 1000, default 100). When more rows follow, the response contains nextPageState. Send it back as the query parameter pageState to get the next page, with the same path and limit. When nextPageState is null there are no more rows.');
para('A page state is an opaque value. Do not change it, and do not use it with a different path.');

H2('1.8 Lookup tables');
para('Some tables repeat data from another table under a different key, so that a different question can be answered with one query. The API keeps these lookup tables in step with their source tables. They can be read, but not created, changed or deleted directly (405 read_only).');
grid([2300, 2300, 4760], ['Lookup table', 'Source table', 'Behaviour'], [
  ['user_by_email', 'user', 'Finds a user by email address. Creating or changing a user with an email address that another user already has fails with 409. Changing a user’s email replaces the lookup row. Deleting a user removes it.'],
  ['project_by_user', 'project_member', 'Lists the projects of a user. Adding, changing or removing a project member updates it.'],
  ['review_by_frame', 'review', 'Lists the reviews of a frame. Creating a review, changing its frame, reviewer or status, or deleting it updates it.'],
], { mono: [0, 1] });
para('The source row is written first, then the lookup row. If the second write fails, the request fails with 500 and says so. Repeating the update (a PATCH with the same values) repairs the lookup row.');

// ---------- 2 Endpoints ----------
add(new Paragraph({ children: [new PageBreak()] }));
H1('2. Endpoints');
grid([1150, 4300, 2200, 1710], ['Method', 'Path', 'Purpose', 'Success'], [
  ['GET', '/api/v1/health', 'Check the service and database', '200'],
  ['GET', '/api/v1/openapi.yaml', 'The OpenAPI specification', '200'],
  ['GET', '/api/v1/tables', 'List the tables', '200'],
  ['GET', '/api/v1/tables/{table}', 'Describe one table', '200'],
  ['GET', '/api/v1/{table}', 'Scan a table', '200'],
  ['GET', '/api/v1/{table}/{keys...}', 'List rows or get one row', '200'],
  ['POST', '/api/v1/{table}', 'Create a row', '201'],
  ['PUT', '/api/v1/{table}/{keys...}', 'Replace a row', '200'],
  ['PATCH', '/api/v1/{table}/{keys...}', 'Change columns of a row', '200'],
  ['DELETE', '/api/v1/{table}/{keys...}', 'Delete a row', '204'],
], { mono: [0, 1] });

H2('2.1 Health');
para('GET /api/v1/health checks that the application can reach the database. It needs no token, so it can be used by monitoring and by the Docker health check.');
code('curl ' + BASE + '/api/v1/health', 'Request');
code('{ "keyspace": "mlw", "status": "ok" }', 'Response 200');
para('If the database cannot be reached the response is 503 with {"status": "unavailable", "error": "..."}.');

H2('2.2 OpenAPI specification');
para('GET /api/v1/openapi.yaml returns the OpenAPI 3.0 specification of this API as YAML. It describes the same endpoints as this document. The server in the served copy is /api/v1, the server it comes from, so tools such as Swagger UI and Postman send their requests to the application itself. It needs no token. The file doc/openapi.yaml in the repository is the same document with a configurable server URL.');
para('The web user interface has an API documentation page that shows it with Swagger UI. “Try it out” on that page sends requests to the application and uses the API token entered in the web user interface.');

H2('2.3 List tables');
para('GET /api/v1/tables returns every table with its columns and key. Clients such as the web user interface use it to build forms.');
code('curl ' + BASE + '/api/v1/tables', 'Request');
code(`{
  "keyspace": "mlw",
  "tables": [
    {
      "name": "shot",
      "columns": [
        { "name": "project_id",  "type": "text",  "kind": "partition_key" },
        { "name": "episode_id",  "type": "text",  "kind": "partition_key" },
        { "name": "sequence_id", "type": "text",  "kind": "partition_key" },
        { "name": "scene_id",    "type": "text",  "kind": "partition_key" },
        { "name": "shot_id",     "type": "text",  "kind": "partition_key" },
        { "name": "end_frame",   "type": "int",   "kind": "regular" },
        { "name": "frame_rate",  "type": "float", "kind": "regular" }
      ],
      "partitionKey": ["project_id", "episode_id", "sequence_id", "scene_id", "shot_id"],
      "clusteringKey": [],
      "staticColumns": [],
      "readOnly": false,
      "path": "/api/v1/shot/{project_id}/{episode_id}/{sequence_id}/{scene_id}/{shot_id}"
    }
  ]
}`, 'Response 200 (shortened)');
grid([1900, 7460], ['Field', 'Description'], [
  ['name', 'Table name, used in the path.'],
  ['columns', 'The columns. kind is partition_key, clustering, static or regular.'],
  ['partitionKey', 'Columns of the partition key, in order.'],
  ['clusteringKey', 'Columns of the clustering key, in order.'],
  ['staticColumns', 'Columns shared by all rows of a partition.'],
  ['readOnly', 'true for lookup tables that the API maintains itself.'],
  ['derivedFrom', 'For lookup tables, the table the rows are copied from.'],
  ['path', 'Path template of a single row.'],
], { mono: [0] });

H2('2.4 Describe a table');
para('GET /api/v1/tables/{table} returns the entry of one table, in the same form as above. An unknown table gives 404.');

H2('2.5 List rows');
para('GET /api/v1/{table}/{keys...} returns the rows whose key starts with the given values.');
grid([2600, 6760], ['Key values in the path', 'Result'], [
  ['None', 'A scan of the whole table, one page at a time, in the order Cassandra stores it (not sorted). Avoid scans of large tables.'],
  ['Fewer than the partition key', '400 bad_request. Cassandra needs the whole partition key.'],
  ['The whole partition key', 'All rows of the partition, in clustering key order.'],
  ['The partition key and some clustering key values', 'The rows of the partition whose clustering key starts with those values.'],
  ['The whole key', 'One row, as an object (section 2.6).'],
], {});
grid([1700, 1100, 6560], ['Query parameter', 'Default', 'Description'], [
  ['limit', '100', 'Page size, 1 to 1000.'],
  ['pageState', 'none', 'The nextPageState of the previous page.'],
], { mono: [0, 1] });
code(`curl '${BASE}/api/v1/production/demo?limit=2'`, 'Request');
code(`{
  "count": 2,
  "items": [
    {
      "project_id": "demo",
      "episode_id": "EP01",
      "title": "Opening",
      "description": null
    },
    {
      "project_id": "demo",
      "episode_id": "EP02",
      "title": "Chase",
      "description": null
    }
  ],
  "nextPageState": "AAcABVNRMDIw8H____7wf____g"
}`, 'Response 200');
code(`curl '${BASE}/api/v1/production/demo?limit=2&pageState=AAcABVNRMDIw8H____7wf____g'`, 'Next page');

H2('2.6 Get a row');
para('GET /api/v1/{table}/{keys...} with all the key values returns the row as an object. If there is no such row the response is 404.');
code(`curl ${BASE}/api/v1/project/demo`, 'Request');
code(`{
  "project_id": "demo",
  "name": "Demo",
  "status": "active",
  "owner_id": null,
  "created_at": "2026-10-05T12:00:00Z",
  "description": null
}`, 'Response 200');

H2('2.7 Create a row');
para('POST /api/v1/{table} creates a row from a JSON object. The body must contain every key column. Other columns are optional, and a column left out is null. A body that contains a column that does not exist is rejected.');
para('If a row with the same key already exists the response is 409 and nothing is changed. The response has the status 201, a Location header with the path of the new row, and the stored row as the body.');
code(`curl -X POST ${BASE}/api/v1/layer \\
  -H 'Content-Type: application/json' \\
  -d '{"project_id":"demo","episode_id":"EP01","sequence_id":"SQ010",
       "scene_id":"SC010","shot_id":"SH010","layer_id":"L1","name":"Background",
       "z_order":1,"visibility":true}'`, 'Request');
code(`HTTP/1.1 201 Created
Location: /api/v1/layer/demo/EP01/SQ010/SC010/SH010/L1

{
  "project_id": "demo",
  "episode_id": "EP01",
  "sequence_id": "SQ010",
  "scene_id": "SC010",
  "shot_id": "SH010",
  "layer_id": "L1",
  "name": "Background",
  "type": null,
  "z_order": 1,
  "visibility": true,
  "asset_ref": null,
  "description": null
}`, 'Response');
H3('Static columns');
para('Some tables have static columns, which are stored once for a whole partition and shared by its rows (timeline: name and description; audio_tracks: description; episode: episode_url; sequence: sequence_url; scene: scene_url). To set them, send a body that has the partition key and only static columns. This sets the values for the partition and does not create a row; sending it again overwrites them. The response has the status 201.');
code(`curl -X POST ${BASE}/api/v1/timeline \\
  -d '{"project_id":"demo","timeline_id":"T1","name":"First cut","description":"Rough cut"}'`);

H2('2.8 Replace a row');
para('PUT /api/v1/{table}/{keys...} replaces the row with the given key. The columns in the body are set, and the other columns of the row, except the key and static columns, are set to null. If the row does not exist the response is 404: PUT does not create rows.');
para('The key columns may be left out of the body. If they are given they must match the path, otherwise the response is 400.');
code(`curl -X PUT ${BASE}/api/v1/project/demo -d '{"name":"Demo 2"}'`, 'Request');
code(`{
  "project_id": "demo",
  "name": "Demo 2",
  "status": null,
  "owner_id": null,
  "created_at": null,
  "description": null
}`, 'Response 200');

H2('2.9 Change columns of a row');
para('PATCH /api/v1/{table}/{keys...} changes only the columns in the body and leaves the others as they are. Send null to clear a column. Lists (for example comment_refs) are replaced as a whole. An empty body gives 400, and a missing row gives 404.');
code(`curl -X PATCH ${BASE}/api/v1/project/demo -d '{"status":"archived"}'`, 'Request');
code(`{
  "project_id": "demo",
  "name": "Demo",
  "status": "archived",
  "owner_id": null,
  "created_at": "2026-10-05T12:00:00Z",
  "description": null
}`, 'Response 200');
H3('Static columns');
para('A PUT or PATCH whose path has only the partition key (for example /api/v1/timeline/demo/T1) can change static columns of that partition. Any other column in the body gives 400.');
code(`curl -X PATCH ${BASE}/api/v1/timeline/demo/T1 -d '{"description":"Final cut"}'`);

H2('2.10 Delete a row');
para('DELETE /api/v1/{table}/{keys...} with all the key values deletes the row. The response is 204 with no body, or 404 if the row does not exist. Deleting a whole partition, or rows with a key prefix, is not supported. Rows that refer to the deleted row are not changed.');
code(`curl -X DELETE ${BASE}/api/v1/project/demo`, 'Request');
code('HTTP/1.1 204 No Content', 'Response');

// ---------- 3 Types ----------
H1('3. Data Types');
para('The API converts between JSON and the Cassandra column types as follows. A value of the wrong type gives 400.');
grid([2200, 2700, 4460], ['Cassandra type', 'JSON', 'Notes'], [
  ['text, varchar, ascii', 'string', 'Key values must not be empty.'],
  ['int, smallint, tinyint, bigint', 'number', 'Whole numbers within the range of the type. 1.5 is rejected.'],
  ['float, double', 'number', 'float has about 7 significant digits.'],
  ['boolean', 'true or false', ''],
  ['timestamp', 'string', 'RFC 3339, returned in UTC with a Z suffix.'],
  ['uuid', 'string', 'The usual 36 character form.'],
  ['list<text>, set<text>, list<int>, set<int>', 'array', 'Written and returned as a whole. A list that has no items is returned as [].'],
], { mono: [0] });
para('Columns of other types are left out of the API and logged when the application starts.');

// ---------- 4 Resources ----------
add(new Paragraph({ children: [new PageBreak()] }));
H1('4. Resource Reference');
para('One section per table. Each shows the path of a single row, the paths that list rows, the key, and an example body for creating a row. The paths use the key columns in order. The example values are only illustrations.');
for (const name of Object.keys(tables).sort()) {
  const t = tables[name];
  const key = keyOf(t);
  const ro = LOOKUP[name];
  H3(name);
  const rows = [
    ['Row', tmpl(t, key.length)],
    ['Partition key', t.partition.join(', ')],
    ['Clustering key', t.clustering.length ? t.clustering.join(', ') + (t.descOrder ? ` (${t.descOrder} descending)` : '') : 'none'],
  ];
  const lists = [];
  for (let n = t.partition.length; n < key.length; n++) lists.push(tmpl(t, n));
  if (key.length > 0) lists.unshift(tmpl(t, t.partition.length));
  const uniq = [...new Set(lists)];
  if (uniq.length) uniq.forEach((u, i) => rows.push([i === 0 ? 'List rows' : '', u]));
  else rows.push(['List rows', 'none (a single row per key)']);
  rows.push(['Scan', '/api/v1/' + name]);
  const st = t.cols.filter(c => c.isStatic).map(c => c.name);
  if (st.length) rows.push(['Static columns', st.join(', ')]);
  const coll = t.cols.filter(c => /^(list|set)</.test(c.type)).map(c => `${c.name} (${c.type})`);
  if (coll.length) rows.push(['Collections', coll.join(', ')]);
  rows.push(['Writes', ro ? `Read-only. Maintained from ${ro} (section 1.8).` : 'POST, PUT, PATCH, DELETE']);
  grid([1700, 7660], null, rows, { mono: [1], keep: true });
  if (!ro) {
    lead('Example body for POST:');
    code(JSON.stringify(exampleBody(t), null, 2));
  } else {
    lead('Example row returned by GET ' + pathFor(t, key.length) + ':');
    code(JSON.stringify(exampleBody(t), null, 2));
  }
}

// ---------- 5 Configuration ----------
add(new Paragraph({ children: [new PageBreak()] }));
H1('5. Configuration');
para('The application is configured with environment variables. The Docker Compose files pass them through from the .env file, so a setting is usually changed there.');
grid([3300, 1800, 4260], ['Variable', 'Default', 'Description'], [
  ['ADDR', ':8080', 'Listen address inside the container.'],
  ['API_TOKEN', '(none)', 'Bearer token the API requires. Required by the production Compose file.'],
  ['OIDC_ISSUER', '(none)', 'Public URL of the Keycloak realm. Turns on the login page and accepts access tokens of that realm.'],
  ['OIDC_CLIENT_ID', 'mlw-app', 'The public Keycloak client the web user interface logs in with.'],
  ['OIDC_JWKS_URL', '<issuer>/protocol/openid-connect/certs', 'Where the signing keys are fetched, when Keycloak is reached at another address than browsers use.'],
  ['OIDC_REQUIRED_ROLE', '(none)', 'Realm role a user must have. Empty allows every user of the realm.'],
  ['CASSANDRA_HOSTS', 'localhost (cassandra in Compose)', 'Comma separated contact points. Set it to use a remote Cassandra.'],
  ['CASSANDRA_PORT', '9042', 'CQL port.'],
  ['CASSANDRA_KEYSPACE', 'mlw', 'Keyspace the tables are in.'],
  ['CASSANDRA_USERNAME, CASSANDRA_PASSWORD', '(none)', 'Credentials. Both or neither.'],
  ['CASSANDRA_LOCAL_DC', '(none)', 'Preferred datacenter. Set it for multi-datacenter clusters.'],
  ['CASSANDRA_CONSISTENCY', 'LOCAL_QUORUM', 'Consistency level of reads and writes.'],
  ['TLS_CERT_FILE, TLS_KEY_FILE', '(none)', 'PEM certificate (with any intermediate certificates) and private key. When set, the application serves HTTPS instead of HTTP. A renewed certificate is picked up within seconds without a restart.'],
  ['TLS_MIN_VERSION', '1.2', 'Lowest TLS version accepted for HTTPS: 1.2 or 1.3.'],
  ['CASSANDRA_TLS', 'false', 'Connect to Cassandra with TLS and verify its certificate.'],
  ['CASSANDRA_TLS_CA_FILE', '(none)', 'Path of the CA certificate file that signed the Cassandra certificate, inside the container. Without it the system CAs are used.'],
  ['CASSANDRA_TLS_SERVER_NAME', '(none)', 'Name to check the Cassandra certificate against. Needed when the cluster advertises addresses that are not in its certificate.'],
  ['CASSANDRA_TLS_CERT_FILE, CASSANDRA_TLS_KEY_FILE', '(none)', 'Client certificate and key, for a cluster that requires mutual TLS.'],
  ['CASSANDRA_TLS_SKIP_VERIFY', 'false', 'Do not verify the Cassandra certificate (testing only; logged as a warning).'],
  ['CASSANDRA_DISABLE_INITIAL_HOST_LOOKUP, CASSANDRA_IGNORE_PEER_ADDR', 'false', 'Use only the configured hosts. Needed when the cluster advertises addresses that cannot be reached, for example behind an SSH tunnel or NAT.'],
  ['APPLY_SCHEMA', 'false (true in local development)', 'Run the embedded cql files at startup. They only use IF NOT EXISTS, so this is safe to repeat. Check the keyspace replication in cql/001_production.cql before using it on a real cluster.'],
  ['CASSANDRA_STARTUP_WAIT', '2m', 'How long to keep retrying the first connection, so the application can start before Cassandra.'],
], { mono: [0] });

// ---------- 6 Example session ----------
H1('6. Example Session');
para('The commands below create a small production and read it back. Add the Authorization header if a token is configured.');
code(`B=${BASE}/api/v1

# a project, with one episode, one sequence and one scene
curl -X POST $B/project    -d '{"project_id":"demo","name":"Demo","status":"active"}'
curl -X POST $B/production -d '{"project_id":"demo","episode_id":"EP01","title":"Opening"}'
curl -X POST $B/episode    -d '{"project_id":"demo","episode_id":"EP01","sequence_id":"SQ010"}'
curl -X POST $B/sequence   -d '{"project_id":"demo","sequence_id":"SQ010","scene_id":"SC010"}'

# a shot with its frame rate, and two layers on it
curl -X POST $B/shot  -d '{"project_id":"demo","episode_id":"EP01","sequence_id":"SQ010","scene_id":"SC010",
                           "shot_id":"SH010","frame_rate":24,"start_frame":1,"end_frame":48}'
curl -X POST $B/layer -d '{"project_id":"demo","episode_id":"EP01","sequence_id":"SQ010","scene_id":"SC010",
                           "shot_id":"SH010","layer_id":"BG","name":"Background","z_order":0}'
curl -X POST $B/layer -d '{"project_id":"demo","episode_id":"EP01","sequence_id":"SQ010","scene_id":"SC010",
                           "shot_id":"SH010","layer_id":"FG","name":"Foreground","z_order":1}'

# read them back
curl $B/layer/demo/EP01/SQ010/SC010/SH010
curl $B/shot/demo/EP01/SQ010/SC010/SH010

# change and delete
curl -X PATCH  $B/shot/demo/EP01/SQ010/SC010/SH010 -d '{"frame_rate":25}'
curl -X DELETE $B/layer/demo/EP01/SQ010/SC010/SH010/FG`);

const doc = buildDocument('MLW REST API', 'MLW REST API', children);
write(doc, OUT);
