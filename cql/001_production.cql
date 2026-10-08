CREATE KEYSPACE IF NOT EXISTS mlw
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- A production is one or more episodes: one row per episode,
-- partitioned by project and ordered by episode.
CREATE TABLE IF NOT EXISTS mlw.production (
  project_id  text,
  episode_id  text,
  title       text,
  description text,
  PRIMARY KEY ((project_id), episode_id)
);
