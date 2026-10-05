package store

import (
	"context"
	"fmt"
)

// Some tables repeat data from another table under a different key so a
// different query can be answered. The API keeps them in step: writes go to the
// source table and then to the lookup table. The lookup tables cannot be
// written directly.
var derivedTables = map[string]string{
	"user_by_email":   "user",
	"project_by_user": "project_member",
	"review_by_frame": "review",
}

type hook struct {
	// before runs ahead of a create or update with the old row (nil on create)
	// and the incoming values, including the key.
	before func(ctx context.Context, s *Store, old, incoming Row) error
	// after runs after a successful write or delete with the old row (nil on
	// create) and the new row (nil on delete).
	after func(ctx context.Context, s *Store, old, new Row) error
}

var hooks = map[string]hook{
	"user":           {before: userBefore, after: userAfter},
	"project_member": {after: memberAfter},
	"review":         {after: reviewAfter},
}

func str(r Row, col string) string {
	if r == nil {
		return ""
	}
	s, _ := r[col].(string)
	return s
}

// ---- user -> user_by_email ----

// userBefore claims the email so two users cannot share one.
func userBefore(ctx context.Context, s *Store, old, incoming Row) error {
	email := str(incoming, "email")
	if email == "" || (old != nil && str(old, "email") == email) {
		return nil
	}
	uid := str(incoming, "user_id")
	m := map[string]any{}
	applied, err := s.session.Query(
		fmt.Sprintf(`INSERT INTO "%s"."user_by_email" (email, user_id) VALUES (?, ?) IF NOT EXISTS`, s.keyspace),
		email, uid).WithContext(ctx).MapScanCAS(m)
	if err != nil {
		return err
	}
	if !applied && m["user_id"] != uid {
		return fmt.Errorf("%w: email %q is already used by another user", ErrConflict, email)
	}
	return nil
}

func userAfter(ctx context.Context, s *Store, old, new Row) error {
	uid := str(new, "user_id")
	if new == nil {
		uid = str(old, "user_id")
	}
	oldEmail, newEmail := str(old, "email"), str(new, "email")
	if newEmail != "" {
		err := s.session.Query(fmt.Sprintf(`INSERT INTO "%s"."user_by_email" (email, user_id) VALUES (?, ?)`, s.keyspace),
			newEmail, uid).WithContext(ctx).Exec()
		if err != nil {
			return err
		}
	}
	if oldEmail != "" && oldEmail != newEmail {
		// only release the email if it still points at this user
		_, err := s.session.Query(fmt.Sprintf(`DELETE FROM "%s"."user_by_email" WHERE email = ? IF user_id = ?`, s.keyspace),
			oldEmail, uid).WithContext(ctx).MapScanCAS(map[string]any{})
		return err
	}
	return nil
}

// ---- project_member -> project_by_user ----

func memberAfter(ctx context.Context, s *Store, old, new Row) error {
	if new == nil {
		return s.session.Query(fmt.Sprintf(`DELETE FROM "%s"."project_by_user" WHERE user_id = ? AND project_id = ?`, s.keyspace),
			str(old, "user_id"), str(old, "project_id")).WithContext(ctx).Exec()
	}
	return s.session.Query(
		fmt.Sprintf(`INSERT INTO "%s"."project_by_user" (user_id, project_id, role, added_at) VALUES (?, ?, ?, ?)`, s.keyspace),
		str(new, "user_id"), str(new, "project_id"), new["role"], new["added_at"]).WithContext(ctx).Exec()
}

// ---- review -> review_by_frame ----

var frameKeyCols = []string{"project_id", "sequence_id", "scene_id", "shot_id", "frame_number", "review_id"}

// frameKey returns the key of the review_by_frame row, or nil if the review
// is not yet attached to a frame.
func frameKey(r Row) []any {
	if r == nil {
		return nil
	}
	key := make([]any, len(frameKeyCols))
	for i, c := range frameKeyCols {
		v := r[c]
		if v == nil || v == "" {
			return nil
		}
		key[i] = v
	}
	return key
}

func reviewAfter(ctx context.Context, s *Store, old, new Row) error {
	oldK, newK := frameKey(old), frameKey(new)
	if oldK != nil && fmt.Sprint(oldK) != fmt.Sprint(newK) {
		err := s.session.Query(
			fmt.Sprintf(`DELETE FROM "%s"."review_by_frame" WHERE project_id = ? AND sequence_id = ? AND scene_id = ? AND shot_id = ? AND frame_number = ? AND review_id = ?`, s.keyspace),
			oldK...).WithContext(ctx).Exec()
		if err != nil {
			return err
		}
	}
	if newK == nil {
		return nil
	}
	return s.session.Query(
		fmt.Sprintf(`INSERT INTO "%s"."review_by_frame" (project_id, sequence_id, scene_id, shot_id, frame_number, review_id, reviewer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, s.keyspace),
		append(newK, new["reviewer"], new["status"])...).WithContext(ctx).Exec()
}
