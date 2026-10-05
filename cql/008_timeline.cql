-- A timeline is an ordered sequence of frames: one row per entry, ordered by
-- position. The frame columns point at rows in mlw.frame (all layers of that
-- frame_number); Cassandra does not enforce the reference.
-- name and description describe the timeline itself, so they are static
-- (stored once per timeline and shared by all its entries).
CREATE TABLE IF NOT EXISTS mlw.timeline (
  project_id   text,
  timeline_id  text,
  position     int,
  name         text static,
  description  text static,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  frame_number int,
  PRIMARY KEY ((project_id, timeline_id), position)
);
