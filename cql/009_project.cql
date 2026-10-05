-- Projects, one row per project. project_id is the project_id used by
-- mlw.production, sequence, scene, shot, frame, layer and the other tables;
-- Cassandra does not enforce the reference.
CREATE TABLE IF NOT EXISTS mlw.project (
  project_id  text,
  name        text,
  status      text,
  owner_id    text,
  created_at  timestamp,
  description text,
  PRIMARY KEY (project_id)
);

-- Users who work on a project: one row per member, partitioned by project.
-- user_id refers to mlw.user.user_id; role is the member's role in this project.
CREATE TABLE IF NOT EXISTS mlw.project_member (
  project_id text,
  user_id    text,
  role       text,
  added_at   timestamp,
  PRIMARY KEY ((project_id), user_id)
);

-- Lookup of the projects a user belongs to: one row per project, partitioned
-- by user. Must be kept in sync with mlw.project_member (write both in a
-- logged batch, and delete both when a member is removed).
CREATE TABLE IF NOT EXISTS mlw.project_by_user (
  user_id    text,
  project_id text,
  role       text,
  added_at   timestamp,
  PRIMARY KEY ((user_id), project_id)
);
