// Builds the OpenAPI 3.0 specification of the REST API.
// Usage: node gen_openapi.js <output.yaml>
// Table schemas, paths and descriptions are generated from cql/*.cql, so the
// specification follows the schema. The fixed parts are written out below.
const fs = require('fs');
const YAML = require('yaml');
const { parseCql, sample, typeOf, keyOf, colsOrdered, exampleBody } = require('./lib');
const { describe, PURPOSE } = require('./descriptions');

const OUT = process.argv[2];
if (!OUT) { console.error('usage: node gen_openapi.js <output.yaml>'); process.exit(1); }

const tables = parseCql();
const LOOKUP = { user_by_email: 'user', project_by_user: 'project_member', review_by_frame: 'review' };
const GROUPS = [
  ['Production Hierarchy', 'Sequences, scenes, shots, frames and layers.', ['production', 'sequence', 'scene', 'shot', 'frame', 'layer', 'exposure_sheet']],
  ['Assets, Audio and Notes', 'Assets, audio tracks, dialog and notes.', ['asset', 'track', 'audio_tracks', 'audio_ref', 'dialog', 'note']],
  ['Camera and Timeline', 'Cameras, camera moves, keyframes and timelines.', ['camera', 'camera_move', 'keyframe', 'timeline']],
  ['Users and Projects', 'Users, projects and project membership.', ['user', 'user_by_email', 'project', 'project_member', 'project_by_user']],
  ['Review', 'Reviews of frames and their comments.', ['review', 'comment', 'review_by_frame']],
  ['Version Control', 'Version control and revisions.', ['version_control', 'revision']],
];
const groupOf = {};
for (const [g, , list] of GROUPS) for (const n of list) groupOf[n] = g;
for (const n of Object.keys(tables)) if (!groupOf[n]) throw new Error(`table ${n} is not in a group`);

const pascal = s => s.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('');
const ref = (kind, name) => ({ $ref: `#/components/${kind}/${name}` });

// ---------- schemas ----------
function typeSchema(typ) {
  switch (typ) {
    case 'text': case 'varchar': case 'ascii': return { type: 'string' };
    case 'int': return { type: 'integer', format: 'int32' };
    case 'smallint': case 'tinyint': return { type: 'integer' };
    case 'bigint': return { type: 'integer', format: 'int64' };
    case 'float': return { type: 'number', format: 'float' };
    case 'double': return { type: 'number', format: 'double' };
    case 'boolean': return { type: 'boolean' };
    case 'timestamp': return { type: 'string', format: 'date-time' };
    case 'uuid': return { type: 'string', format: 'uuid' };
  }
  const m = typ.match(/^(?:list|set)<(.+)>$/);
  if (m) return { type: 'array', items: typeSchema(m[1]) };
  throw new Error('unsupported type ' + typ);
}

function columnSchema(t, c, { nullable }) {
  const s = { ...typeSchema(c.type), description: describe(t.name, c.name) };
  if (nullable) s.nullable = true;
  if (c.isStatic) s.description += ' (static column: shared by all rows of the partition)';
  return s;
}

function tableSchemas(t) {
  const N = pascal(t.name);
  const keys = keyOf(t);
  const cols = colsOrdered(t);
  const row = {}, input = {}, patch = {};
  for (const c of cols) {
    const isKey = keys.includes(c.name);
    row[c.name] = columnSchema(t, c, { nullable: !isKey });
    input[c.name] = columnSchema(t, c, { nullable: true });
    patch[c.name] = columnSchema(t, c, { nullable: true });
  }
  const ex = exampleBody(t);
  const schemas = {
    [N]: {
      type: 'object', description: PURPOSE[t.name], required: keys, properties: row,
      example: ex,
    },
    [`${N}List`]: {
      type: 'object', required: ['items', 'count', 'nextPageState'],
      properties: {
        items: { type: 'array', items: ref('schemas', N) },
        count: { type: 'integer', description: 'Number of rows in this page.' },
        nextPageState: { type: 'string', nullable: true, description: 'Send as the pageState query parameter to get the next page. null when there are no more rows.' },
      },
    },
  };
  if (!LOOKUP[t.name]) {
    const staticNote = t.cols.some(c => c.isStatic)
      ? ' A body with the partition key and only static columns sets the static columns of the partition instead of creating a row.' : '';
    schemas[`${N}Input`] = {
      type: 'object', additionalProperties: false, required: t.partition,
      description: `Body for creating a ${t.name} row. Every key column is required` +
        (t.clustering.length ? ' (the clustering key columns may be left out only when setting static columns)' : '') +
        '; a column left out is null.' + staticNote,
      properties: input, example: ex,
    };
    schemas[`${N}Patch`] = {
      type: 'object', additionalProperties: false,
      description: `Body for updating a ${t.name} row. Only the columns given are changed (PATCH); with PUT the other non-key columns are set to null. Key columns may be given, and must match the URL.`,
      properties: patch,
      example: Object.fromEntries(cols.filter(c => !keys.includes(c.name)).slice(0, 2).map(c => [c.name, ex[c.name]])),
    };
  }
  return schemas;
}

