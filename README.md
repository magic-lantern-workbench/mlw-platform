# Magic Lantern Workbench Platform

The Magic Lantern Workbench Platform is the core foundation for the workbench.
It is comprised of

* KeyCloak - Open source tool used for user role management.
* Cassandra - Open source database used for production management and
integration with other toolchains including 3rd-party tools.
* File Object Store - TBD

## Cassandra Database

The platform uses Apache Cassandra, run locally with Docker Compose (`docker-compose.yml`).

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (`docker compose`)

### Start

```bash
docker compose up -d              # Cassandra and the application (see "Application" below)
docker compose up -d cassandra    # Cassandra only
```

Cassandra takes about 30-60 seconds to become ready on first start. Check status with:

```bash
docker compose ps          # STATUS should show "healthy"
docker compose logs -f cassandra
```

### Connect

**With cqlsh inside the container:**

```bash
docker compose exec cassandra cqlsh
```

**From the host** (application drivers or a local `cqlsh`):

| Setting        | Value         |
| -------------- | ------------- |
| Host           | `localhost`   |
| Port           | `9042`        |
| Datacenter     | `dc1`         |
| Cluster name   | `mlw-cluster` |
| Authentication | none          |

```bash
cqlsh localhost 9042
```

### Quick test

```sql
CREATE KEYSPACE IF NOT EXISTS mlw
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE mlw;
DESCRIBE KEYSPACES;
```

### Stop

```bash
docker compose stop        # stop, keep data
docker compose down        # remove container, keep data
docker compose down -v     # remove container AND delete all data
```

Data is stored in the named Docker volume `cassandra_data` and survives restarts.

## Schema

CQL schema files live in `cql/` and are numbered in the order they should be applied
(e.g. `001_production.cql`). They are idempotent (`IF NOT EXISTS`), so re-running is safe.

Apply a single file, or all of them, to the running container:

```bash
docker compose exec -T cassandra cqlsh < cql/001_production.cql

for f in cql/*.cql; do docker compose exec -T cassandra cqlsh < "$f"; done
```

On a remote server using authentication, add `-u <user> -p <password>` to `cqlsh`. In local development the
`app` service applies these files itself when it starts (see "Application" below), so this is only needed for
Cassandra on its own.

| File | Contents |
| ---- | -------- |
| `001_production.cql` | `mlw` keyspace and `production` table (one row per episode, partitioned by `project_id`) |
| `002_exposure_sheet.cql` | `exposure_sheet` table holding the URLs of an XML file and an SVG file per shot |
| `003_hierarchy.cql` | `episode` (rows are sequences, with static `episode_url`), `sequence` (rows are scenes, with static `sequence_url`), `scene` (rows are shots, with static `scene_url`), `shot` (one row per shot, with `shot_url`, `frame_rate`, `start_frame`, `end_frame`) and `frame` (one row per layer of each frame, with `frame_url`) tables |
| `004_layer.cql` | `layer` table (one row per layer, partitioned by shot, with `name`, `type`, `z_order`, `asset_ref`, `visibility`) |
| `005_asset.cql` | `asset` table (`name`, `category`, `version`, `source_url`, `description`) |
| `006_user.cql` | `user` table (`username`, `email`, `display_name`, `role`, `created_at`, `description`) and `user_by_email` lookup table |
| `007_audio_dialog_note.cql` | `audio_ref` (`track`, `start_frame`, `end_frame`), `dialog` (`phoneme`) and `note` (`note_text`) tables, partitioned by shot and referenced from `frame` |
| `008_timeline.cql` | `timeline` table (one row per entry, ordered by `position`, each pointing at a frame) |
| `009_project.cql` | `project` table (`name`, `status`, `owner_id`, `created_at`, `description`) and `project_member` table (one row per member, with `role` and `added_at`) and `project_by_user` lookup table |
| `010_review.cql` | `review` table (one row per review of a frame, with `reviewer`, `status` and `comment_refs`), `comment` table (`comment_text`) and `review_by_frame` lookup table |
| `011_audio_track.cql` | `track` table (`name`, `type`, `file_name`, `url`, `description`) and `audio_tracks` table (an ordered group of tracks), both shared across projects |
| `012_camera.cql` | `camera_move`, `keyframe` and `camera` tables, partitioned by shot; `camera` has `name`, `projection` and lists of move and keyframe references |
| `013_version_control.cql` | `version_control` table and `revision` table (one row per revision, newest first, with `author`, `created_at` in UTC and `description`) |

Every table has a `description` text column.

### Schema documentation

[`doc/MLW_Cassandra_Schema.docx`](doc/MLW_Cassandra_Schema.docx) describes the whole schema: a
table of contents, association diagrams, and a table for every database table with a description of
each column. [`doc/MLW_REST_API.docx`](doc/MLW_REST_API.docx) describes the REST API, with a section
for every table, and [`doc/openapi.yaml`](doc/openapi.yaml) is the same API as an OpenAPI 3.0 specification
(for Swagger UI, Postman or code generators).

