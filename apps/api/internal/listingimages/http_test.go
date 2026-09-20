package listingimages

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
)

type fakeAuth struct {
	session     auth.SessionView
	sessionErr  error
	mutationErr error
}

func (f *fakeAuth) RequireSession(fiber.Ctx, context.Context) (auth.SessionView, error) {
	return f.session, f.sessionErr
}
func (f *fakeAuth) RequireMutationSession(fiber.Ctx, context.Context) (auth.SessionView, error) {
	return f.session, f.mutationErr
}

func TestImageHTTPCreateValidationAndAnonymousRead(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	memberID := "11111111-1111-4111-8111-111111111111"
	listingID := "22222222-2222-4222-8222-222222222222"
	repo := &fakeRepo{prepareOrder: 0}
	storage := &fakeStorage{}
	service := &Service{Repo: repo, Storage: storage}
	authn := &fakeAuth{session: auth.SessionView{Member: auth.Member{ID: memberID}}}
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	Register(app, authn, service, logger)

	body, contentType := multipartBody(t, "image.png", "image/png", testPNG(20, 30), map[string]string{
		"altText": "  front view  ",
	})
	resp, data := imageRequest(t, app, http.MethodPost, "/api/v1/listings/"+listingID+"/images", body, contentType, nil)
	if resp.StatusCode != http.StatusCreated || !bytes.Contains(data, []byte(`"state":"signed"`)) {
		t.Fatalf("create failed: %d %s", resp.StatusCode, data)
	}
	if len(storage.uploads) != 1 || repo.insertCalls != 1 {
		t.Fatal("create did not persist exactly one private image")
	}

	badBody, badType := multipartBody(t, "bad.gif", "image/gif", testPNG(20, 30), nil)
	resp, data = imageRequest(t, app, http.MethodPost, "/api/v1/listings/"+listingID+"/images", badBody, badType, nil)
	if resp.StatusCode != http.StatusUnsupportedMediaType || !bytes.Contains(data, []byte("LISTING_IMAGE_MEDIA_TYPE_UNSUPPORTED")) {
		t.Fatalf("unsupported media returned %d %s", resp.StatusCode, data)
	}

	large := make([]byte, MaxFileSizeBytes+1)
	copy(large, testPNG(20, 30))
	largeBody, largeType := multipartBody(t, "large.png", "image/png", large, nil)
	resp, data = imageRequest(t, app, http.MethodPost, "/api/v1/listings/"+listingID+"/images", largeBody, largeType, nil)
	if resp.StatusCode != http.StatusRequestEntityTooLarge || !bytes.Contains(data, []byte("LISTING_IMAGE_TOO_LARGE")) {
		t.Fatalf("oversized image returned %d %s", resp.StatusCode, data)
	}

	dimensionBody, dimensionType := multipartBody(t, "wide.png", "image/png", testPNG(4097, 1), nil)
	resp, data = imageRequest(t, app, http.MethodPost, "/api/v1/listings/"+listingID+"/images", dimensionBody, dimensionType, nil)
	if resp.StatusCode != http.StatusBadRequest || !bytes.Contains(data, []byte("LISTING_IMAGE_INVALID")) {
		t.Fatalf("oversized dimensions returned %d %s", resp.StatusCode, data)
	}

	repo.visible = []Record{{ID: "33333333-3333-4333-8333-333333333333", ListingID: listingID, StoragePath: memberID + "/" + listingID + "/obj.jpg"}}
	authn.sessionErr = &auth.Failure{Status: 401, Code: "UNAUTHENTICATED", Message: "A valid service session is required"}
	resp, data = imageRequest(t, app, http.MethodGet, "/api/v1/listings/"+listingID+"/images", nil, "", nil)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(`"state":"signed"`)) {
		t.Fatalf("anonymous active image read failed: %d %s", resp.StatusCode, data)
	}

	repo.visibleErr = errListingNotFound
	resp, data = imageRequest(t, app, http.MethodGet, "/api/v1/listings/"+listingID+"/images", nil, "", nil)
	if resp.StatusCode != http.StatusNotFound || !bytes.Contains(data, []byte("LISTING_NOT_FOUND")) {
		t.Fatalf("private listing was not hidden: %d %s", resp.StatusCode, data)
	}
}

func TestImageHTTPNonOwnerMutationIsHidden(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	listingID := "22222222-2222-4222-8222-222222222222"
	repo := &fakeRepo{prepareErr: errListingNotFound}
	service := &Service{Repo: repo, Storage: &fakeStorage{}}
	authn := &fakeAuth{session: auth.SessionView{Member: auth.Member{ID: "99999999-9999-4999-8999-999999999999"}}}
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	Register(app, authn, service, logger)

	body, contentType := multipartBody(t, "image.png", "image/png", testPNG(10, 10), nil)
	resp, data := imageRequest(t, app, http.MethodPost, "/api/v1/listings/"+listingID+"/images", body, contentType, nil)
	if resp.StatusCode != http.StatusNotFound || !bytes.Contains(data, []byte("LISTING_NOT_FOUND")) {
		t.Fatalf("non-owner mutation was not hidden: %d %s", resp.StatusCode, data)
	}
}

