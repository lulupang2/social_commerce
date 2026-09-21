package auth

import (
	"context"
	"time"
)

const devMemberID = "00000000-0000-4000-8000-000000000001"

func (s *Store) DevLogin(ctx context.Context, oldToken string) (string, SessionView, error) {
	view := SessionView{}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", view, errDB
	}
	defer tx.Rollback(context.Background())

	displayName := "SummerGear Test User"
	email := "dev@summergear.local"
	var status string
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.members(id,display_name,email,onboarded)
  VALUES($1,$2,$3,true)
  ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email
  RETURNING id::text,display_name,email,onboarded,status`,
		devMemberID, displayName, email).Scan(
		&view.Member.ID, &view.Member.DisplayName, &view.Member.Email, &view.Member.Onboarded, &status)
	if err != nil {
		return "", view, errDB
	}
	if status != "active" {
		return "", view, errAccount
	}

	token, err := randomToken()
	if err != nil {
		return "", view, err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return "", view, errDB
	}
	view.Session = SessionInfo{
		ExpiresAt:         now.Add(s.Config.IdleTTL),
		AbsoluteExpiresAt: now.Add(s.Config.AbsoluteTTL),
		ReauthenticatedAt: &now,
	}

	if validToken(oldToken) {
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.auth_sessions
   SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL`, hashToken(oldToken), now); err != nil {
			return "", view, errDB
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.auth_sessions
  (token_hash,member_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,reauthenticated_at)
  VALUES($1,$2,$3,$3,$4,$5,$3)`,
		hashToken(token), view.Member.ID, now, view.Session.ExpiresAt, view.Session.AbsoluteExpiresAt); err != nil {
		return "", view, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return "", view, errDB
	}

	view.CSRFToken = csrfToken(token)
	return token, view, nil
}
