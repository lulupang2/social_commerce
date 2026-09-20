package listingimages

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestHTTPStoragePrivateLifecycle(t *testing.T) {
	const key = "fixture-service-role-secret"
	var uploadSeen, signSeen, deleteSeen bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+key || r.Header.Get("apikey") != key {
			t.Error("server-only Storage credential missing")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch {
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/storage/v1/object/listing-images/"):
			uploadSeen = true
			if r.Header.Get("x-upsert") != "false" || r.Header.Get("Content-Type") != "image/png" {
				t.Error("upload headers changed")
			}
			data, _ := io.ReadAll(r.Body)
			if len(data) == 0 {
				t.Error("empty upload")
			}
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/storage/v1/object/sign/listing-images/"):
			signSeen = true
			var body struct {
				ExpiresIn int `json:"expiresIn"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil || body.ExpiresIn != 600 {
				t.Error("signed URL TTL was not 600 seconds")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"signedURL":"/object/sign/listing-images/member/listing/image.png?token=private"}`))
		case r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/storage/v1/object/listing-images"):
			deleteSeen = true
			var body struct {
				Prefixes []string `json:"prefixes"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil || len(body.Prefixes) != 1 ||
				body.Prefixes[0] != "member/listing/image.png" {
				t.Error("delete did not target exactly one private object")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("[]"))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	storage, configured, err := NewStorage(platform.Config{
		SupabaseURL: server.URL, SupabaseServiceRoleKey: key,
		ListingImageBucket: "listing-images", ListingImageSignedURLTTL: 600 * time.Second,
	}, server.Client())
	if err != nil || !configured {
		t.Fatalf("storage config failed: %v", err)
	}
	path := "member/listing/image.png"
	if err := storage.Upload(t.Context(), path, "image/png", testPNG(10, 10)); err != nil {
		t.Fatal(err)
	}
	signed, err := storage.Sign(t.Context(), path, 600*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(signed, "/public/") || !strings.Contains(signed, "token=private") {
		t.Fatalf("unexpected signed URL: %s", signed)
	}
	if err := storage.Delete(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	if !uploadSeen || !signSeen || !deleteSeen {
		t.Fatal("private Storage lifecycle was incomplete")
	}
}

func TestStorageHasNoPublicURLFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/object/sign/") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"signedURL":"https://cdn.example.invalid/public/image.png"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	storage, _, err := NewStorage(platform.Config{
		SupabaseURL: server.URL, SupabaseServiceRoleKey: "secret", ListingImageBucket: "listing-images",
	}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.Sign(t.Context(), "member/listing/image.png", 600*time.Second); err != errStorageDown {
		t.Fatalf("foreign/public URL was accepted: %v", err)
	}
}

func TestStorageTTLAndUnconfiguredFailClosed(t *testing.T) {
	storage, configured, err := NewStorage(platform.Config{}, nil)
	if err != nil || configured {
		t.Fatalf("unconfigured storage should be accepted but disabled: %v", err)
	}
	if _, err := storage.Sign(t.Context(), "x", 600*time.Second); err != errStorageDown {
		t.Fatal("unconfigured storage did not fail closed")
	}

	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	configuredStorage, _, err := NewStorage(platform.Config{
		SupabaseURL: server.URL, SupabaseServiceRoleKey: "secret", ListingImageBucket: "listing-images",
	}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := configuredStorage.Sign(t.Context(), "x", 601*time.Second); err != errStorageDown {
		t.Fatalf("TTL above 600 seconds was accepted: %v", err)
	}
}
