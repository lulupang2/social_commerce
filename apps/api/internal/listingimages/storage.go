package listingimages

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

type Storage interface {
	CreateSignedUpload(context.Context, string) (string, error)
	Info(context.Context, string) (ObjectInfo, error)
	ReadPrefix(context.Context, string) ([]byte, error)
	Sign(context.Context, string, time.Duration) (string, error)
	Delete(context.Context, string) error
}

type HTTPStorage struct {
	baseURL string
	key     string
	client  *http.Client
}

type unavailableStorage struct{}

func (unavailableStorage) CreateSignedUpload(context.Context, string) (string, error) {
	return "", ErrStorageUnavailable
}
func (unavailableStorage) Info(context.Context, string) (ObjectInfo, error) {
	return ObjectInfo{}, ErrStorageUnavailable
}
func (unavailableStorage) ReadPrefix(context.Context, string) ([]byte, error) {
	return nil, ErrStorageUnavailable
}
func (unavailableStorage) Sign(context.Context, string, time.Duration) (string, error) {
	return "", ErrStorageUnavailable
}
func (unavailableStorage) Delete(context.Context, string) error { return ErrStorageUnavailable }

func LoadStorage(envFile string) (Storage, bool, error) {
	values, err := platform.ReadEnvFile(envFile)
	if err != nil {
		return nil, false, err
	}
	get := func(key string) string {
		if value, ok := os.LookupEnv(key); ok {
			return strings.TrimSpace(value)
		}
		return strings.TrimSpace(values[key])
	}
	base, key := get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY")
	if base == "" && key == "" {
		return unavailableStorage{}, false, nil
	}
	if base == "" || key == "" {
		return unavailableStorage{}, false, nil
	}
	storage, err := NewHTTPStorage(base, key, nil)
	if err != nil {
		return nil, false, err
	}
	return storage, true, nil
}

func NewHTTPStorage(baseURL, serviceKey string, client *http.Client) (*HTTPStorage, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid SUPABASE_URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackHost(u.Hostname())) {
		return nil, errors.New("SUPABASE_URL must use HTTPS")
	}
	if strings.TrimSpace(serviceKey) == "" {
		return nil, errors.New("missing SUPABASE_SERVICE_ROLE_KEY")
	}
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	return &HTTPStorage{baseURL: strings.TrimRight(u.String(), "/") + "/storage/v1", key: serviceKey, client: client}, nil
}

func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *HTTPStorage) CreateSignedUpload(ctx context.Context, storagePath string) (string, error) {
	var result struct {
		URL       string `json:"url"`
		SignedURL string `json:"signedUrl"`
	}
	if err := s.requestJSON(ctx, http.MethodPost, "/object/upload/sign/"+Bucket+"/"+escapePath(storagePath), map[string]any{}, &result); err != nil {
		return "", err
	}
	value := result.SignedURL
	if value == "" {
		value = result.URL
	}
	return s.signedStorageURL(value, "/object/upload/sign/"+Bucket+"/"+storagePath)
}

func (s *HTTPStorage) Info(ctx context.Context, storagePath string) (ObjectInfo, error) {
	var result struct {
		Metadata *struct {
			Size          int64  `json:"size"`
			MimeType      string `json:"mimetype"`
			ContentLength int64  `json:"contentLength"`
		} `json:"metadata"`
	}
	if err := s.requestJSON(ctx, http.MethodGet, "/object/info/"+Bucket+"/"+escapePath(storagePath), nil, &result); err != nil {
		return ObjectInfo{}, err
	}
	if result.Metadata == nil {
		return ObjectInfo{}, ErrStorageUnavailable
	}
	size := result.Metadata.Size
	if size <= 0 {
		size = result.Metadata.ContentLength
	}
	mimeType := canonicalMime(strings.ToLower(strings.TrimSpace(strings.Split(result.Metadata.MimeType, ";")[0])))
	if size <= 0 || mimeType == "" {
		return ObjectInfo{}, ErrStorageUnavailable
	}
	return ObjectInfo{MimeType: mimeType, FileSizeBytes: size}, nil
}

func (s *HTTPStorage) ReadPrefix(ctx context.Context, storagePath string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		s.baseURL+"/object/"+Bucket+"/"+escapePath(storagePath), nil)
	if err != nil {
		return nil, ErrStorageUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("apikey", s.key)
	req.Header.Set("Range", "bytes=0-31")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, ErrStorageUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, ErrObjectNotFound
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, ErrStorageUnavailable
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32))
	if err != nil || len(data) == 0 {
		return nil, ErrStorageUnavailable
	}
	return data, nil
}

func (s *HTTPStorage) Sign(ctx context.Context, storagePath string, ttl time.Duration) (string, error) {
	if ttl <= 0 || ttl > SignedReadTTL || ttl%time.Second != 0 {
		return "", ErrStorageUnavailable
	}
	var result struct {
		SignedURLUpper string `json:"signedURL"`
		SignedURL      string `json:"signedUrl"`
	}
	if err := s.requestJSON(ctx, http.MethodPost, "/object/sign/"+Bucket+"/"+escapePath(storagePath),
		map[string]any{"expiresIn": int(ttl / time.Second)}, &result); err != nil {
		return "", err
	}
	value := result.SignedURL
	if value == "" {
		value = result.SignedURLUpper
	}
	return s.signedStorageURL(value, "/object/sign/"+Bucket+"/"+storagePath)
}

func (s *HTTPStorage) Delete(ctx context.Context, storagePath string) error {
	return s.requestJSON(ctx, http.MethodDelete, "/object/"+Bucket,
		map[string]any{"prefixes": []string{storagePath}}, nil)
}

func (s *HTTPStorage) requestJSON(ctx context.Context, method, path string, body any, target any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return ErrStorageUnavailable
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, s.baseURL+path, reader)
	if err != nil {
		return ErrStorageUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("apikey", s.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return ErrStorageUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return ErrObjectNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return ErrStorageUnavailable
	}
	if target == nil || resp.StatusCode == http.StatusNoContent {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil
	}
	decoder := json.NewDecoder(io.LimitReader(resp.Body, 64*1024))
	if decoder.Decode(target) != nil {
		return ErrStorageUnavailable
	}
	return nil
}

func (s *HTTPStorage) signedStorageURL(value, expectedPath string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", ErrStorageUnavailable
	}
	base, _ := url.Parse(s.baseURL)
	if strings.HasPrefix(value, "/storage/v1/") {
		value = base.Scheme + "://" + base.Host + value
	} else if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		value = s.baseURL + value
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != base.Scheme || u.Host != base.Host || u.User != nil || u.Fragment != "" ||
		u.Path != base.Path+expectedPath || u.Query().Get("token") == "" {
		return "", ErrStorageUnavailable
	}
	return u.String(), nil
}

func escapePath(value string) string {
	parts := strings.Split(value, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}