The documents and the specification are generated from `cql/*.cql`, so rebuild them after changing the schema:

```bash
doc/generator/build.sh
```

This needs Node.js, Graphviz (`dot`), LibreOffice and Python 3 with the `uno` module. Column names,
types and keys come from the CQL files. Table and column descriptions and the diagrams live in
`doc/generator/gen.js` and `doc/generator/diagrams/*.dot`, so add a description there for any new
table or column (the build fails if one is missing).

Note: the keyspace uses `SimpleStrategy` with replication factor 1, which is suitable for a
single node. Change it before running a multi-node cluster.

## Application (REST API and web UI)

`app/` holds a Go application with an embedded Vue web UI. It serves a REST API that creates, reads,
updates and deletes the rows of every table in the Cassandra keyspace, and a web page for browsing and
editing the same data. It runs in its own Docker image (`app/Dockerfile`, build context is the repository
root) and is the `app` service in the compose files.

- **Web UI:** <http://localhost:8090/> (the *API documentation* entry in the sidebar is an interactive Swagger UI page)
- **REST API:** <http://localhost:8090/api/v1> (see [`doc/MLW_REST_API.docx`](doc/MLW_REST_API.docx) and [`doc/openapi.yaml`](doc/openapi.yaml))
- **OpenAPI specification:** <http://localhost:8090/api/v1/openapi.yaml> (served by the app, no token needed)

```bash
docker compose up -d --build     # builds the image, starts Cassandra and the app
curl localhost:8090/api/v1/tables
```

For local development the app waits for Cassandra and creates the schema (`cql/*.cql`, embedded in the
image) on first start. The port is `APP_PORT` (default 8090, bound to `127.0.0.1`).

### Configuration

The app is configured with environment variables, passed through from `.env` (see `.env.example`).
The main ones:

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `CASSANDRA_HOSTS` | `cassandra` | Comma separated contact points. |
| `CASSANDRA_PORT` | `9042` | CQL port. |
| `CASSANDRA_KEYSPACE` | `mlw` | Keyspace. |
| `CASSANDRA_USERNAME`, `CASSANDRA_PASSWORD` | none | Credentials, both or neither. |
| `CASSANDRA_LOCAL_DC` | none | Preferred datacenter, for multi-datacenter clusters. |
| `CASSANDRA_TLS`, `CASSANDRA_TLS_CA_FILE` | `false` | Connect to Cassandra with TLS (see "HTTPS and TLS"). |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` | none | Serve HTTPS with this certificate and key. |
| `API_TOKEN` | none | Bearer token required by the REST API (required in production). |
| `APPLY_SCHEMA` | `true` locally, otherwise `false` | Create the schema at startup (safe to repeat). |

All variables are listed in section 5 of the REST API document.

### Using a remote Cassandra

The app can use any Cassandra, not only the compose service. Set the connection in `.env` and start only the
`app` service, from the base compose file so that no local Cassandra is started and the local-development
defaults are not applied:

```bash
# .env
CASSANDRA_HOSTS=cassandra.example.com
CASSANDRA_USERNAME=mlw
CASSANDRA_PASSWORD=...
CASSANDRA_LOCAL_DC=dc1
CASSANDRA_TLS=true
API_TOKEN=a-long-random-token
```

```bash
docker compose -f docker-compose.yml up -d --build app
```

- The schema is not applied automatically. Create it on the remote cluster yourself (check the keyspace
  replication in `cql/001_production.cql` first), or set `APPLY_SCHEMA=true` once.
- If the cluster advertises addresses you cannot reach (SSH tunnel, NAT, port forwarding), also set
  `CASSANDRA_DISABLE_INITIAL_HOST_LOOKUP=true` and `CASSANDRA_IGNORE_PEER_ADDR=true`.
- Without `API_TOKEN` the API is open. Set one and use HTTPS (see "HTTPS and TLS") when the app is reachable
  over a network.

### HTTPS and TLS

Two connections can be encrypted, separately or together:

- **HTTPS to the app:** the app serves HTTPS when `TLS_CERT_FILE` and `TLS_KEY_FILE` are set (PEM files).
  It accepts TLS 1.2 and later (`TLS_MIN_VERSION=1.3` for 1.3 only), and picks up a renewed certificate
  within seconds without a restart.
- **TLS to Cassandra:** `CASSANDRA_TLS=true` makes the app connect with TLS and verify the server
  certificate against `CASSANDRA_TLS_CA_FILE`. Use `CASSANDRA_TLS_SERVER_NAME` when the name in the
  certificate differs from the address connected to, and `CASSANDRA_TLS_CERT_FILE` / `CASSANDRA_TLS_KEY_FILE`
  for a cluster that requires a client certificate.

For local development and testing, `docker-compose.tls.yml` turns on both, including TLS on the Cassandra
container (port 9042 then accepts only encrypted connections):

```bash
scripts/gen-certs.sh                        # private CA and certificates in ./certs (not committed)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tls.yml up -d --build
curl --cacert certs/ca.pem https://localhost:8090/api/v1/health
```

Add `-f docker-compose.prod.yml` instead of the override file for the production setup, which then has
authentication, TLS and an API token together. To reach Cassandra with TLS from the host or the container,
use the CA: `SSL_CERTFILE=certs/ca.pem SSL_VALIDATE=true cqlsh --ssl localhost`.

Notes:

- `gen-certs.sh` makes **development** certificates: a throw-away CA, and keys readable by every user so the
  containers can read them. Pass extra host names or IP addresses as arguments to include them in the
  certificates. For production, use certificates from your own CA or a public CA and restrict the key
  permissions, or terminate HTTPS in a reverse proxy in front of the app (then leave `TLS_CERT_FILE` unset).
- For a remote Cassandra with TLS, start only the app: `docker compose -f docker-compose.yml -f
  docker-compose.tls.yml up -d app`, mount the CA that signed the cluster certificate, and set
  `CASSANDRA_TLS_CA_FILE` and `CASSANDRA_TLS_SERVER_NAME` in `.env`. `CASSANDRA_TLS_SKIP_VERIFY=true` exists for
  testing only and logs a warning.
- Without HTTPS the app logs a warning when `API_TOKEN` is set, because the token travels in clear text.

### Development

```bash
cd app
make test                                   # unit tests (needs Go 1.25)
CASSANDRA_TEST_HOSTS=localhost go test ./...   # also runs the tests against a real Cassandra
make build                                  # copies cql/ and doc/openapi.yaml, builds the web UI and the binary into bin/
cd web && npm run dev                       # UI with hot reload, proxying /api to localhost:8080
```

The integration tests write rows under the project id `itest` and remove them again.

## Remote server deployment

The same compose setup runs on a remote server using the production override
(`docker-compose.prod.yml`), which enables password authentication, restarts
on boot, and uses a larger heap.

```bash
# On the server (requires Docker + Compose)
git clone <repo-url> && cd mlw-platform
cp .env.example .env            # edit values as needed
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`API_TOKEN` must be set in `.env` (the production file refuses to start without it). The `app` service also
starts, restarts on boot, and connects to Cassandra as `CASSANDRA_USERNAME` / `CASSANDRA_PASSWORD`
(default `cassandra` / `cassandra` until you change them as described below, then update `.env`). Set
`APPLY_SCHEMA=true` for the first start to create the schema. The app is published on
`${APP_BIND:-127.0.0.1}:${APP_PORT:-8090}`.

