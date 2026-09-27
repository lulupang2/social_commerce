package social

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ Pool *pgxpool.Pool }
type Failure struct {
	Status        int
	Code, Message string
}

func (e *Failure) Error() string { return e.Code }

var invalid = &Failure{400, "SOCIAL_INVALID_REQUEST", "Invalid social request"}
var missing = &Failure{404, "SOCIAL_NOT_FOUND", "Resource unavailable to this member"}
var conflict = &Failure{409, "SOCIAL_CONFLICT", "Social resource state changed"}
var unavailable = &Failure{503, "SOCIAL_UNAVAILABLE", "Social database unavailable"}

type ChatMessage struct {
	ID             string     `json:"id"`
	ConversationID string     `json:"conversationId"`
	SenderID       string     `json:"senderId"`
	Body           string     `json:"body"`
	ReadAt         *time.Time `json:"readAt"`
	CreatedAt      time.Time  `json:"createdAt"`
}
type ListingSummary struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Price int64  `json:"price"`
}
type Conversation struct {
	ID            string          `json:"id"`
	CurrentUserID string          `json:"currentUserId"`
	OtherUserName string          `json:"otherUserName"`
	Listing       *ListingSummary `json:"listing"`
	Messages      []ChatMessage   `json:"messages"`
	BeforeCursor  *string         `json:"beforeCursor"`
	AfterCursor   *string         `json:"afterCursor"`
	HasMore       bool            `json:"hasMore"`
}
type ConversationSummary struct {
	ID              string     `json:"id"`
	ListingID       string     `json:"listingId"`
	ListingTitle    string     `json:"listingTitle"`
	ListingPrice    *int64     `json:"listingPrice"`
	OtherUserName   string     `json:"otherUserName"`
	LastMessage     string     `json:"lastMessage"`
	LastMessageTime *time.Time `json:"lastMessageTime"`
	UnreadCount     int        `json:"unreadCount"`
}

