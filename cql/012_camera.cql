-- Camera data, partitioned by shot like mlw.layer: frame numbers are within
-- the shot. References between tables are not enforced by Cassandra.

CREATE TABLE IF NOT EXISTS mlw.camera_move (
  project_id     text,
  episode_id     text,
  sequence_id    text,
  scene_id       text,
  shot_id        text,
  camera_move_id text,
  type           text,
  start_frame    int,
  end_frame      int,
  description    text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id), camera_move_id)
);

CREATE TABLE IF NOT EXISTS mlw.keyframe (
  project_id    text,
  episode_id    text,
  sequence_id   text,
  scene_id      text,
  shot_id       text,
  keyframe_id   text,
  frame_number  int,
  x             float,
  y             float,
  z             float,
  zoom          float,
  focal_length  float,
  interpolation text,
  note          text,
  description   text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id), keyframe_id)
);

-- A camera is a collection of camera moves and keyframes, held as ordered
-- lists of camera_move_id and keyframe_id values.
CREATE TABLE IF NOT EXISTS mlw.camera (
  project_id     text,
  episode_id     text,
  sequence_id    text,
  scene_id       text,
  shot_id        text,
  camera_id      text,
  name           text,
  projection     text,
  move_refs      list<text>,
  keyframe_refs  list<text>,
  description    text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id), camera_id)
);