func TestImageHTTPPatchReplaceAndDelete(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	memberID := "11111111-1111-4111-8111-111111111111"
	listingID := "22222222-2222-4222-8222-222222222222"
	imageID := "33333333-3333-4333-8333-333333333333"
	current := Record{
		ID: imageID, ListingID: listingID,
		StoragePath: memberID + "/" + listingID + "/" + imageID + ".jpg",
		SortOrder:   0,
	}
	alt := "updated"
	repo := &fakeRepo{
		current: current,
		patchResult: Record{
			ID: imageID, ListingID: listingID, StoragePath: current.StoragePath,
			AltText: &alt, SortOrder: 2,
		},
	}
	storage := &fakeStorage{}
	service := &Service{Repo: repo, Storage: storage}
	authn := &fakeAuth{session: auth.SessionView{Member: auth.Member{ID: memberID}}}
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	Register(app, authn, service, logger)
	base := "/api/v1/listings/" + listingID + "/images/" + imageID

	resp, data := imageRequest(t, app, http.MethodPatch, base,
		[]byte(`{"altText":"updated","sortOrder":2}`), "application/json", nil)
	if resp.StatusCode != http.StatusOK || !bytes.Contains(data, []byte(`"sortOrder":2`)) {
		t.Fatalf("patch failed: %d %s", resp.StatusCode, data)
	}

	body, contentType := multipartBody(t, "replacement.webp", "image/webp", testWebP(30, 20), map[string]string{
		"altText": "replacement",
	})
	resp, data = imageRequest(t, app, http.MethodPut, base, body, contentType, nil)
	if resp.StatusCode != http.StatusOK || repo.replaceCalls != 1 || !bytes.Contains(data, []byte(`"state":"signed"`)) {
		t.Fatalf("replace failed: %d %s", resp.StatusCode, data)
	}

	resp, data = imageRequest(t, app, http.MethodDelete, base, nil, "", nil)
	if resp.StatusCode != http.StatusNoContent || len(data) != 0 || repo.deleteCalls != 1 {
		t.Fatalf("delete failed: %d %s", resp.StatusCode, data)
	}

	repo.patchErr = errSortConflict
	resp, data = imageRequest(t, app, http.MethodPatch, base,
		[]byte(`{"sortOrder":1}`), "application/json", nil)
	if resp.StatusCode != http.StatusConflict || !bytes.Contains(data, []byte("LISTING_IMAGE_SORT_CONFLICT")) {
		t.Fatalf("sort conflict returned %d %s", resp.StatusCode, data)
	}
}

func TestImageHTTPUsesExistingOriginAndCSRFProtection(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := auth.Config{PublicURL: "https://app.example.invalid", FixtureHTTP: true}
	authHandler := &auth.Handler{Config: cfg}
	service := &Service{Repo: &fakeRepo{}, Storage: &fakeStorage{}}
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	Register(app, authHandler, service, logger)
	body, contentType := multipartBody(t, "image.png", "image/png", testPNG(10, 10), nil)
	path := "/api/v1/listings/22222222-2222-4222-8222-222222222222/images"

	resp, data := imageRequest(t, app, http.MethodPost, path, body, contentType, nil)
	if resp.StatusCode != http.StatusForbidden || !bytes.Contains(data, []byte("ORIGIN_INVALID")) {
		t.Fatalf("missing origin returned %d %s", resp.StatusCode, data)
	}

	body, contentType = multipartBody(t, "image.png", "image/png", testPNG(10, 10), nil)
	headers := map[string]string{
		"Origin": cfg.PublicURL,
		"Cookie": cfg.SessionCookie() + "=" + strings.Repeat("A", 43),
	}
	resp, data = imageRequest(t, app, http.MethodPost, path, body, contentType, headers)
	if resp.StatusCode != http.StatusForbidden || !bytes.Contains(data, []byte("CSRF_INVALID")) {
		t.Fatalf("missing CSRF returned %d %s", resp.StatusCode, data)
	}
}

func TestImageHTTPServerBodyLimitEnvelope(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app := httpapi.New(logger, func(context.Context) error { return nil }).App
	Register(app, &fakeAuth{}, &Service{Repo: &fakeRepo{}, Storage: &fakeStorage{}}, logger)
	body, contentType := multipartBody(t, "large.png", "image/png", make([]byte, 13*1024*1024), nil)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true}) }()
	t.Cleanup(func() { _ = app.Shutdown() })
	req, err := http.NewRequest(http.MethodPost, "http://"+listener.Addr().String()+"/api/v1/listings/id/images", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Expect", "100-continue")
	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{ExpectContinueTimeout: 5 * time.Second}}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 413 || !bytes.Contains(data, []byte("LISTING_IMAGE_TOO_LARGE")) || len(resp.Header.Get("X-Request-ID")) != 32 {
		t.Fatalf("body limit lost image error envelope: %d %s", resp.StatusCode, data)
	}
}

func multipartBody(t *testing.T, filename, contentType string, data []byte, fields map[string]string) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(data); err != nil {
		t.Fatal(err)
	}
	for key, value := range fields {
		if err = writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes(), writer.FormDataContentType()
}

func imageRequest(
	t *testing.T,
	app *fiber.App,
	method, path string,
	body []byte,
	contentType string,
	headers map[string]string,
) (*http.Response, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, "https://app.example.invalid"+path, bytes.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := app.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	return resp, data
}
