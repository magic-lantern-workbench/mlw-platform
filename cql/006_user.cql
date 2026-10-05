-- Application users, one row per user. No credentials are stored here.
CREATE TABLE IF NOT EXISTS mlw.user (
  user_id      text,
  username     text,
  email        text,
  display_name text,
  role         text,
  created_at   timestamp,
  description  text,
  PRIMARY KEY (user_id)
);

-- Lookup of a user by email. Must be kept in sync with mlw.user.email when
-- writing (use a logged batch), and the old row deleted if the email changes.
CREATE TABLE IF NOT EXISTS mlw.user_by_email (
  email   text,
  user_id text,
  PRIMARY KEY (email)
);