// ---------- paths ----------
function pathParam(t, col) {
  const c = t.cols.find(x => x.name === col);
  return {
    name: col, in: 'path', required: true,
    description: describe(t.name, col) + (c.type === 'int' ? ' Sent as the number in text form.' : ''),
    schema: typeSchema(c.type), example: sample(col, c.type),
  };
}
const queryParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }, description: 'Page size.' },
  { name: 'pageState', in: 'query', schema: { type: 'string' }, description: 'The nextPageState of the previous page. Use it with the same path and limit.' },
];
const errs = codes => Object.fromEntries(codes.map(c => [String(c), ref('responses', { 400: 'BadRequest', 401: 'Unauthorized', 404: 'NotFound', 405: 'ReadOnly', 409: 'Conflict', 503: 'Unavailable' }[c])]));
const json = schema => ({ 'application/json': { schema } });

function tablePaths(t) {
  const N = pascal(t.name);
  const keys = keyOf(t);
  const tag = groupOf[t.name];
  const ro = LOOKUP[t.name];
  const paths = {};
  const tpl = n => '/' + t.name + keys.slice(0, n).map(k => `/{${k}}`).join('');
  const params = n => keys.slice(0, n).map(k => pathParam(t, k));
  const roNote = ro ? ` This table is maintained automatically from \`${ro}\` and is read-only.` : '';

  // scan and create
  paths[tpl(0)] = {
    get: {
      tags: [tag], operationId: `scan${N}`, summary: `Scan ${t.name}`,
      description: `Returns the rows of the whole table one page at a time, in the order Cassandra stores them (not sorted). Avoid scanning large tables; list by key instead.${roNote}`,
      parameters: queryParams,
      responses: { 200: { description: 'One page of rows.', content: json(ref('schemas', `${N}List`)) }, ...errs([400, 401, 503]) },
    },
  };
  if (!ro) {
    paths[tpl(0)].post = {
      tags: [tag], operationId: `create${N}`, summary: `Create a ${t.name} row`,
      description: `Creates a row. Fails with 409 if a row with the same key exists.${t.cols.some(c => c.isStatic) ? ' Send the partition key and only static columns to set the static columns of a partition (an upsert; no row is created).' : ''}`,
      requestBody: { required: true, content: json(ref('schemas', `${N}Input`)) },
      responses: {
        201: {
          description: 'The row was created.',
          headers: { Location: { description: 'Path of the new row.', schema: { type: 'string' } } },
          content: json(ref('schemas', N)),
        },
        ...errs([400, 401, 409, 503]),
      },
    };
  }

  // list by key prefix, and the single row
  for (let n = t.partition.length; n <= keys.length; n++) {
    const full = n === keys.length;
    const path = tpl(n);
    const entry = paths[path] || (paths[path] = {});
    entry.parameters = params(n);
    if (full) {
      entry.get = {
        tags: [tag], operationId: `get${N}`, summary: `Get a ${t.name} row`,
        description: `Returns the row with this key.${roNote}`,
        responses: { 200: { description: 'The row.', content: json(ref('schemas', N)) }, ...errs([400, 401, 404, 503]) },
      };
      if (!ro) {
        const body = { required: true, content: json(ref('schemas', `${N}Patch`)) };
        entry.put = {
          tags: [tag], operationId: `replace${N}`, summary: `Replace a ${t.name} row`,
          description: 'Sets the columns in the body and sets the other non-key, non-static columns to null. Returns 404 if the row does not exist (PUT does not create rows).',
          requestBody: body, responses: { 200: { description: 'The updated row.', content: json(ref('schemas', N)) }, ...errs([400, 401, 404, 503]) },
        };
        entry.patch = {
          tags: [tag], operationId: `update${N}`, summary: `Change columns of a ${t.name} row`,
          description: 'Changes only the columns in the body. Send null to clear a column. Returns 404 if the row does not exist.',
          requestBody: body, responses: { 200: { description: 'The updated row.', content: json(ref('schemas', N)) }, ...errs([400, 401, 404, 503]) },
        };
        entry.delete = {
          tags: [tag], operationId: `delete${N}`, summary: `Delete a ${t.name} row`,
          description: 'Deletes the row. Rows that refer to it are not changed.',
          responses: { 204: { description: 'The row was deleted.' }, ...errs([400, 401, 404, 503]) },
        };
      }
    } else {
      const by = n === t.partition.length ? '' : 'By' + keys.slice(t.partition.length, n).map(pascal).join('And');
      entry.get = {
        tags: [tag], operationId: `list${N}${by}`, summary: `List ${t.name} rows`,
        description: n === t.partition.length
          ? `Returns all rows of the partition, in clustering key order.${roNote}`
          : `Returns the rows of the partition whose clustering key starts with ${keys.slice(t.partition.length, n).join(', ')}.${roNote}`,
        parameters: queryParams,
        responses: { 200: { description: 'One page of rows.', content: json(ref('schemas', `${N}List`)) }, ...errs([400, 401, 503]) },
      };
      // static columns are updated through the partition key path
      if (!ro && n === t.partition.length && t.cols.some(c => c.isStatic) && t.clustering.length) {
        const staticOnly = { type: 'object', additionalProperties: false, properties: Object.fromEntries(t.cols.filter(c => c.isStatic).map(c => [c.name, columnSchema(t, c, { nullable: true })])) };
        for (const [verb, op] of [['patch', 'Update'], ['put', 'Replace']]) {
          entry[verb] = {
            tags: [tag], operationId: `${verb === 'patch' ? 'update' : 'replace'}${N}Static`,
            summary: `${op} the static columns of a ${t.name} partition`,
            description: `Changes the static columns (${t.cols.filter(c => c.isStatic).map(c => c.name).join(', ')}) shared by all rows of the partition. Any other column gives 400.`,
            requestBody: { required: true, content: json(staticOnly) },
            responses: { 200: { description: 'The partition key and the static columns written.', content: json({ type: 'object', additionalProperties: true }) }, ...errs([400, 401, 503]) },
          };
        }
      }
    }
  }
  return paths;
}