**First-time security setup:** a fresh node accepts `cassandra` / `cassandra`.
Create your own superuser and remove the default immediately:

```bash
docker compose exec cassandra cqlsh -u cassandra -p cassandra
```
```sql
CREATE ROLE admin WITH SUPERUSER = true AND LOGIN = true AND PASSWORD = 'a-strong-password';
-- reconnect as admin, then:
ALTER ROLE cassandra WITH PASSWORD = 'a-long-random-string' AND SUPERUSER = false;
```

**Network access:**

- By default the port is bound to `127.0.0.1` on the server, so use an SSH tunnel
  from your machine: `ssh -L 9042:localhost:9042 user@server`, then
  `cqlsh -u admin localhost 9042`.
- To let other hosts connect directly, set `CASSANDRA_BIND` in `.env` to the server's
  private IP and restrict port 9042 with a firewall. Avoid exposing it to the public
  internet; Cassandra traffic here is not encrypted (no TLS configured).

## Local vs. remote at a glance

| Command | Cassandra auth | Cassandra port | App | Restart policy |
| ------- | -------------- | -------------- | --- | -------------- |
| `docker compose up -d` (dev) | none | `127.0.0.1:9042` | `127.0.0.1:8090`, schema applied, token optional | no |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | password | `${CASSANDRA_BIND}:9042` | `${APP_BIND}:8090`, token required | unless-stopped |
| `docker compose -f docker-compose.yml up -d app` | remote, per `.env` | none (no local Cassandra) | `${APP_BIND}:8090` | no |

Add `-f docker-compose.tls.yml` to any of these for HTTPS and encrypted Cassandra connections (see "HTTPS and TLS").

### Notes

- The default (dev) setup is single-node with no authentication and is bound to localhost only.
- Settings can be tuned via `.env` (see `.env.example`); `.env` is git-ignored.
- The JVM heap is limited to 512M. Adjust `CASSANDRA_MAX_HEAP_SIZE` and `CASSANDRA_HEAP_NEWSIZE` in `.env` for larger workloads.
