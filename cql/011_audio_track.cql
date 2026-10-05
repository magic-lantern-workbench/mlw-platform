-- Audio tracks, one row per track. Tracks are shared across projects, so
-- there is no project_id.
-- url points at the audio file; file_name is its original name.
-- mlw.audio_ref.track holds a track_id from this table.
CREATE TABLE IF NOT EXISTS mlw.track (
  track_id    text,
  name        text,
  type        text,
  file_name   text,
  url         text,
  description text,
  PRIMARY KEY (track_id)
);

-- A group of audio tracks, shared across projects: one row per entry, ordered
-- by position, each pointing at a row in mlw.track. Cassandra does not enforce
-- the reference.
-- description is static (stored once per group, shared by all its entries).
CREATE TABLE IF NOT EXISTS mlw.audio_tracks (
  audio_tracks_id text,
  position        int,
  description     text static,
  track_id        text,
  PRIMARY KEY ((audio_tracks_id), position)
);