// ---------- document ----------
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'MLW REST API',
    version: '1.0.0',
    description: [
      'REST API of the Magic Lantern Workbench application. It creates, reads, updates and deletes the rows of the tables in the Cassandra keyspace `mlw`. There is one resource per table; the schema is described in MLW_Cassandra_Schema.docx.',
      '',
      '**Row paths.** A row is addressed by the values of its primary key, in key order, after the table name: `/{table}/{partition key values}/{clustering key values}`. Values are URL-encoded path segments. List requests need all the partition key columns and may add clustering key values.',
      '',
      '**Null.** A column without a value is null. When creating a row, columns can be left out.',
      '',
      '**Timestamps** are RFC 3339 strings in UTC.',
      '',
      '**Paging.** List responses hold one page. When `nextPageState` is not null, send it as `pageState` to get the next page.',
      '',
      '**Lookup tables** (`user_by_email`, `project_by_user`, `review_by_frame`) repeat data from another table under a different key. The API keeps them in step with their source tables, and they are read-only (405).',
      '',
      '**Authentication.** If the server has an API token configured, send it as `Authorization: Bearer <token>`. Without a configured token the API is open. The token is sent in every request, so use HTTPS whenever the API is reachable over a network.',
    ].join('\n'),
    license: { name: 'See the LICENSE file in the repository' },
  },
  servers: [{
    url: '{scheme}://{host}:{port}/api/v1',
    description: 'The application. Local development uses http on port 8090; with docker-compose.tls.yml (or any TLS setup) use https.',
    variables: {
      scheme: { enum: ['http', 'https'], default: 'http', description: 'https when the application serves TLS or sits behind an HTTPS proxy.' },
      host: { default: 'localhost' },
      port: { default: '8090' },
    },
  }],
  security: [{ bearerAuth: [] }, {}],
  tags: [
    { name: 'Service', description: 'Health, table metadata and this specification.' },
    ...GROUPS.map(([name, description]) => ({ name, description })),
  ],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Required only when the server is started with API_TOKEN.' },
    },
    responses: {},
    schemas: {},
  },
};

const errorBody = (code, message) => ({ 'application/json': { schema: ref('schemas', 'Error'), example: { error: { code, message } } } });
spec.components.responses = {
  BadRequest: { description: 'The request cannot be used: invalid JSON, an unknown column, a value of the wrong type, a missing key column, the wrong number of key values, or an invalid limit or pageState.', content: errorBody('bad_request', 'frame_rate: expected a number') },
  Unauthorized: { description: 'The bearer token is missing or wrong.', headers: { 'WWW-Authenticate': { schema: { type: 'string' } } }, content: errorBody('unauthorized', 'missing or invalid bearer token') },
  NotFound: { description: 'No such table, or no row has the key.', content: errorBody('not_found', 'no row with this key') },
  ReadOnly: { description: 'The table is a lookup table maintained by the API and cannot be written directly.', headers: { Allow: { schema: { type: 'string' } } }, content: errorBody('read_only', 'this table is maintained automatically and cannot be written directly') },
  Conflict: { description: 'A row with the key already exists, or the email is already used by another user.', content: errorBody('conflict', 'a row with this key already exists') },
  Unavailable: { description: 'The database cannot be reached or timed out.', content: errorBody('unavailable', 'the database is not available') },
};

