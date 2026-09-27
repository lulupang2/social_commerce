//go:build integration

package social

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func mustSocial(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
func TestGoSessionChatAndCommunity(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" || os.Getenv("DB_TARGET") != "fixture" || os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("disposable fixture required")
	}
	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	var apiConfig platform.Config
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, e := platform.LoadConfig(role, "")
		mustSocial(t, e)
		pool, e := platform.OpenDatabase(ctx, cfg)
		mustSocial(t, e)
		t.Cleanup(pool.Close)
		pools[role] = pool
		if role == platform.API {
			apiConfig = cfg
		}
	}
	admin, api := pools[platform.Migration], pools[platform.API]
	files, e := migrate.LoadFiles("/workspace/supabase/migrations")
	mustSocial(t, e)
	logger := platform.NewLogger(io.Discard, "error")
	status, e := migrate.Run(ctx, admin, files, true, logger)
	mustSocial(t, e)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("social schema not current")
	}
	config, e := auth.ParseConfig(func(key string) string {
		switch key {
		case "APP_ENV":
			return "test"
		case "PUBLIC_WEB_URL":
			return "https://app.example.invalid"
		case "AUTH_DEV_LOGIN_ENABLED":
			return "true"
		}
		return ""
	}, apiConfig)
	mustSocial(t, e)
	_, e = admin.Exec(ctx, `INSERT INTO summergear_app.members(id,display_name,onboarded) VALUES('00000000-0000-4000-8000-000000000015','Fixture reviewer',true) ON CONFLICT DO NOTHING`)
	mustSocial(t, e)
	_, e = admin.Exec(ctx, `INSERT INTO summergear_app.listing_reviewers(member_id) VALUES('00000000-0000-4000-8000-000000000015') ON CONFLICT DO NOTHING`)
	mustSocial(t, e)
	app := httpapi.New(logger, nil).App
	t.Cleanup(func() { _ = app.Shutdown() })
	handler := auth.Register(app, config, api, logger)
	Register(app, api, handler, logger)
	type client struct {
		cookies      []*http.Cookie
		csrf, member string
	}
	request := func(c *client, method, path string, body []byte, token bool) (int, []byte) {
		t.Helper()
		req := httptest.NewRequest(method, config.PublicURL+path, bytes.NewReader(body))
		if c != nil {
			for _, cookie := range c.cookies {
				req.AddCookie(cookie)
			}
		}
		if method != "GET" {
			req.Header.Set("Origin", config.PublicURL)
			if token && c != nil {
				req.Header.Set("X-CSRF-Token", c.csrf)
			}
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		mustSocial(t, err)
		data, err := io.ReadAll(resp.Body)
		mustSocial(t, err)
		resp.Body.Close()
		if c != nil && len(resp.Cookies()) > 0 {
			c.cookies = resp.Cookies()
		}
		return resp.StatusCode, data
	}
	login := func(role string) *client {
		c := &client{}
		code, data := request(c, "POST", auth.Prefix+"/dev-login", []byte(`{"role":"`+role+`"}`), false)
		if code != 200 {
			t.Fatalf("login %s: %d %s", role, code, data)
		}
		var v auth.SessionView
		mustSocial(t, json.Unmarshal(data, &v))
		c.csrf = v.CSRFToken
		c.member = v.Member.ID
		return c
	}
	buyer, seller, third, reviewer := login("buyer_a"), login("seller_a"), login("buyer_b"), login("reviewer")
	var listing string
	mustSocial(t, admin.QueryRow(ctx, `INSERT INTO summergear_app.listings(member_id,sport,category,title,description,price_krw,condition,status,details,location_text,published_at)
 VALUES($1,'surf','equipment','Social fixture listing','Go owned live chat listing',12000,'good','active','{"sport":"surf"}','Yangyang',clock_timestamp()) RETURNING id::text`, seller.member).Scan(&listing))
	defer func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.listings WHERE id=$1", listing)
	}()
	prefix := "/api/v1/conversations"
	if code, _ := request(nil, "POST", prefix, []byte(`{"listingId":"`+listing+`"}`), false); code != 401 {
		t.Fatalf("anonymous start: %d", code)
	}
	if code, _ := request(seller, "POST", prefix, []byte(`{"listingId":"`+listing+`"}`), true); code != 409 {
		t.Fatalf("owner started own chat: %d", code)
	}
	code, data := request(buyer, "POST", prefix, []byte(`{"listingId":"`+listing+`"}`), true)
	if code != 200 {
		t.Fatalf("start: %d %s", code, data)
	}
	var started struct {
		ConversationID string `json:"conversationId"`
	}
	mustSocial(t, json.Unmarshal(data, &started))
	defer func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.notification_events WHERE kind='chat_message' AND resource_id=$1", started.ConversationID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.messages WHERE conversation_id=$1", started.ConversationID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.conversations WHERE id=$1", started.ConversationID)
	}()
	code, data = request(buyer, "POST", prefix, []byte(`{"listingId":"`+listing+`"}`), true)
	if code != 200 || !bytes.Contains(data, []byte(started.ConversationID)) {
		t.Fatal("duplicate chat room on replay")
	}
	path := prefix + "/" + started.ConversationID
	if code, _ = request(third, "GET", path, nil, false); code != 404 {
		t.Fatalf("third-party read: %d", code)
	}
	nonce := "c0000000-0000-4000-8000-000000000099"
	payload := []byte(`{"body":"Hello seller","clientNonce":"` + nonce + `"}`)
	if code, _ = request(buyer, "POST", path+"/messages", payload, false); code != 403 {
		t.Fatalf("missing CSRF: %d", code)
	}
	if code, _ = request(third, "POST", path+"/messages", payload, true); code != 404 {
		t.Fatalf("third-party send: %d", code)
	}
	code, data = request(buyer, "POST", path+"/messages", payload, true)
	if code != 201 {
		t.Fatalf("send: %d %s", code, data)
	}
	var sent ChatMessage
	mustSocial(t, json.Unmarshal(data, &sent))
	code, data = request(buyer, "POST", path+"/messages", payload, true)
	if code != 201 {
		t.Fatalf("replayed send: %d %s", code, data)
	}
	var again ChatMessage
	mustSocial(t, json.Unmarshal(data, &again))
	if sent.ID != again.ID {
		t.Fatal("duplicate persisted on message retry")
	}
	if code, _ = request(buyer, "POST", path+"/messages", []byte(`{"body":"changed","clientNonce":"`+nonce+`"}`), true); code != 409 {
		t.Fatalf("nonce body mismatch: %d", code)
	}
	if code, _ = request(third, "POST", path+"/read", []byte(`{"throughMessageId":"`+sent.ID+`"}`), true); code != 404 {
		t.Fatalf("third-party read receipt: %d", code)
	}
	code, data = request(seller, "GET", prefix, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(`"unreadCount":1`)) {
		t.Fatalf("seller unread: %d %s", code, data)
	}
	code, data = request(seller, "GET", path, nil, false)
	if code != 200 || strings.Count(string(data), "Hello seller") != 1 {
		t.Fatalf("seller chat history: %d %s", code, data)
	}
	secondPayload := []byte(`{"body":"Second inbound","clientNonce":"c0000000-0000-4000-8000-000000000098"}`)
	code, data = request(buyer, "POST", path+"/messages", secondPayload, true)
	if code != 201 {
		t.Fatalf("second send: %d %s", code, data)
	}
	var second ChatMessage
	mustSocial(t, json.Unmarshal(data, &second))
	code, data = request(seller, "GET", path+"?limit=1", nil, false)
	var latest Conversation
	mustSocial(t, json.Unmarshal(data, &latest))
	if code != 200 || len(latest.Messages) != 1 || latest.Messages[0].ID != second.ID || !latest.HasMore || latest.BeforeCursor == nil {
		t.Fatalf("bounded latest page: %d %s", code, data)
	}
	code, data = request(seller, "GET", path+"?before="+*latest.BeforeCursor+"&limit=1", nil, false)
	var older Conversation
	mustSocial(t, json.Unmarshal(data, &older))
	if code != 200 || len(older.Messages) != 1 || older.Messages[0].ID != sent.ID || older.HasMore {
		t.Fatalf("older page duplicate/gap: %d %s", code, data)
	}
	if older.AfterCursor == nil {
		t.Fatal("older page has no forward cursor")
	}
	code, data = request(seller, "GET", path+"?after="+*older.AfterCursor+"&limit=1", nil, false)
	var newer Conversation
	mustSocial(t, json.Unmarshal(data, &newer))
	if code != 200 || len(newer.Messages) != 1 || newer.Messages[0].ID != second.ID {
		t.Fatalf("forward cursor missed new arrival: %d %s", code, data)
	}
	if code, _ = request(seller, "GET", path+"?before=invalid", nil, false); code != 400 {
		t.Fatalf("invalid cursor: %d", code)
	}
	if code, _ = request(seller, "GET", path+"?limit=101", nil, false); code != 400 {
		t.Fatalf("unbounded request: %d", code)
	}
	if code, _ = request(buyer, "POST", path+"/read", []byte(`{"throughMessageId":"`+sent.ID+`"}`), true); code != 404 {
		t.Fatalf("sender acknowledged own message: %d", code)
	}
	if code, _ = request(seller, "POST", path+"/read", []byte(`{"throughMessageId":"`+sent.ID+`"}`), true); code != 204 {
		t.Fatalf("bounded mark read: %d", code)
	}
	code, data = request(seller, "GET", prefix, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(`"unreadCount":1`)) {
		t.Fatalf("late arrival marked read: %d %s", code, data)
	}
	if code, _ = request(seller, "POST", path+"/read", []byte(`{"throughMessageId":"`+second.ID+`"}`), true); code != 204 {
		t.Fatalf("latest mark read: %d", code)
	}
	code, data = request(seller, "GET", prefix, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(`"unreadCount":0`)) {
		t.Fatalf("seller read reset: %d %s", code, data)
	}
	code, data = request(buyer, "GET", path, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(`"readAt":"`)) {
		t.Fatalf("read receipt not visible: %d %s", code, data)
	}
	postPath := "/api/v1/community/posts"
	code, data = request(buyer, "POST", postPath, []byte(`{"sport":"surf","type":"guide","title":"Social fixture post","body":"Test community moderation and comments."}`), true)
	if code != 201 {
		t.Fatalf("post create: %d %s", code, data)
	}
	var post Post
	mustSocial(t, json.Unmarshal(data, &post))
	defer func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.notification_events WHERE kind='community_review' AND resource_id=$1", post.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.community_reactions WHERE post_id=$1", post.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.community_comments WHERE post_id=$1", post.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.community_review_events WHERE post_id=$1", post.ID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.community_posts WHERE id=$1", post.ID)
	}()
	code, data = request(nil, "GET", postPath, nil, false)
	if code != 200 || bytes.Contains(data, []byte(post.ID)) {
		t.Fatalf("pending leaked publicly: %d %s", code, data)
	}
	if code, _ = request(third, "GET", postPath+"/"+post.ID, nil, false); code != 404 {
		t.Fatalf("other member saw pending: %d", code)
	}
	if code, _ = request(third, "PATCH", postPath+"/"+post.ID, []byte(`{"title":"Illegal edit","body":"Other member cannot edit this post."}`), true); code != 404 {
		t.Fatalf("other member edited post: %d", code)
	}
	if code, _ = request(buyer, "POST", postPath+"/"+post.ID+"/comments", []byte(`{"body":"premature"}`), true); code != 404 {
		t.Fatalf("pending post accepted comment: %d", code)
	}
	reviewPath := "/api/v1/community/reviews"
	if code, _ = request(seller, "POST", reviewPath+"/"+post.ID+"/approve", nil, true); code != 403 {
		t.Fatalf("ordinary seller approved: %d", code)
	}
	code, data = request(reviewer, "GET", reviewPath, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(post.ID)) {
		t.Fatalf("community review queue: %d %s", code, data)
	}
	code, data = request(reviewer, "POST", reviewPath+"/"+post.ID+"/reject", []byte(`{"reason":"더 구체적인 사용기를 작성해 주세요"}`), true)
	if code != 200 {
		t.Fatalf("post reject: %d %s", code, data)
	}
	code, data = request(buyer, "GET", "/api/v1/me/posts", nil, false)
	if code != 200 || !bytes.Contains(data, []byte("더 구체적인")) {
		t.Fatalf("owner reason not visible: %d %s", code, data)
	}
	if code, data = request(buyer, "PATCH", postPath+"/"+post.ID, []byte(`{"title":"Updated social fixture post","body":"A sufficiently detailed surfing equipment review."}`), true); code != 200 {
		t.Fatalf("owner revision: %d %s", code, data)
	}
	if code, data = request(buyer, "POST", postPath+"/"+post.ID+"/resubmit", nil, true); code != 200 {
		t.Fatalf("owner resubmit: %d %s", code, data)
	}
	if code, data = request(reviewer, "POST", reviewPath+"/"+post.ID+"/approve", nil, true); code != 200 {
		t.Fatalf("post approval: %d %s", code, data)
	}
	if code, _ = request(buyer, "PATCH", postPath+"/"+post.ID, []byte(`{"title":"Unsafe live edit","body":"Should fail while post is live."}`), true); code != 409 {
		t.Fatalf("active post edited: %d", code)
	}
	code, data = request(nil, "GET", postPath, nil, false)
	if code != 200 || !bytes.Contains(data, []byte(post.ID)) {
		t.Fatalf("approved post not public: %d %s", code, data)
	}
	code, data = request(seller, "POST", postPath+"/"+post.ID+"/comments", []byte(`{"body":"Great post"}`), true)
	if code != 201 {
		t.Fatalf("comment failed: %d %s", code, data)
	}
	code, data = request(nil, "GET", postPath+"/"+post.ID+"/comments", nil, false)
	if code != 200 || !bytes.Contains(data, []byte("Great post")) {
		t.Fatalf("comment not durable: %d %s", code, data)
	}
	for range 2 {
		code, data = request(seller, "PUT", postPath+"/"+post.ID+"/like", nil, true)
		if code != 200 || !bytes.Contains(data, []byte(`"likes":1`)) {
			t.Fatalf("duplicate reaction: %d %s", code, data)
		}
	}
	if code, data = request(seller, "DELETE", postPath+"/"+post.ID+"/like", nil, true); code != 200 || !bytes.Contains(data, []byte(`"likes":0`)) {
		t.Fatalf("reaction removal: %d %s", code, data)
	}
}