func (s *Store) memberTx(ctx context.Context, member string) (pgx.Tx, error) {
	if uuid.Validate(member) != nil {
		return nil, invalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, unavailable
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", member); err != nil {
		tx.Rollback(context.Background())
		return nil, unavailable
	}
	return tx, nil
}
func (s *Store) StartConversation(ctx context.Context, buyer, listing string) (string, error) {
	if uuid.Validate(listing) != nil {
		return "", invalid
	}
	tx, err := s.memberTx(ctx, buyer)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	var seller string
	err = tx.QueryRow(ctx, "SELECT member_id::text FROM summergear_app.listings WHERE id=$1 AND status='active'", listing).Scan(&seller)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", missing
	}
	if err != nil {
		return "", unavailable
	}
	if buyer == seller {
		return "", conflict
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.conversations(listing_id,buyer_id,seller_id) VALUES($1,$2,$3)
 ON CONFLICT(listing_id,buyer_id) DO NOTHING RETURNING id::text`, listing, buyer, seller).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id::text FROM summergear_app.conversations WHERE listing_id=$1 AND buyer_id=$2`, listing, buyer).Scan(&id)
	}
	if err != nil {
		return "", unavailable
	}
	if tx.Commit(ctx) != nil {
		return "", unavailable
	}
	return id, nil
}
func (s *Store) ListConversations(ctx context.Context, member string) ([]ConversationSummary, error) {
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT c.id::text,c.listing_id::text,
 COALESCE(l.title,'종료된 거래'),l.price_krw,
 COALESCE(other.display_name,'거래 상대'),COALESCE(last.body,'대화를 시작해 보세요.'),last.created_at,
 (SELECT count(*) FROM summergear_app.messages unread WHERE unread.conversation_id=c.id
  AND unread.sender_id<>$1 AND unread.read_at IS NULL)::int
 FROM summergear_app.conversations c
 LEFT JOIN summergear_app.listings l ON l.id=c.listing_id
 JOIN summergear_app.members other ON other.id=CASE WHEN c.buyer_id=$1 THEN c.seller_id ELSE c.buyer_id END
 LEFT JOIN LATERAL(SELECT body,created_at FROM summergear_app.messages m WHERE m.conversation_id=c.id
  ORDER BY created_at DESC,id DESC LIMIT 1) last ON true
 WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY COALESCE(last.created_at,c.created_at) DESC,c.id DESC`, member)
	if err != nil {
		return nil, unavailable
	}
	items := []ConversationSummary{}
	for rows.Next() {
		var item ConversationSummary
		if rows.Scan(&item.ID, &item.ListingID, &item.ListingTitle, &item.ListingPrice, &item.OtherUserName, &item.LastMessage, &item.LastMessageTime, &item.UnreadCount) != nil {
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
	if tx.Commit(ctx) != nil {
		return nil, unavailable
	}
	return items, nil
}

// The cursor contains the ordering tuple, not a row offset: inserts cannot
// displace an already loaded page. Limit is bounded by the HTTP handler.
func (s *Store) Conversation(ctx context.Context, member, id, before, after string, limit int) (Conversation, error) {
	if uuid.Validate(id) != nil || (before != "" && after != "") || limit < 1 || limit > 100 {
		return Conversation{}, invalid
	}
	cursor := before
	if after != "" {
		cursor = after
	}
	var at time.Time
	var cursorID string
	if cursor != "" {
		var err error
		at, cursorID, err = decodeChatCursor(cursor)
		if err != nil {
			return Conversation{}, invalid
		}
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return Conversation{}, err
	}
	defer tx.Rollback(context.Background())
	var title *string
	var price *int64
	var listingID string
	var other string
	err = tx.QueryRow(ctx, `SELECT c.listing_id::text,l.title,l.price_krw,COALESCE(m.display_name,'거래 상대')
 FROM summergear_app.conversations c LEFT JOIN summergear_app.listings l ON l.id=c.listing_id
 JOIN summergear_app.members m ON m.id=CASE WHEN c.buyer_id=$2 THEN c.seller_id ELSE c.buyer_id END
 WHERE c.id=$1 AND (c.buyer_id=$2 OR c.seller_id=$2)`, id, member).Scan(&listingID, &title, &price, &other)
	if errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, missing
	}
	if err != nil {
		return Conversation{}, unavailable
	}
	result := Conversation{ID: id, CurrentUserID: member, OtherUserName: other, Messages: []ChatMessage{}}
	if title != nil && price != nil {
		result.Listing = &ListingSummary{listingID, *title, *price}
	}
	// The LIMIT + 1 sentinel is never exposed as a message/read boundary.
	direction := "DESC"
	comparison := "<"
	if after != "" {
		direction = "ASC"
		comparison = ">"
	}
	query := fmt.Sprintf(`SELECT id::text,conversation_id::text,sender_id::text,body,read_at,created_at
 FROM summergear_app.messages WHERE conversation_id=$1
 AND ($2::timestamptz IS NULL OR (created_at,id) %s ($2::timestamptz,$3::uuid))
 ORDER BY created_at %s,id %s LIMIT $4`, comparison, direction, direction)
	var point any
	var pointID any
	if cursor != "" {
		point, pointID = at, cursorID
	}
	rows, err := tx.Query(ctx, query, id, point, pointID, limit+1)
	if err != nil {
		return Conversation{}, unavailable
	}
	for rows.Next() {
		var m ChatMessage
		if rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.ReadAt, &m.CreatedAt) != nil {
			rows.Close()
			return Conversation{}, unavailable
		}
		result.Messages = append(result.Messages, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Conversation{}, unavailable
	}
	if len(result.Messages) > limit {
		result.HasMore = true
		result.Messages = result.Messages[:limit]
	}
	if after == "" {
		for i, j := 0, len(result.Messages)-1; i < j; i, j = i+1, j-1 {
			result.Messages[i], result.Messages[j] = result.Messages[j], result.Messages[i]
		}
	}
	if len(result.Messages) != 0 {
		first, last := result.Messages[0], result.Messages[len(result.Messages)-1]
		older, newer := chatCursor(first), chatCursor(last)
		result.BeforeCursor, result.AfterCursor = &older, &newer
	}
	if tx.Commit(ctx) != nil {
		return Conversation{}, unavailable
	}
	return result, nil
}

func chatCursor(message ChatMessage) string {
	return base64.RawURLEncoding.EncodeToString([]byte(message.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + message.ID))
}

func decodeChatCursor(cursor string) (time.Time, string, error) {
	if len(cursor) > 128 {
		return time.Time{}, "", invalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 || uuid.Validate(parts[1]) != nil {
		return time.Time{}, "", invalid
	}
	at, err := time.Parse(time.RFC3339Nano, parts[0])
	return at, parts[1], err
}
func (s *Store) SendMessage(ctx context.Context, member, id, nonce, body string) (ChatMessage, error) {
	if uuid.Validate(id) != nil || uuid.Validate(nonce) != nil {
		return ChatMessage{}, invalid
	}
	body = strings.TrimSpace(body)
	if utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > 5000 {
		return ChatMessage{}, invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return ChatMessage{}, err
	}
	defer tx.Rollback(context.Background())
	var permitted bool
	err = tx.QueryRow(ctx, `SELECT true FROM summergear_app.conversations c WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2) FOR UPDATE`, id, member).Scan(&permitted)
	if errors.Is(err, pgx.ErrNoRows) {
		return ChatMessage{}, missing
	}
	if err != nil {
		return ChatMessage{}, unavailable
	}
	row := tx.QueryRow(ctx, `SELECT id::text,conversation_id::text,sender_id::text,body,read_at,created_at FROM summergear_app.messages
 WHERE conversation_id=$1 AND sender_id=$2 AND client_nonce=$3`, id, member, nonce)
	var m ChatMessage
	err = row.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.ReadAt, &m.CreatedAt)
	if err == nil {
		if m.Body != body {
			return ChatMessage{}, conflict
		}
		if tx.Commit(ctx) != nil {
			return ChatMessage{}, unavailable
		}
		return m, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ChatMessage{}, unavailable
	}
	err = tx.QueryRow(ctx, `INSERT INTO summergear_app.messages(conversation_id,sender_id,client_nonce,body)
 VALUES($1,$2,$3,$4) RETURNING id::text,conversation_id::text,sender_id::text,body,read_at,created_at`, id, member, nonce, body).
		Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.ReadAt, &m.CreatedAt)
	if err != nil {
		return ChatMessage{}, unavailable
	}
	_, err = tx.Exec(ctx, "UPDATE summergear_app.conversations SET updated_at=clock_timestamp() WHERE id=$1", id)
	if err != nil {
		return ChatMessage{}, unavailable
	}
	var recipient string
	if err = tx.QueryRow(ctx, `SELECT (CASE WHEN buyer_id=$2 THEN seller_id ELSE buyer_id END)::text
 FROM summergear_app.conversations WHERE id=$1`, id, member).Scan(&recipient); err != nil {
		return ChatMessage{}, unavailable
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.notification_events
 (event_key,member_id,actor_member_id,kind,resource_id)
 VALUES('chat:'||$1::text,$2,$3,'chat_message',$4)`,
		m.ID, recipient, member, id); err != nil {
		return ChatMessage{}, unavailable
	}
	if tx.Commit(ctx) != nil {
		return ChatMessage{}, unavailable
	}
	return m, nil
}

// The client acknowledges an inbound message it actually rendered. A late
// arrival has a greater ordering tuple and remains unread.
func (s *Store) MarkRead(ctx context.Context, member, id, throughID string) error {
	if uuid.Validate(id) != nil || uuid.Validate(throughID) != nil {
		return invalid
	}
	tx, err := s.memberTx(ctx, member)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var exists bool
	err = tx.QueryRow(ctx, `SELECT true FROM summergear_app.conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)`, id, member).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return missing
	}
	if err != nil {
		return unavailable
	}
	var at time.Time
	err = tx.QueryRow(ctx, `SELECT created_at FROM summergear_app.messages
 WHERE id=$1 AND conversation_id=$2 AND sender_id<>$3`, throughID, id, member).Scan(&at)
	if errors.Is(err, pgx.ErrNoRows) {
		return missing
	}
	if err != nil {
		return unavailable
	}
	_, err = tx.Exec(ctx, `UPDATE summergear_app.messages SET read_at=clock_timestamp()
 WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL
 AND (created_at,id)<=($3,$4::uuid)`, id, member, at, throughID)
	if err != nil {
		return unavailable
	}
	if tx.Commit(ctx) != nil {
		return unavailable
	}
	return nil
}
