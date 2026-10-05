-- Audio, dialog and notes attached to frames (mlw.frame.audio_ref,
-- dialog_ref and note_ref refer to the ids below). One row per item,
-- partitioned by shot like mlw.layer.

CREATE TABLE IF NOT EXISTS mlw.audio_ref (
  project_id   text,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  audio_ref_id text,
  track        text,
  start_frame  int,
  end_frame    int,
  description  text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id), audio_ref_id)
);

CREATE TABLE IF NOT EXISTS mlw.dialog (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  dialog_id   text,
  phoneme     text,
  description text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id), dialog_id)
);

CREATE TABLE IF NOT EXISTS mlw.note (
  project_id  text,
  sequence_id text,
  scene_id    text,
  shot_id     text,
  note_id     text,
  note_text   text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id), note_id)
);
