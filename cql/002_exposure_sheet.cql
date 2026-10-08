-- One exposure sheet per shot, keyed by project, episode, sequence, scene and shot.
-- xml_url and svg_url hold URLs pointing to the files (Cassandra has no URL
-- type, so they are stored as text); the files themselves live elsewhere.
CREATE TABLE IF NOT EXISTS mlw.exposure_sheet (
  project_id  text,
  episode_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  xml_url     text,
  svg_url     text,
  description text,
  PRIMARY KEY ((project_id), episode_id, sequence_id, scene_id, shot_id)
);
