package auth

import (
 "context"
 "errors"
 "time"

 "github.com/jackc/pgx/v5"
)

func (s *Store) Session(ctx context.Context,token string)(SessionView,error){
 view:=SessionView{}
 if !validToken(token){return view,errUnauthorized}
 err:=s.Pool.QueryRow(ctx,`UPDATE summergear_app.auth_sessions s
  SET last_seen_at=clock_timestamp(),idle_expires_at=LEAST(s.absolute_expires_at,clock_timestamp()+$2::bigint*interval '1 second')
  FROM summergear_app.members m WHERE s.member_id=m.id AND m.status='active' AND s.token_hash=$1
   AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
  RETURNING m.id::text,m.display_name,m.email,m.onboarded,s.idle_expires_at,s.absolute_expires_at,s.reauthenticated_at`,
  hashToken(token),int64(s.Config.IdleTTL/time.Second)).Scan(&view.Member.ID,&view.Member.DisplayName,&view.Member.Email,&view.Member.Onboarded,
  &view.Session.ExpiresAt,&view.Session.AbsoluteExpiresAt,&view.Session.ReauthenticatedAt)
 if errors.Is(err,pgx.ErrNoRows){return view,errUnauthorized};if err!=nil{return view,errDB}
 view.CSRFToken=csrfToken(token)
 return view,nil
}

// Global revocation and explicit reauthentication lock the same member before
// locking sessions. A revoked anchor cannot be resurrected by an in-flight reauth.
func (s *Store) Logout(ctx context.Context,token string,all bool)error{
 if !validToken(token){return errUnauthorized}
 tx,err:=s.Pool.Begin(ctx);if err!=nil{return errDB};defer tx.Rollback(context.Background())
 var member string
 err=tx.QueryRow(ctx,`SELECT m.id::text FROM summergear_app.members m
  JOIN summergear_app.auth_sessions s ON s.member_id=m.id
  WHERE s.token_hash=$1 AND m.status='active' FOR UPDATE OF m`,hashToken(token)).Scan(&member)
 if errors.Is(err,pgx.ErrNoRows){return errUnauthorized};if err!=nil{return errDB}
 var valid bool
 var reauth *time.Time
 var now time.Time
 err=tx.QueryRow(ctx,`SELECT revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp(),
  reauthenticated_at,clock_timestamp() FROM summergear_app.auth_sessions WHERE token_hash=$1 FOR UPDATE`,hashToken(token)).Scan(&valid,&reauth,&now)
 if err!=nil{return errDB};if !valid{return errUnauthorized}
 if all {
  if reauth==nil||reauth.After(now)||now.Sub(*reauth)>s.Config.ReauthTTL{return errReauth}
  if _,err=tx.Exec(ctx,`UPDATE summergear_app.auth_sessions SET revoked_at=$2 WHERE member_id=$1 AND revoked_at IS NULL`,member,now);err!=nil{return errDB}
  if _,err=tx.Exec(ctx,`UPDATE summergear_app.auth_login_transactions SET consumed_at=$2,pkce_verifier=NULL,nonce=NULL
   WHERE member_id=$1 AND consumed_at IS NULL`,member,now);err!=nil{return errDB}
 }else{
  if _,err=tx.Exec(ctx,`UPDATE summergear_app.auth_sessions SET revoked_at=$2 WHERE token_hash=$1`,hashToken(token),now);err!=nil{return errDB}
 }
 if err=tx.Commit(ctx);err!=nil{return errDB}
 return nil
}
