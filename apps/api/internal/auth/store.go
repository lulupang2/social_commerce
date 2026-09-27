package auth

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Pool   *pgxpool.Pool
	Config Config
}
type Member struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"displayName"`
	Email       *string `json:"email"`
	Onboarded   bool    `json:"onboarded"`
}
type SessionInfo struct {
	ExpiresAt         time.Time  `json:"expiresAt"`
	AbsoluteExpiresAt time.Time  `json:"absoluteExpiresAt"`
	ReauthenticatedAt *time.Time `json:"reauthenticatedAt"`
}
type SessionView struct {
	Member    Member      `json:"member"`
	CSRFToken string      `json:"csrfToken"`
	Session   SessionInfo `json:"session"`
}
type Login struct {
	StateHash, BrowserHash, Provider, ReturnPath, Verifier, Nonce, Purpose string
	AnchorSessionHash, MemberID                                            *string
	CreatedAt, ExpiresAt                                                   time.Time
}

func (s *Store) Ready(ctx context.Context) error {
	for _, table := range []string{"members", "auth_identities", "auth_sessions", "auth_login_transactions"} {
		if _, err := s.Pool.Exec(ctx, "SELECT 1 FROM summergear_app."+table+" LIMIT 0"); err != nil {
			return errDB
		}
	}
	return nil
}
