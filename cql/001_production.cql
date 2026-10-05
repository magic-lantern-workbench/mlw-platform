CREATE KEYSPACE IF NOT EXISTS mlw
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- A production is one or more sequences: one row per sequence,
-- partitioned by project and ordered by sequence.
CREATE TABLE IF NOT EXISTS mlw.production (
  project_id  text,
  sequence_id text,
  title       text,
  description text,
  PRIMARY KEY ((project_id), sequence_id)
);