spec.components.schemas.Error = {
  type: 'object', required: ['error'],
  properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string', description: 'Machine-readable error code.' }, message: { type: 'string' } } } },
};
spec.components.schemas.Column = {
  type: 'object', required: ['name', 'type', 'kind'],
  properties: {
    name: { type: 'string' },
    type: { type: 'string', description: 'Cassandra type, for example text, int or list<text>.' },
    kind: { type: 'string', enum: ['partition_key', 'clustering', 'static', 'regular'] },
  },
};
spec.components.schemas.TableInfo = {
  type: 'object', required: ['name', 'columns', 'partitionKey', 'clusteringKey', 'staticColumns', 'readOnly', 'path'],
  properties: {
    name: { type: 'string', description: 'Table name, used in the path.' },
    columns: { type: 'array', items: ref('schemas', 'Column') },
    partitionKey: { type: 'array', items: { type: 'string' } },
    clusteringKey: { type: 'array', items: { type: 'string' } },
    staticColumns: { type: 'array', items: { type: 'string' } },
    readOnly: { type: 'boolean', description: 'true for lookup tables that the API maintains itself.' },
    derivedFrom: { type: 'string', description: 'For lookup tables, the table the rows are copied from.' },
    path: { type: 'string', description: 'Path template of a single row.', example: '/api/v1/shot/{project_id}/{sequence_id}/{scene_id}/{shot_id}' },
  },
};

Object.assign(spec.paths, {
  '/health': {
    get: {
      tags: ['Service'], operationId: 'getHealth', summary: 'Check the service and database', security: [],
      description: 'Checks that the application can reach the database. Needs no token.',
      responses: {
        200: { description: 'The service is healthy.', content: json({ type: 'object', required: ['status'], properties: { status: { type: 'string', example: 'ok' }, keyspace: { type: 'string', example: 'mlw' } } }) },
        503: { description: 'The database cannot be reached.', content: json({ type: 'object', properties: { status: { type: 'string', example: 'unavailable' }, error: { type: 'string' } } }) },
      },
    },
  },
  '/openapi.yaml': {
    get: {
      tags: ['Service'], operationId: 'getOpenApiSpec', summary: 'Get this OpenAPI specification', security: [],
      description: 'Returns this document, with the server set to the application that serves it. The web user interface shows it as interactive documentation (Swagger UI). Needs no token.',
      responses: { 200: { description: 'The OpenAPI document.', content: { 'application/yaml': { schema: { type: 'string' } } } } },
    },
  },
  '/tables': {
    get: {
      tags: ['Service'], operationId: 'listTables', summary: 'List the tables',
      description: 'Returns every table with its columns and key.',
      responses: {
        200: { description: 'The tables.', content: json({ type: 'object', required: ['keyspace', 'tables'], properties: { keyspace: { type: 'string' }, tables: { type: 'array', items: ref('schemas', 'TableInfo') } } }) },
        ...errs([401]),
      },
    },
  },
  '/tables/{table}': {
    get: {
      tags: ['Service'], operationId: 'getTable', summary: 'Describe one table',
      parameters: [{ name: 'table', in: 'path', required: true, schema: { type: 'string', enum: Object.keys(tables).sort() } }],
      responses: { 200: { description: 'The table.', content: json(ref('schemas', 'TableInfo')) }, ...errs([401, 404]) },
    },
  },
});

for (const name of Object.keys(tables).sort((a, b) => GROUPS.findIndex(g => g[2].includes(a)) - GROUPS.findIndex(g => g[2].includes(b)) || GROUPS.flatMap(g => g[2]).indexOf(a) - GROUPS.flatMap(g => g[2]).indexOf(b))) {
  Object.assign(spec.paths, tablePaths(tables[name]));
  Object.assign(spec.components.schemas, tableSchemas(tables[name]));
}

// operation ids must be unique
const ids = new Set();
for (const [p, item] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(item)) {
    if (m === 'parameters') continue;
    if (ids.has(op.operationId)) throw new Error(`duplicate operationId ${op.operationId} at ${m} ${p}`);
    ids.add(op.operationId);
  }
}

const header = '# OpenAPI 3.0 specification of the MLW REST API.\n# Generated by doc/generator/gen_openapi.js from cql/*.cql; do not edit by hand.\n';
fs.writeFileSync(OUT, header + YAML.stringify(spec, { lineWidth: 0, aliasDuplicateObjects: false }));
console.log('wrote', OUT, `(${Object.keys(spec.paths).length} paths, ${ids.size} operations)`);
