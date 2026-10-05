CREATE KEYSPACE IF NOT EXISTS mlw
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

-- One row per shot. Partitioned by project so a project's shots are read
-- together, ordered by sequence, scene, then shot.
CREATE TABLE IF NOT EXISTS mlw.production (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  title       text,
  frame_rate  float,
  start_frame int,
  end_frame   int,
  PRIMARY KEY ((project_id), sequence_id, scene_id, shot_id)
);
