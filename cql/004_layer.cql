-- Layers available to a shot: one row per layer, partitioned by shot.
-- mlw.frame.layer_id refers to layer_id here; asset_ref refers to mlw.asset.asset_id.
-- z_order is the stacking order.
CREATE TABLE IF NOT EXISTS mlw.layer (
  project_id  text,
  episode_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  layer_id    text,
  name        text,
  type        text,
  z_order     int,
  visibility  boolean,
  asset_ref   text,
  description text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id), layer_id)
);
