-- Production > Episode > Sequence > Scene > Shot > Frame
-- Each of episode, sequence, scene and frame holds the children of one parent, so a
-- partition is one parent and its rows are that parent's children.
-- description describes the row itself (a scene, a shot, a frame, ...).
-- Each level has a url column (episode_url, sequence_url, scene_url, shot_url,
-- frame_url) holding a URL to that item in an asset management tool. In the
-- episode, sequence and scene tables the url is of the parent, not of the row,
-- so it is a static column; in shot and frame it describes the row.

-- An episode is one or more sequences: one row per sequence.
CREATE TABLE IF NOT EXISTS mlw.episode (
  project_id  text,
  episode_id  text,
  sequence_id text,
  episode_url text static,
  description text,
  PRIMARY KEY ((project_id, episode_id), sequence_id)
);

-- A sequence is one or more scenes: one row per scene.
CREATE TABLE IF NOT EXISTS mlw.sequence (
  project_id  text,
  sequence_id text,
  scene_id    text,
  sequence_url text static,
  description text,
  PRIMARY KEY ((project_id, sequence_id), scene_id)
);

-- A scene is one or more shots: one row per shot.
CREATE TABLE IF NOT EXISTS mlw.scene (
  project_id  text,
  episode_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  scene_url   text static,
  description text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id), shot_id)
);

-- One row per shot, holding the shot's own attributes.
CREATE TABLE IF NOT EXISTS mlw.shot (
  project_id  text,
  episode_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  shot_url    text,
  description text,
  frame_rate  float,
  start_frame int,
  end_frame   int,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id))
);

-- A shot is a list of frames: one row per layer of each frame, ordered by
-- frame number then layer. audio_ref, dialog_ref and note_ref refer to
-- audio_ref_id, dialog_id and note_id in cql/007_audio_dialog_note.cql.
CREATE TABLE IF NOT EXISTS mlw.frame (
  project_id   text,
  episode_id   text,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  frame_number int,
  layer_id     text,
  frame_url    text,
  audio_ref    text,
  dialog_ref   text,
  note_ref     text,
  description  text,
  PRIMARY KEY ((project_id, episode_id, sequence_id, scene_id, shot_id), frame_number, layer_id)
);
