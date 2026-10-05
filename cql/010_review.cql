-- Reviews of frames, one row per review, partitioned by project.
-- A frame has no single id (it is identified by sequence, scene, shot and
-- frame number), so the frame columns together stand in for frame_id and point
-- at mlw.frame; Cassandra does not enforce the reference.
-- reviewer refers to mlw.user.user_id; comment_refs is an ordered list of mlw.comment.comment_id values.
CREATE TABLE IF NOT EXISTS mlw.review (
  project_id   text,
  review_id    text,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  frame_number int,
  reviewer     text,
  status       text,
  comment_refs list<text>,
  description  text,
  PRIMARY KEY ((project_id), review_id)
);

-- The text of a comment, referenced from mlw.review.comment_refs.
CREATE TABLE IF NOT EXISTS mlw.comment (
  project_id   text,
  comment_id   text,
  comment_text text,
  PRIMARY KEY ((project_id), comment_id)
);

-- Lookup of the reviews of a frame: one row per review, partitioned by frame.
-- Must be kept in sync with mlw.review (write both in a logged batch, and
-- update both when status changes).
CREATE TABLE IF NOT EXISTS mlw.review_by_frame (
  project_id   text,
  sequence_id  text,
  scene_id     text,
  shot_id      text,
  frame_number int,
  review_id    text,
  reviewer     text,
  status       text,
  PRIMARY KEY ((project_id, sequence_id, scene_id, shot_id, frame_number), review_id)
);
