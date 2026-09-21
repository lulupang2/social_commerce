package listingimages

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPStorageLifecycleReadsWholeObjectWithinLimit(t *testing.T) {
	const key = "test-service-role-key"
	object := makeJPEG(t, 32, 24)
	var sawUpload, sawInfo, sawRead, sawSign, sawDelete bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+key || r.Header.Get("apikey") != key {
			t.Error("storage credentials were not attached server-side")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch {
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/object/upload/sign/listing-images/"):
			sawUpload = true
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"url":"/object/upload/sign/listing-images/member/listing/image?token=opaque"}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/object/info/listing-images/"):
			sawInfo = true
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"metadata": map[string]any{"size": len(object), "mimetype": "image/jpeg", "contentLength": len(object)}})
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/object/listing-images/"):
			sawRead = true
			if r.Header.Get("Range") != "" {
				t.Error("full validation read unexpectedly used a Range request")
			}
			w.Header().Set("Content-Length", intString(len(object)))
			_, _ = w.Write(object)
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/object/sign/listing-images/"):
			sawSign = true
			var body map[string]int
			if json.NewDecoder(r.Body).Decode(&body) != nil || body["expiresIn"] != 600 {
				t.Error("signed read TTL was not capped at 600 seconds")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"signedURL":"/object/sign/listing-images/member/listing/image?token=read"}`))
		case r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/object/listing-images"):
			sawDelete = true
			var body struct {
				Prefixes []string `json:"prefixes"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil || len(body.Prefixes) != 1 || body.Prefixes[0] != "member/listing/image" {
				t.Error("delete did not target exactly the owned object")
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		default:
			t.Errorf("unexpected storage request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	storage, err := NewHTTPStorage(server.URL, key, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	path := "member/listing/image"
	uploadURL, err := storage.CreateSignedUpload(t.Context(), path)
	if err != nil || !strings.Contains(uploadURL, "token=opaque") {
		t.Fatalf("signed upload failed: %v", err)
	}
	info, err := storage.Info(t.Context(), path)
	if err != nil || info.MimeType != "image/jpeg" || info.FileSizeBytes != int64(len(object)) {
		t.Fatalf("object info failed: %#v %v", info, err)
	}
	data, err := storage.ReadObject(t.Context(), path, int64(len(object)))
	if err != nil || len(data) != len(object) || validateImageBytes(data, "image/jpeg") != nil {
		t.Fatalf("full object validation read failed: %v", err)
	}
	readURL, err := storage.Sign(t.Context(), path, SignedReadTTL)
	if err != nil || !strings.Contains(readURL, "token=read") {
		t.Fatalf("signed read failed: %v", err)
	}
	if err := storage.Delete(t.Context(), path); err != nil {
		t.Fatal(err)
	}
	if !sawUpload || !sawInfo || !sawRead || !sawSign || !sawDelete {
		t.Fatal("storage lifecycle did not exercise every operation")
	}
}

func TestHTTPStorageRejectsBodyAboveValidationLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "5")
		_, _ = w.Write([]byte("12345"))
	}))
	defer server.Close()
	storage, err := NewHTTPStorage(server.URL, "fixture", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = storage.ReadObject(t.Context(), "member/listing/image", 4); err != ErrObjectTooLarge {
		t.Fatalf("oversized object read returned %v", err)
	}
}

func TestHTTPStorageRejectsExcessiveReadTTL(t *testing.T) {
	storage, err := NewHTTPStorage("https://example.supabase.co", "secret", &http.Client{Timeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := storage.Sign(t.Context(), "member/listing/image", SignedReadTTL+time.Second); err == nil {
		t.Fatal("read signer accepted a TTL above the ten-minute contract")
	}
}

func TestLoadStorageAllowsUnconfiguredIsolation(t *testing.T) {
	t.Setenv("SUPABASE_URL", "")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "")
	storage, configured, err := LoadStorage("")
	if err != nil || configured || storage == nil {
		t.Fatalf("unconfigured storage should remain testable: configured=%v err=%v", configured, err)
	}
	if _, err := storage.CreateSignedUpload(t.Context(), "x"); !errorsIsStorageUnavailable(err) {
		t.Fatal("unconfigured storage did not fail closed")
	}
}

func errorsIsStorageUnavailable(err error) bool { return err == ErrStorageUnavailable }

func intString(value int) string {
	if value == 0 {
		return "0"
	}
	buf := make([]byte, 0, 20)
	for value > 0 {
		buf = append(buf, byte('0'+value%10))
		value /= 10
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}
