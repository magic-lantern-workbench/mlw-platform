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
docker compose up -d
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

On a remote server using authentication, add `-u <user> -p <password>` to `cqlsh`.

| File | Contents |
| ---- | -------- |
| `001_production.cql` | `mlw` keyspace and `production` table (one row per sequence, partitioned by `project_id`) |
| `002_exposure_sheet.cql` | `exposure_sheet` table holding the URLs of an XML file and an SVG file per shot |
| `003_hierarchy.cql` | `sequence` (rows are scenes), `scene` (rows are shots), `shot` (one row per shot, with `frame_rate`, `start_frame`, `end_frame`) and `frame` (one row per layer of each frame) tables |
| `004_layer.cql` | `layer` table (one row per layer, partitioned by shot, with `name`, `type`, `z_order`, `asset_ref`, `visibility`) |
| `005_asset.cql` | `asset` table (`name`, `category`, `version`, `source_url`, `description`) |
| `006_user.cql` | `user` table (`username`, `email`, `display_name`, `role`, `created_at`, `description`) and `user_by_email` lookup table |
| `007_audio_dialog_note.cql` | `audio_ref` (`track`, `start_frame`, `end_frame`), `dialog` (`phoneme`) and `note` (`note_text`) tables, partitioned by shot and referenced from `frame` |
| `008_timeline.cql` | `timeline` table (one row per entry, ordered by `position`, each pointing at a frame) |
| `009_project.cql` | `project` table (`name`, `status`, `owner_id`, `created_at`, `description`) and `project_member` table (one row per member, with `role` and `added_at`) and `project_by_user` lookup table |

Every table has a `description` text column.

Note: the keyspace uses `SimpleStrategy` with replication factor 1, which is suitable for a
single node. Change it before running a multi-node cluster.

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

| Command | Auth | Port binding | Restart policy |
| ------- | ---- | ------------ | -------------- |
| `docker compose up -d` (dev) | none | `127.0.0.1:9042` | no |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | password | `${CASSANDRA_BIND}:9042` | unless-stopped |

### Notes

- The default (dev) setup is single-node with no authentication and is bound to localhost only.
- Settings can be tuned via `.env` (see `.env.example`); `.env` is git-ignored.
- The JVM heap is limited to 512M. Adjust `CASSANDRA_MAX_HEAP_SIZE` and `CASSANDRA_HEAP_NEWSIZE` in `.env` for larger workloads.
