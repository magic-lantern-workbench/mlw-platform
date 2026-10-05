-- Layers available to a shot: one row per layer, partitioned by shot.
-- mlw.frame.layer_id refers to layer_id here.
-- layer_order is the stacking order (ORDER is a reserved CQL word).
CREATE TABLE IF NOT EXISTS mlw.layer (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  layer_id    text,
  name        text,
  type        text,
  layer_order int,
  visibility  boolean,
  description text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id), layer_id)
);
