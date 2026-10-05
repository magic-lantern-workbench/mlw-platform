-- Production > Sequence > Scene > Shot > Frame
-- Each of sequence, scene and frame holds the children of one parent, so a
-- partition is one parent and its rows are that parent's children.
-- description describes the row itself (a scene, a shot, a frame, ...).

-- A sequence is one or more scenes: one row per scene.
CREATE TABLE IF NOT EXISTS mlw.sequence (
  project_id  text,
  sequence_id text,
  scene_id    text,
  description text,
  PRIMARY KEY ((project_id, sequence_id), scene_id)
);

-- A scene is one or more shots: one row per shot.
CREATE TABLE IF NOT EXISTS mlw.scene (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  description text,
  PRIMARY KEY ((project_id, sequence_id, scene_id), shot_id)
);

-- One row per shot, holding the shot's own attributes.
CREATE TABLE IF NOT EXISTS mlw.shot (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  description text,
  frame_rate  float,
  start_frame int,
  end_frame   int,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id))
);

-- A shot is a list of frames: one row per layer of each frame, ordered by
-- frame number then layer.
CREATE TABLE IF NOT EXISTS mlw.frame (
  project_id   text,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  frame_number int,
  layer_id     text,
  description  text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id), frame_number, layer_id)
);
