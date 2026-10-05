-- Version control, partitioned by project.
-- A version control holds a collection of revisions: mlw.revision rows share
-- the version control's key, so reading that partition returns them all.
CREATE TABLE IF NOT EXISTS mlw.version_control (
  project_id         text,
  version_control_id text,
  description        text,
  PRIMARY KEY ((project_id), version_control_id)
);

-- One row per revision, newest first. author refers to mlw.user.user_id.
-- created_at is a CQL timestamp, which Cassandra stores as UTC milliseconds
-- since the epoch; always write it as UTC.
CREATE TABLE IF NOT EXISTS mlw.revision (
  project_id         text,
  version_control_id text,
  revision_number    int,
  author             text,
  created_at         timestamp,
  description        text,
  PRIMARY KEY ((project_id, version_control_id), revision_number)
) WITH CLUSTERING ORDER BY (revision_number DESC);
