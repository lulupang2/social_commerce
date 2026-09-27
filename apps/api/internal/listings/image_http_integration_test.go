//go:build integration

package listings

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestListingImageHTTPAuthOwnershipLifecycleAndSignedResponses(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" ||
		os.Getenv("DB_TARGET") != "fixture" ||
		os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("listing image HTTP integration requires the explicit isolated fixture")
	}

	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	configs := map[platform.Role]platform.Config{}
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		must(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		must(t, err)
		configs[role], pools[role] = cfg, pool
		t.Cleanup(pool.Close)
	}
	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	must(t, err)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	status, err := migrate.Run(ctx, pools[platform.Migration], files, true, logger)
	must(t, err)
	if !status.Ready || status.AppVersion != migrate.PushReceiptsVersion {
		t.Fatal("listing image migration is not current")
	}

	values := map[string]string{
		"APP_ENV":                "test",
		"PUBLIC_WEB_URL":         "https://app.example.invalid",
		"AUTH_DEV_LOGIN_ENABLED": "true",
	}
	authConfig, err := auth.ParseConfig(func(key string) string { return values[key] }, configs[platform.API])
	must(t, err)

	storageFixture := newListingImageStorageFixture(t)
	storage, err := listingimages.NewHTTPStorage(storageFixture.server.URL, storageFixture.key, storageFixture.server.Client())
	must(t, err)

	listingStore := &Store{Pool: pools[platform.API]}
	imageStore := &listingimages.Store{Pool: pools[platform.API]}
	app := httpapi.New(logger, func(c context.Context) error {
		if err := (&auth.Store{Pool: pools[platform.API], Config: authConfig}).Ready(c); err != nil {
			return err
		}
		if err := listingStore.Ready(c); err != nil {
			return err
		}
		return imageStore.Ready(c)
	}).App
	t.Cleanup(func() { _ = app.Shutdown() })
	authHandler := auth.Register(app, authConfig, pools[platform.API], logger)
	imageHandler := listingimages.Register(app, pools[platform.API], authHandler, storage, logger)
	Register(app, pools[platform.API], authHandler, imageHandler.Service, logger)

	ownerClient := &listingHTTPClient{cookies: map[string]string{}}
	request := func(client *listingHTTPClient, method, path string, body []byte, headers map[string]string) (*http.Response, []byte) {
		t.Helper()
		req := httptest.NewRequest(method, authConfig.PublicURL+path, bytes.NewReader(body))
		if client != nil {
			for name, value := range client.cookies {
				req.AddCookie(&http.Cookie{Name: name, Value: value})
			}
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		for name, value := range headers {
			req.Header.Set(name, value)
		}
		resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
		must(t, err)
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		must(t, err)
		if client != nil {
			for _, cookie := range resp.Cookies() {
				if cookie.MaxAge < 0 {
					delete(client.cookies, cookie.Name)
				} else {
					client.cookies[cookie.Name] = cookie.Value
				}
			}
		}
		return resp, data
	}

	resp, data := request(ownerClient, http.MethodPost, auth.Prefix+"/dev-login", nil,
		map[string]string{"Origin": authConfig.PublicURL})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dev login returned %d: %s", resp.StatusCode, data)
	}
	var ownerSession auth.SessionView
	must(t, json.Unmarshal(data, &ownerSession))
	ownerMutation := map[string]string{
		"Origin":       authConfig.PublicURL,
		"X-CSRF-Token": ownerSession.CSRFToken,
	}

	createBody, err := json.Marshal(map[string]any{
		"sport":       "surf",
		"category":    "equipment",
		"title":       "Image HTTP integration listing",
		"description": "HTTP auth, image ownership, and signed listing response integration test.",
		"priceKrw":    250000,
		"condition":   "good",
		"location":    "fixture",
		"details": map[string]any{
			"sport":         "surf",
			"equipmentType": "surfboard",
		},
	})
	must(t, err)
	resp, data = request(ownerClient, http.MethodPost, Prefix, createBody, ownerMutation)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("listing create returned %d: %s", resp.StatusCode, data)
	}
	var created Listing
	must(t, json.Unmarshal(data, &created))
	t.Cleanup(func() {
		_, _ = pools[platform.Migration].Exec(context.Background(),
			"DELETE FROM summergear_app.listings WHERE id=$1", created.ID)
	})
	if created.Seller.ID != ownerSession.Member.ID || created.Images == nil || len(created.Images) != 0 {
		t.Fatal("listing create did not return the owner with images=[]")
	}

	jpegBytes := listingHTTPJPEG(t, 64, 48)
	uploadBody := func(sortOrder *int, replaceID *string, alt string) []byte {
		t.Helper()
		body := map[string]any{
			"mimeType":      "image/jpeg",
			"fileSizeBytes": len(jpegBytes),
		}
		if sortOrder != nil {
			body["sortOrder"] = *sortOrder
		}
		if replaceID != nil {
			body["replaceImageId"] = *replaceID
		}
		if alt != "" {
			body["altText"] = alt
		}
		encoded, err := json.Marshal(body)
		must(t, err)
		return encoded
	}
	order0 := 0
	uploadPath := Prefix + "/" + created.ID + "/images/uploads"

	assertFailureCode := func(resp *http.Response, data []byte, wantStatus int, wantCode string) {
		t.Helper()
		var body map[string]any
		_ = json.Unmarshal(data, &body)
		if resp.StatusCode != wantStatus || body["code"] != wantCode {
			t.Fatalf("got status=%d code=%v body=%s want status=%d code=%s",
				resp.StatusCode, body["code"], data, wantStatus, wantCode)
		}
	}

	resp, data = request(ownerClient, http.MethodPost, uploadPath, uploadBody(&order0, nil, "board"), nil)
	assertFailureCode(resp, data, http.StatusForbidden, "ORIGIN_INVALID")
	resp, data = request(ownerClient, http.MethodPost, uploadPath, uploadBody(&order0, nil, "board"),
		map[string]string{"Origin": authConfig.PublicURL})
	assertFailureCode(resp, data, http.StatusForbidden, "CSRF_INVALID")
	resp, data = request(ownerClient, http.MethodPost, uploadPath, uploadBody(&order0, nil, "board"),
		map[string]string{"Origin": "https://other.invalid", "X-CSRF-Token": ownerSession.CSRFToken})
	assertFailureCode(resp, data, http.StatusForbidden, "ORIGIN_INVALID")
	resp, data = request(nil, http.MethodPost, uploadPath, uploadBody(&order0, nil, "board"), ownerMutation)
	assertFailureCode(resp, data, http.StatusUnauthorized, "UNAUTHENTICATED")

	startUpload := func(body []byte) listingimages.UploadSlot {
		t.Helper()
		resp, data := request(ownerClient, http.MethodPost, uploadPath, body, ownerMutation)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("start upload returned %d: %s", resp.StatusCode, data)
		}
		var slot listingimages.UploadSlot
		must(t, json.Unmarshal(data, &slot))
		if slot.ImageID == "" || !strings.Contains(slot.UploadURL, "token=upload") {
			t.Fatalf("invalid upload slot: %#v", slot)
		}
		return slot
	}
	putObject := func(slot listingimages.UploadSlot, body []byte) {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, http.MethodPut, slot.UploadURL, bytes.NewReader(body))
		must(t, err)
		req.Header.Set("Content-Type", "image/jpeg")
		resp, err := storageFixture.server.Client().Do(req)
		must(t, err)
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("signed PUT returned %d", resp.StatusCode)
		}
	}
	complete := func(imageID string) (*http.Response, []byte) {
		return request(ownerClient, http.MethodPost,
			Prefix+"/"+created.ID+"/images/"+imageID+"/complete", nil, ownerMutation)
	}
	deleteImage := func(imageID string) (*http.Response, []byte) {
		return request(ownerClient, http.MethodDelete,
			Prefix+"/"+created.ID+"/images/"+imageID, nil, ownerMutation)
	}
	getImages := func(client *listingHTTPClient) (*http.Response, []byte) {
		return request(client, http.MethodGet, Prefix+"/"+created.ID+"/images", nil, nil)
	}

	firstSlot := startUpload(uploadBody(&order0, nil, "board"))
	putObject(firstSlot, jpegBytes)
	resp, data = complete(firstSlot.ImageID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("complete returned %d: %s", resp.StatusCode, data)
	}
	var completeResult listingimages.CompleteResult
	must(t, json.Unmarshal(data, &completeResult))
	if completeResult.ImageID != firstSlot.ImageID || completeResult.State != listingimages.ReadyState {
		t.Fatalf("invalid complete result: %#v", completeResult)
	}

	// Complete is deliberately pending-only. A lost response is recovered by GET /images.
	resp, data = complete(firstSlot.ImageID)
	assertFailureCode(resp, data, http.StatusNotFound, "IMAGE_NOT_FOUND")
	resp, data = getImages(ownerClient)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(firstSlot.ImageID)) {
		t.Fatalf("GET /images did not recover completed state: %d %s", resp.StatusCode, data)
	}

	// A malformed replacement is quarantined while the previous ready image remains visible.
	badReplacement := startUpload(uploadBody(nil, &firstSlot.ImageID, "bad replacement"))
	truncated := jpegBytes[:len(jpegBytes)/2]
	// Signed upload length must match the slot contract, so pad the truncated structure.
	badBytes := append([]byte(nil), truncated...)
	for len(badBytes) < len(jpegBytes) {
		badBytes = append(badBytes, 0)
	}
	putObject(badReplacement, badBytes)
	resp, data = complete(badReplacement.ImageID)
	assertFailureCode(resp, data, http.StatusBadRequest, "IMAGE_INVALID")
	resp, data = getImages(ownerClient)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(firstSlot.ImageID)) ||
		bytes.Contains(data, []byte(badReplacement.ImageID)) {
		t.Fatalf("failed replacement did not preserve old image: %d %s", resp.StatusCode, data)
	}
	resp, data = deleteImage(badReplacement.ImageID)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("failed replacement cleanup returned %d: %s", resp.StatusCode, data)
	}

	// Create a second real member/session and verify private reads and mutations are blocked.
	otherClient, otherCSRF, otherMember := createListingHTTPMemberSession(t, ctx, pools[platform.Migration], authConfig)
	resp, data = getImages(otherClient)
	assertFailureCode(resp, data, http.StatusNotFound, "IMAGE_NOT_FOUND")
	otherMutation := map[string]string{"Origin": authConfig.PublicURL, "X-CSRF-Token": otherCSRF}
	resp, data = request(otherClient, http.MethodPost, uploadPath, uploadBody(nil, &firstSlot.ImageID, "other"), otherMutation)
	assertFailureCode(resp, data, http.StatusNotFound, "IMAGE_NOT_FOUND")
	resp, data = request(otherClient, http.MethodDelete,
		Prefix+"/"+created.ID+"/images/"+firstSlot.ImageID, nil, otherMutation)
	assertFailureCode(resp, data, http.StatusNotFound, "IMAGE_NOT_FOUND")
	if otherMember == ownerSession.Member.ID {
		t.Fatal("other session unexpectedly belongs to owner")
	}

	// Successful replacement swaps atomically and removes the previous object afterwards.
	replacementSlot := startUpload(uploadBody(nil, &firstSlot.ImageID, "replacement"))
	putObject(replacementSlot, jpegBytes)
	resp, data = complete(replacementSlot.ImageID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("replacement complete returned %d: %s", resp.StatusCode, data)
	}
	resp, data = getImages(ownerClient)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(replacementSlot.ImageID)) ||
		bytes.Contains(data, []byte(firstSlot.ImageID)) {
		t.Fatalf("replacement visibility is inconsistent: %d %s", resp.StatusCode, data)
	}
	if storageFixture.hasObject(storagePath(ownerSession.Member.ID, created.ID, firstSlot.ImageID)) {
		t.Fatal("old replacement object was not deleted after DB swap")
	}

	// Normal delete is idempotently safe at the Storage boundary and removes metadata.
	resp, data = deleteImage(replacementSlot.ImageID)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete returned %d: %s", resp.StatusCode, data)
	}
	resp, data = getImages(ownerClient)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(`"images":[]`)) {
		t.Fatalf("delete did not leave images=[]: %d %s", resp.StatusCode, data)
	}

	finalSlot := startUpload(uploadBody(&order0, nil, "final"))
	putObject(finalSlot, jpegBytes)
	resp, data = complete(finalSlot.ImageID)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("final complete returned %d: %s", resp.StatusCode, data)
	}

	// Owner can read a private listing and receives the same signed image shape as /images.
	resp, imageData := getImages(ownerClient)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("owner image read returned %d: %s", resp.StatusCode, imageData)
	}
	var imageEnvelope struct {
		ListingID string                      `json:"listingId"`
		Images    []listingimages.SignedImage `json:"images"`
	}
	must(t, json.Unmarshal(imageData, &imageEnvelope))
	if len(imageEnvelope.Images) != 1 {
		t.Fatalf("unexpected image envelope: %s", imageData)
	}
	wantImage := imageEnvelope.Images[0]

	resp, data = request(ownerClient, http.MethodGet, Prefix+"/"+created.ID, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("owner detail returned %d: %s", resp.StatusCode, data)
	}
	var ownerDetail Listing
	must(t, json.Unmarshal(data, &ownerDetail))
	assertSameSignedImage(t, wantImage, ownerDetail.Images)

	resp, data = request(nil, http.MethodGet, Prefix+"/"+created.ID, nil, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("private listing was anonymously visible: %d %s", resp.StatusCode, data)
	}

	_, err = pools[platform.Migration].Exec(ctx, `INSERT INTO summergear_app.members(id,display_name,onboarded)
		VALUES('00000000-0000-4000-8000-000000000015','Fixture reviewer',true) ON CONFLICT(id) DO NOTHING`)
	must(t, err)
	_, err = pools[platform.Migration].Exec(ctx, `INSERT INTO summergear_app.listing_reviewers(member_id)
		VALUES('00000000-0000-4000-8000-000000000015') ON CONFLICT DO NOTHING`)
	must(t, err)
	t.Cleanup(func() {
		_, _ = pools[platform.Migration].Exec(context.Background(),
			"DELETE FROM summergear_app.notification_events WHERE kind='listing_review' AND resource_id=$1", created.ID)
		_, _ = pools[platform.Migration].Exec(context.Background(),
			"DELETE FROM summergear_app.listing_review_events WHERE listing_id=$1", created.ID)
	})
	reviewerClient := &listingHTTPClient{cookies: map[string]string{}}
	resp, data = request(reviewerClient, http.MethodPost, auth.Prefix+"/dev-login",
		[]byte(`{"role":"reviewer"}`), map[string]string{"Origin": authConfig.PublicURL})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reviewer login returned %d: %s", resp.StatusCode, data)
	}
	var reviewerSession auth.SessionView
	must(t, json.Unmarshal(data, &reviewerSession))
	resp, data = request(reviewerClient, http.MethodGet, "/api/v1/reviews", nil, nil)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(finalSlot.ImageID)) {
		t.Fatalf("review queue did not include signed image: %d %s", resp.StatusCode, data)
	}
	resp, data = request(reviewerClient, http.MethodPost, "/api/v1/reviews/"+created.ID+"/approve",
		nil, map[string]string{"Origin": authConfig.PublicURL, "X-CSRF-Token": reviewerSession.CSRFToken})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("image listing approval returned %d: %s", resp.StatusCode, data)
	}

	resp, data = request(otherClient, http.MethodGet, Prefix+"/"+created.ID+"/images", nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("active image read for another member returned %d: %s", resp.StatusCode, data)
	}
	var otherEnvelope struct {
		Images []listingimages.SignedImage `json:"images"`
	}
	must(t, json.Unmarshal(data, &otherEnvelope))
	assertSameSignedImage(t, wantImage, otherEnvelope.Images)

	resp, data = request(nil, http.MethodGet, Prefix+"/"+created.ID, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("public detail returned %d: %s", resp.StatusCode, data)
	}
	var publicDetail Listing
	must(t, json.Unmarshal(data, &publicDetail))
	assertSameSignedImage(t, wantImage, publicDetail.Images)

	resp, data = request(nil, http.MethodGet, Prefix, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("public list returned %d: %s", resp.StatusCode, data)
	}
	var listEnvelope struct {
		Items []Listing `json:"items"`
	}
	must(t, json.Unmarshal(data, &listEnvelope))
	found := false
	for _, item := range listEnvelope.Items {
		if item.ID == created.ID {
			found = true
			assertSameSignedImage(t, wantImage, item.Images)
			break
		}
	}
	if !found {
		t.Fatal("active listing missing from public list")
	}

	resp, data = request(ownerClient, http.MethodDelete,
		Prefix+"/"+created.ID+"/images/"+finalSlot.ImageID, nil, ownerMutation)
	assertFailureCode(resp, data, http.StatusNotFound, "IMAGE_NOT_FOUND")
}

