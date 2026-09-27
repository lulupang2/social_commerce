package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Store) CreateLogin(ctx context.Context, l *Login) error {
	err := s.Pool.QueryRow(ctx, `INSERT INTO summergear_app.auth_login_transactions
  (state_hash,browser_hash,provider,return_path,pkce_verifier,nonce,purpose,anchor_session_hash,member_id,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+$10::bigint*interval '1 second')
  RETURNING created_at,expires_at`, l.StateHash, l.BrowserHash, l.Provider, l.ReturnPath, l.Verifier, l.Nonce, l.Purpose, l.AnchorSessionHash, l.MemberID, int64(s.Config.LoginTTL/time.Second)).Scan(&l.CreatedAt, &l.ExpiresAt)
	if err != nil {
		return errDB
	}
	return nil
}

// Consumption commits before any external request, including failed exchanges.
// Concurrent callbacks cannot both consume the same state. Invalid browser or
// provider requests do not destroy another browser's legitimate transaction.
func (s *Store) ConsumeLogin(ctx context.Context, state, browser, provider string) (Login, error) {
	l := Login{}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return l, errDB
	}
	defer tx.Rollback(context.Background())
	var consumed *time.Time
	var now time.Time
	err = tx.QueryRow(ctx, `SELECT state_hash,browser_hash,provider,return_path,COALESCE(pkce_verifier,''),COALESCE(nonce,''),
  purpose,anchor_session_hash,member_id::text,created_at,expires_at,consumed_at,clock_timestamp()
  FROM summergear_app.auth_login_transactions WHERE state_hash=$1 FOR UPDATE`, hashToken(state)).Scan(
		&l.StateHash, &l.BrowserHash, &l.Provider, &l.ReturnPath, &l.Verifier, &l.Nonce, &l.Purpose, &l.AnchorSessionHash, &l.MemberID, &l.CreatedAt, &l.ExpiresAt, &consumed, &now)
	if errors.Is(err, pgx.ErrNoRows) {
		return l, errState
	}
	if err != nil {
		return l, errDB
	}
	if !equal(l.BrowserHash, hashToken(browser)) {
		return l, errBrowser
	}
	if l.Provider != provider {
		return l, errProviderMismatch
	}
	if consumed != nil {
		return l, errStateUsed
	}
	if !l.ExpiresAt.After(now) {
		return l, errStateExpired
	}
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.auth_login_transactions SET consumed_at=clock_timestamp(),pkce_verifier=NULL,nonce=NULL WHERE state_hash=$1`, l.StateHash); err != nil {
		return l, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return l, errDB
	}
	return l, nil
}

func (s *Store) CompleteLogin(ctx context.Context, l Login, identity Identity, oldToken string) (string, SessionView, error) {
	view := SessionView{}
	if identity.Provider != l.Provider || identity.Subject == "" {
		return "", view, errResponse
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", view, errDB
	}
	defer tx.Rollback(context.Background())
	// Serialize the account key before attempting member creation. The DB unique
	// constraint remains the final invariant; no email-based lookup is performed.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, identity.Provider+":"+identity.Subject); err != nil {
		return "", view, errDB
	}
	var status string
	err = tx.QueryRow(ctx, `SELECT m.id::text,m.display_name,m.email,m.onboarded,m.status
  FROM summergear_app.auth_identities i JOIN summergear_app.members m ON m.id=i.member_id
  WHERE i.provider=$1 AND i.subject=$2 FOR UPDATE OF m`, identity.Provider, identity.Subject).Scan(
		&view.Member.ID, &view.Member.DisplayName, &view.Member.Email, &view.Member.Onboarded, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		if l.Purpose == "reauth" {
			return "", view, errIdentity
		}
		err = tx.QueryRow(ctx, `INSERT INTO summergear_app.members(display_name,email) VALUES($1,$2)
   RETURNING id::text,display_name,email,onboarded,status`, identity.DisplayName, identity.Email).Scan(
			&view.Member.ID, &view.Member.DisplayName, &view.Member.Email, &view.Member.Onboarded, &status)
		if err != nil {
			return "", view, errDB
		}
		if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.auth_identities(provider,subject,member_id) VALUES($1,$2,$3)`, identity.Provider, identity.Subject, view.Member.ID); err != nil {
			return "", view, errDB
		}
	} else if err != nil {
		return "", view, errDB
	}
	if status != "active" {
		return "", view, errAccount
	}
	if l.Purpose == "reauth" {
		if l.MemberID == nil || l.AnchorSessionHash == nil || *l.MemberID != view.Member.ID || !validToken(oldToken) || !equal(*l.AnchorSessionHash, hashToken(oldToken)) {
			return "", view, errIdentity
		}
		var valid bool
		err = tx.QueryRow(ctx, `SELECT revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
   FROM summergear_app.auth_sessions WHERE token_hash=$1 AND member_id=$2 FOR UPDATE`, *l.AnchorSessionHash, view.Member.ID).Scan(&valid)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !valid {
			return "", view, errUnauthorized
		}
		if err != nil {
			return "", view, errDB
		}
	}
	token, err := randomToken()
	if err != nil {
		return "", view, err
	}
	var now time.Time
	if err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
		return "", view, errDB
	}
	view.Session = SessionInfo{ExpiresAt: now.Add(s.Config.IdleTTL), AbsoluteExpiresAt: now.Add(s.Config.AbsoluteTTL)}
	if l.Purpose == "reauth" {
		view.Session.ReauthenticatedAt = &now
	}
	if validToken(oldToken) {
		if _, err = tx.Exec(ctx, `UPDATE summergear_app.auth_sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL`, hashToken(oldToken), now); err != nil {
			return "", view, errDB
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.auth_sessions
  (token_hash,member_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,reauthenticated_at)
  VALUES($1,$2,$3,$3,$4,$5,$6)`, hashToken(token), view.Member.ID, now, view.Session.ExpiresAt, view.Session.AbsoluteExpiresAt, view.Session.ReauthenticatedAt); err != nil {
		return "", view, errDB
	}
	if err = tx.Commit(ctx); err != nil {
		return "", view, errDB
	}
	view.CSRFToken = csrfToken(token)
	return token, view, nil
}
