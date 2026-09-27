package social

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Post struct {
	ID          string     `json:"id"`
	AuthorID    string     `json:"authorId"`
	AuthorName  string     `json:"authorName"`
	Sport       string     `json:"sport"`
	Type        string     `json:"type"`
	Title       string     `json:"title"`
	Body        string     `json:"body"`
	Status      string     `json:"status"`
	Reason      *string    `json:"reason"`
	Likes       int        `json:"likes"`
	Liked       bool       `json:"liked"`
	Comments    int        `json:"comments"`
	PublishedAt *time.Time `json:"publishedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
type Comment struct {
	ID        string    `json:"id"`
	PostID    string    `json:"postId"`
	AuthorID  string    `json:"authorId"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

const postColumns = `p.id::text,p.author_id::text,COALESCE(m.display_name,'SummerGear 크루'),p.sport,p.post_type,p.title,p.body,p.status,
 CASE WHEN p.status='rejected' THEN (SELECT e.reason FROM summergear_app.community_review_events e
 WHERE e.post_id=p.id AND e.to_status='rejected' ORDER BY e.id DESC LIMIT 1) ELSE NULL END,
 (SELECT count(*) FROM summergear_app.community_reactions r WHERE r.post_id=p.id)::int,
 (SELECT count(*) FROM summergear_app.community_reactions r WHERE r.post_id=p.id AND r.member_id=NULLIF($1,'')::uuid)>0,
 (SELECT count(*) FROM summergear_app.community_comments c WHERE c.post_id=p.id)::int,
 p.published_at,p.created_at,p.updated_at`

func validPost(sport, kind, title, body string) bool {
	return (sport == "surf" || sport == "tennis") && (kind == "guide" || kind == "review" || kind == "meetup" || kind == "discussion") &&
		utf8.RuneCountInString(title) >= 4 && utf8.RuneCountInString(title) <= 160 && utf8.RuneCountInString(body) >= 10 && utf8.RuneCountInString(body) <= 10000
}
func scanPost(rows pgx.Rows) (Post, error) {
	var p Post
	err := rows.Scan(&p.ID, &p.AuthorID, &p.AuthorName, &p.Sport, &p.Type, &p.Title, &p.Body, &p.Status, &p.Reason, &p.Likes, &p.Liked, &p.Comments, &p.PublishedAt, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}
func (s *Store) listPosts(ctx context.Context, member, where string, ids ...any) ([]Post, error) {
	var q interface {
		Query(context.Context, string, ...any) (pgx.Rows, error)
	} = s.Pool
	var tx pgx.Tx
	if member != "" {
		var err error
		tx, err = s.memberTx(ctx, member)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(context.Background())
		q = tx
	}
	args := append([]any{member}, ids...)
	rows, err := q.Query(ctx, `SELECT `+postColumns+` FROM summergear_app.community_posts p
 JOIN summergear_app.members m ON m.id=p.author_id WHERE `+where+` ORDER BY p.created_at DESC,p.id DESC`, args...)
	if err != nil {
		return nil, unavailable
	}
	items := []Post{}
	for rows.Next() {
		post, e := scanPost(rows)
		if e != nil {
			rows.Close()
			return nil, unavailable
		}
		items = append(items, post)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, unavailable
	}
	if tx != nil && tx.Commit(ctx) != nil {
		return nil, unavailable
	}
	return items, nil
}
func (s *Store) PublicPosts(ctx context.Context, member string) ([]Post, error) {
	return s.listPosts(ctx, member, "p.status='active'")
}
func (s *Store) MyPosts(ctx context.Context, member string) ([]Post, error) {
	return s.listPosts(ctx, member, "p.author_id=$2", member)
}
func (s *Store) PendingPosts(ctx context.Context, reviewer string) ([]Post, error) {
	tx, err := s.memberTx(ctx, reviewer)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	var permitted bool
	if tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers WHERE member_id=$1)`, reviewer).Scan(&permitted) != nil {
		return nil, unavailable
	}
	if !permitted {
		return nil, &Failure{403, "SOCIAL_REVIEW_FORBIDDEN", "Reviewer access required"}
	}
	if tx.Commit(ctx) != nil {
		return nil, unavailable
	}
	return s.listPosts(ctx, reviewer, "p.status='pending_review'")
}
func (s *Store) Post(ctx context.Context, member, id string) (Post, error) {
	if uuid.Validate(id) != nil {
		return Post{}, invalid
	}
	items, err := s.listPosts(ctx, member, "p.id=$2", id)
	if err != nil {
		return Post{}, err
	}
	if len(items) == 0 {
		return Post{}, missing
	}
	return items[0], nil
}
func (s *Store) CreatePost(ctx context.Context, member, sport, kind, title, body string) (Post, error) {
	title, body = strings.TrimSpace(title), strings.TrimSpace(body)
	if !validPost(sport, kind, title, body) {
		return Post{}, invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(context.Background())
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO summergear_app.community_posts(author_id,sport,post_type,title,body)
 VALUES($1,$2,$3,$4,$5) RETURNING id::text`, member, sport, kind, title, body).Scan(&id); err != nil {
		return Post{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Post{}, unavailable
	}
	return s.Post(ctx, member, id)
}
func (s *Store) UpdatePost(ctx context.Context, member, id, title, body string) (Post, error) {
	if uuid.Validate(id) != nil {
		return Post{}, invalid
	}
	title, body = strings.TrimSpace(title), strings.TrimSpace(body)
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(context.Background())
	var sport, kind, status string
	err = tx.QueryRow(ctx, `SELECT sport,post_type,status FROM summergear_app.community_posts WHERE id=$1 AND author_id=$2 FOR UPDATE`, id, member).Scan(&sport, &kind, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, missing
	}
	if err != nil {
		return Post{}, unavailable
	}
	if status == "active" {
		return Post{}, conflict
	}
	if !validPost(sport, kind, title, body) {
		return Post{}, invalid
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.community_posts SET title=$2,body=$3,updated_at=clock_timestamp() WHERE id=$1`, id, title, body)
	if err != nil {
		return Post{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Post{}, unavailable
	}
	return s.Post(ctx, member, id)
}
func (s *Store) ResubmitPost(ctx context.Context, member, id string) (Post, error) {
	if uuid.Validate(id) != nil {
		return Post{}, invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(context.Background())
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM summergear_app.community_posts WHERE id=$1 AND author_id=$2 FOR UPDATE`, id, member).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, missing
	}
	if err != nil {
		return Post{}, unavailable
	}
	if status != "rejected" {
		return Post{}, conflict
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.community_posts SET status='pending_review',updated_at=clock_timestamp() WHERE id=$1`, id)
	if err != nil {
		return Post{}, unavailable
	}
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.community_review_events(post_id,actor_id,from_status,to_status)
 VALUES($1,$2,'rejected','pending_review')`, id, member)
	if err != nil {
		return Post{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Post{}, unavailable
	}
	return s.Post(ctx, member, id)
}
func (s *Store) ReviewPost(ctx context.Context, reviewer, id, decision, reason string) (Post, error) {
	if uuid.Validate(id) != nil {
		return Post{}, invalid
	}
	reason = strings.TrimSpace(reason)
	if (decision != "approve" && decision != "reject") || (decision == "reject" && (utf8.RuneCountInString(reason) < 1 || utf8.RuneCountInString(reason) > 1000)) || decision == "approve" && reason != "" {
		return Post{}, invalid
	}
	tx, err := s.memberTx(ctx, reviewer)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(context.Background())
	var allowed bool
	if tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listing_reviewers WHERE member_id=$1)`, reviewer).Scan(&allowed) != nil {
		return Post{}, unavailable
	}
	if !allowed {
		return Post{}, &Failure{403, "SOCIAL_REVIEW_FORBIDDEN", "Reviewer access required"}
	}
	var status, author string
	err = tx.QueryRow(ctx, `SELECT status,author_id::text FROM summergear_app.community_posts WHERE id=$1 FOR UPDATE`, id).Scan(&status, &author)
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, missing
	}
	if err != nil {
		return Post{}, unavailable
	}
	if status != "pending_review" {
		return Post{}, conflict
	}
	next := "rejected"
	var audit any = reason
	if decision == "approve" {
		next = "active"
		audit = nil
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.community_posts SET status=$2,
 published_at=CASE WHEN $2='active' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=$1`, id, next)
	if err != nil {
		return Post{}, unavailable
	}
	var eventID int64
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.community_review_events(post_id,actor_id,from_status,to_status,reason)
 VALUES($1,$2,'pending_review',$3,$4) RETURNING id`, id, reviewer, next, audit).Scan(&eventID)
	if err != nil {
		return Post{}, unavailable
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_events
 (event_key,member_id,actor_member_id,kind,resource_id)
 VALUES($1,$2,$3,'community_review',$4)`,
		fmt.Sprintf("community_review:%d", eventID), author, reviewer, id); err != nil {
		return Post{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Post{}, unavailable
	}
	return s.Post(ctx, reviewer, id)
}
func (s *Store) Comments(ctx context.Context, id string) ([]Comment, error) {
	if uuid.Validate(id) != nil {
		return nil, invalid
	}
	rows, err := s.Pool.Query(ctx, `SELECT c.id::text,c.post_id::text,c.author_id::text,COALESCE(m.display_name,'SummerGear 크루'),c.body,c.created_at
 FROM summergear_app.community_comments c JOIN summergear_app.members m ON m.id=c.author_id
 WHERE c.post_id=$1 ORDER BY c.created_at,c.id`, id)
	if err != nil {
		return nil, unavailable
	}
	items := []Comment{}
	for rows.Next() {
		var item Comment
		if rows.Scan(&item.ID, &item.PostID, &item.AuthorID, &item.Author, &item.Body, &item.CreatedAt) != nil {
			rows.Close()
			return nil, unavailable
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, unavailable
	}
	return items, nil
}
func (s *Store) AddComment(ctx context.Context, member, id, body string) (Comment, error) {
	if uuid.Validate(id) != nil {
		return Comment{}, invalid
	}
	body = strings.TrimSpace(body)
	if utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > 5000 {
		return Comment{}, invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return Comment{}, err
	}
	defer tx.Rollback(context.Background())
	var active bool
	err = tx.QueryRow(ctx, "SELECT true FROM summergear_app.community_posts WHERE id=$1 AND status='active'", id).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) {
		return Comment{}, missing
	}
	if err != nil {
		return Comment{}, unavailable
	}
	var item Comment
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.community_comments(post_id,author_id,body)
 VALUES($1,$2,$3) RETURNING id::text,post_id::text,author_id::text,body,created_at`, id, member, body).
		Scan(&item.ID, &item.PostID, &item.AuthorID, &item.Body, &item.CreatedAt)
	if err != nil {
		return Comment{}, unavailable
	}
	if tx.QueryRow(ctx, "SELECT COALESCE(display_name,'SummerGear 크루') FROM summergear_app.members WHERE id=$1", member).Scan(&item.Author) != nil {
		return Comment{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return Comment{}, unavailable
	}
	return item, nil
}
func (s *Store) SetLike(ctx context.Context, member, id string, liked bool) (int, error) {
	if uuid.Validate(id) != nil {
		return 0, invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(context.Background())
	var active bool
	err = tx.QueryRow(ctx, "SELECT true FROM summergear_app.community_posts WHERE id=$1 AND status='active'", id).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, missing
	}
	if err != nil {
		return 0, unavailable
	}
	if liked {
		_, err = tx.Exec(ctx, "INSERT INTO summergear_app.community_reactions(post_id,member_id) VALUES($1,$2) ON CONFLICT DO NOTHING", id, member)
	} else {
		_, err = tx.Exec(ctx, "DELETE FROM summergear_app.community_reactions WHERE post_id=$1 AND member_id=$2", id, member)
	}
	if err != nil {
		return 0, unavailable
	}
	var count int
	if tx.QueryRow(ctx, "SELECT count(*) FROM summergear_app.community_reactions WHERE post_id=$1", id).Scan(&count) != nil {
		return 0, unavailable
	}
	if tx.Commit(ctx) != nil {
		return 0, unavailable
	}
	return count, nil
}