type listingHTTPClient struct {
	cookies map[string]string
}

type listingImageStorageFixture struct {
	key     string
	server  *httptest.Server
	mu      sync.Mutex
	objects map[string]listingFixtureObject
}

type listingFixtureObject struct {
	data     []byte
	mimeType string
}

func newListingImageStorageFixture(t *testing.T) *listingImageStorageFixture {
	t.Helper()
	fixture := &listingImageStorageFixture{
		key:     "fixture-service-role-key",
		objects: map[string]listingFixtureObject{},
	}
	fixture.server = httptest.NewServer(http.HandlerFunc(fixture.serveHTTP))
	t.Cleanup(fixture.server.Close)
	return fixture
}

func (f *listingImageStorageFixture) serveHTTP(w http.ResponseWriter, r *http.Request) {
	const prefix = "/storage/v1/"
	serverSide := r.Method != http.MethodPut
	if serverSide && (r.Header.Get("Authorization") != "Bearer "+f.key || r.Header.Get("apikey") != f.key) {
		http.Error(w, "missing service credentials", http.StatusUnauthorized)
		return
	}
	switch {
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, prefix+"object/upload/sign/listing-images/"):
		path := strings.TrimPrefix(r.URL.Path, prefix+"object/upload/sign/listing-images/")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"url": prefix + "object/upload/sign/listing-images/" + path + "?token=upload",
		})
	case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, prefix+"object/upload/sign/listing-images/"):
		if r.URL.Query().Get("token") != "upload" {
			http.Error(w, "invalid upload token", http.StatusForbidden)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, prefix+"object/upload/sign/listing-images/")
		data, err := io.ReadAll(io.LimitReader(r.Body, listingimages.MaxFileSizeBytes+1))
		if err != nil || int64(len(data)) > listingimages.MaxFileSizeBytes {
			http.Error(w, "invalid upload", http.StatusBadRequest)
			return
		}
		mimeType := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
		f.mu.Lock()
		f.objects[path] = listingFixtureObject{data: append([]byte(nil), data...), mimeType: mimeType}
		f.mu.Unlock()
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, prefix+"object/info/listing-images/"):
		path := strings.TrimPrefix(r.URL.Path, prefix+"object/info/listing-images/")
		object, ok := f.getObject(path)
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"metadata": map[string]any{
			"size": len(object.data), "mimetype": object.mimeType, "contentLength": len(object.data),
		}})
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, prefix+"object/listing-images/"):
		path := strings.TrimPrefix(r.URL.Path, prefix+"object/listing-images/")
		object, ok := f.getObject(path)
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", object.mimeType)
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(object.data)))
		_, _ = w.Write(object.data)
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, prefix+"object/sign/listing-images/"):
		path := strings.TrimPrefix(r.URL.Path, prefix+"object/sign/listing-images/")
		if _, ok := f.getObject(path); !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"signedURL": prefix + "object/sign/listing-images/" + path + "?token=read",
		})
	case r.Method == http.MethodDelete && r.URL.Path == prefix+"object/listing-images":
		var body struct {
			Prefixes []string `json:"prefixes"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			http.Error(w, "invalid delete", http.StatusBadRequest)
			return
		}
		f.mu.Lock()
		for _, path := range body.Prefixes {
			delete(f.objects, path)
		}
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("[]"))
	default:
		http.NotFound(w, r)
	}
}

func (f *listingImageStorageFixture) getObject(path string) (listingFixtureObject, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	object, ok := f.objects[path]
	if ok {
		object.data = append([]byte(nil), object.data...)
	}
	return object, ok
}

func (f *listingImageStorageFixture) hasObject(path string) bool {
	_, ok := f.getObject(path)
	return ok
}

func storagePath(memberID, listingID, imageID string) string {
	return memberID + "/" + listingID + "/" + imageID
}

func listingHTTPJPEG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 90, A: 255})
		}
	}
	var out bytes.Buffer
	must(t, jpeg.Encode(&out, img, &jpeg.Options{Quality: 80}))
	return out.Bytes()
}

func createListingHTTPMemberSession(
	t *testing.T,
	ctx context.Context,
	admin *pgxpool.Pool,
	cfg auth.Config,
) (*listingHTTPClient, string, string) {
	t.Helper()
	var memberID string
	must(t, admin.QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name,onboarded) VALUES('other-image-member',true) RETURNING id::text").Scan(&memberID))

	raw := make([]byte, 32)
	for i := range raw {
		raw[i] = byte(i + 1)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])
	csrfHash := sha256.Sum256([]byte("summergear-csrf-v1:" + token))
	csrf := base64.RawURLEncoding.EncodeToString(csrfHash[:])
	now := time.Now().UTC()
	_, err := admin.Exec(ctx, `INSERT INTO summergear_app.auth_sessions
		(token_hash,member_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,reauthenticated_at)
		VALUES($1,$2,$3,$3,$4,$5,$3)`,
		tokenHash, memberID, now, now.Add(30*time.Minute), now.Add(7*24*time.Hour))
	must(t, err)
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.auth_sessions WHERE member_id=$1", memberID)
		_, _ = admin.Exec(context.Background(), "DELETE FROM summergear_app.members WHERE id=$1", memberID)
	})
	client := &listingHTTPClient{cookies: map[string]string{cfg.SessionCookie(): token}}
	return client, csrf, memberID
}

func assertSameSignedImage(t *testing.T, want listingimages.SignedImage, got []listingimages.View) {
	t.Helper()
	if len(got) != 1 {
		t.Fatalf("expected one signed image, got %#v", got)
	}
	if got[0].ID != want.ID || got[0].State != "signed" || got[0].URL != want.URL ||
		got[0].SortOrder != want.SortOrder || got[0].AltText == nil || want.AltText == nil ||
		*got[0].AltText != *want.AltText || !strings.Contains(got[0].URL, "token=read") {
		t.Fatalf("signed image mismatch want=%#v got=%#v", want, got[0])
	}
}
