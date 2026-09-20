package listingimages

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

var (
	errObjectNotFound = errors.New("storage object not found")
	errSigningFailed  = errors.New("storage signing failed")
	errStorageDown    = errors.New("storage unavailable")
)

type Storage interface {
	Upload(context.Context, string, string, []byte) error
	Delete(context.Context, string) error
	Sign(context.Context, string, time.Duration) (string, error)
}

type HTTPStorage struct {
	projectURL  *url.URL
	storageBase string
	bucket      string
	key         string
	client      *http.Client
}

type unavailableStorage struct{}

func (unavailableStorage) Upload(context.Context, string, string, []byte) error {
	return errStorageDown
}
func (unavailableStorage) Delete(context.Context, string) error {
	return errStorageDown
}
func (unavailableStorage) Sign(context.Context, string, time.Duration) (string, error) {
	return "", errStorageDown
}

func NewStorage(cfg platform.Config, client *http.Client) (Storage, bool, error) {
	if cfg.SupabaseURL == "" && cfg.SupabaseServiceRoleKey == "" {
		return unavailableStorage{}, false, nil
	}
	if cfg.SupabaseURL == "" || cfg.SupabaseServiceRoleKey == "" {
		return nil, false, errors.New("listing image storage configuration is incomplete")
	}
	base, err := url.Parse(strings.TrimRight(cfg.SupabaseURL, "/"))
	if err != nil || base.Hostname() == "" {
		return nil, false, errors.New("listing image storage URL is invalid")
	}
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	bucket := cfg.ListingImageBucket
	if bucket == "" {
		bucket = "listing-images"
	}
	return &HTTPStorage{
		projectURL:  base,
		storageBase: strings.TrimRight(base.String(), "/") + "/storage/v1",
		bucket:      bucket,
		key:         cfg.SupabaseServiceRoleKey,
		client:      client,
	}, true, nil
}

func (s *HTTPStorage) Upload(ctx context.Context, path, contentType string, data []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.storageBase+"/object/"+url.PathEscape(s.bucket)+"/"+escapeObjectPath(path), bytes.NewReader(data))
	if err != nil {
		return errStorageDown
	}
	s.authorize(req)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("x-upsert", "false")
	resp, err := s.client.Do(req)
	if err != nil {
		return errStorageDown
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return errStorageDown
}

func (s *HTTPStorage) Delete(ctx context.Context, path string) error {
	body, _ := json.Marshal(map[string]any{"prefixes": []string{path}})
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		s.storageBase+"/object/"+url.PathEscape(s.bucket), bytes.NewReader(body))
	if err != nil {
		return errStorageDown
	}
	s.authorize(req)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return errStorageDown
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == http.StatusNotFound {
		return errObjectNotFound
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return errStorageDown
}

func (s *HTTPStorage) Sign(ctx context.Context, path string, ttl time.Duration) (string, error) {
	if ttl <= 0 || ttl > 600*time.Second || ttl%time.Second != 0 {
		return "", errStorageDown
	}
	body, _ := json.Marshal(map[string]any{"expiresIn": int(ttl / time.Second)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.storageBase+"/object/sign/"+url.PathEscape(s.bucket)+"/"+escapeObjectPath(path), bytes.NewReader(body))
	if err != nil {
		return "", errStorageDown
	}
	s.authorize(req)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return "", errStorageDown
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return "", errObjectNotFound
	}
	if resp.StatusCode == http.StatusBadRequest {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return "", errSigningFailed
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return "", errStorageDown
	}
	var payload struct {
		SignedURLUpper string `json:"signedURL"`
		SignedURL      string `json:"signedUrl"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&payload) != nil {
		return "", errStorageDown
	}
	value := payload.SignedURL
	if value == "" {
		value = payload.SignedURLUpper
	}
	return s.resolveSignedURL(value)
}

func (s *HTTPStorage) authorize(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("apikey", s.key)
}

func (s *HTTPStorage) resolveSignedURL(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", errStorageDown
	}
	var resolved *url.URL
	if strings.HasPrefix(value, "/") {
		parsed, err := url.Parse(s.storageBase + value)
		if err != nil {
			return "", errStorageDown
		}
		resolved = parsed
	} else {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", errStorageDown
		}
		resolved = parsed
	}
	if resolved.Scheme != s.projectURL.Scheme || !strings.EqualFold(resolved.Host, s.projectURL.Host) ||
		resolved.User != nil || resolved.Fragment != "" ||
		!strings.HasPrefix(resolved.Path, "/storage/v1/object/sign/"+s.bucket+"/") ||
		resolved.Query().Get("token") == "" {
		return "", errStorageDown
	}
	return resolved.String(), nil
}

func escapeObjectPath(value string) string {
	parts := strings.Split(value, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}
