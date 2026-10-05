-- One exposure sheet per shot, keyed the same way as mlw.production.
-- Both files are text formats, so they are stored as text. Keep each file
-- well under ~1 MB; Cassandra is not designed for large cells.
CREATE TABLE IF NOT EXISTS mlw.exposure_sheet (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  xml_file    text,
  svg_file    text,
  PRIMARY KEY ((project_id), sequence_id, scene_id, shot_id)
);
