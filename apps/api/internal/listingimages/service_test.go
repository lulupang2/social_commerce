package listingimages

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type fakeRepo struct {
	record        ImageRecord
	visible       []ImageRecord
	beginCalls    int
	failCalls     int
	completeCalls int
	finishCalls   int
	lastMember    string
	beginErr      error
	pendingErr    error
	completeErr   error
	visibleErr    error
	deleteErr     error
}

func (f *fakeRepo) BeginUpload(_ context.Context, memberID, listingID string, input UploadInput, path string, expires time.Time) (ImageRecord, error) {
	f.beginCalls++
	f.lastMember = memberID
	if f.beginErr != nil {
		return ImageRecord{}, f.beginErr
	}
	record := f.record
	if record.ID == "" {
		parts := splitPath(path)
		record = ImageRecord{
			ID: parts[2], ListingID: listingID, MemberID: memberID, StoragePath: path,
			MimeType: input.MimeType, FileSizeBytes: input.FileSizeBytes, AltText: input.AltText,
			SortOrder: derefSort(input.SortOrder), State: PendingUploadState, UploadExpiresAt: expires,
			ReplaceImageID: input.ReplaceImageID,
		}
	}
	return record, nil
}
func (f *fakeRepo) FailUpload(context.Context, string, string, string) error {
	f.failCalls++
	return nil
}
func (f *fakeRepo) PendingOwned(_ context.Context, memberID, _, _ string) (ImageRecord, error) {
	f.lastMember = memberID
	if f.pendingErr != nil {
		return ImageRecord{}, f.pendingErr
	}
	return f.record, nil
}
func (f *fakeRepo) CompleteUpload(context.Context, string, string, string) (ImageRecord, *ImageRecord, error) {
	f.completeCalls++
	if f.completeErr != nil {
		return ImageRecord{}, nil, f.completeErr
	}
	record := f.record
	record.State = ReadyState
	return record, nil, nil
}
func (f *fakeRepo) VisibleReady(_ context.Context, _ string, memberID string) ([]ImageRecord, error) {
	f.lastMember = memberID
	return f.visible, f.visibleErr
}
func (f *fakeRepo) BeginDelete(_ context.Context, memberID, _, _ string) (ImageRecord, error) {
	f.lastMember = memberID
	if f.deleteErr != nil {
		return ImageRecord{}, f.deleteErr
	}
	record := f.record
	record.State = DeletingState
	return record, nil
}
func (f *fakeRepo) FinishDelete(context.Context, string, string, string) error {
	f.finishCalls++
	return nil
}
func (f *fakeRepo) Ready(context.Context) error { return nil }

type fakeStorage struct {
	uploadURL   string
	info        ObjectInfo
	infoErr     error
	prefix      []byte
	prefixErr   error
	signURL     string
	signTTL     time.Duration
	deleteErr   error
	deleteCalls int
}

func (f *fakeStorage) CreateSignedUpload(context.Context, string) (string, error) {
	if f.uploadURL == "" {
		return "", ErrStorageUnavailable
	}
	return f.uploadURL, nil
}
func (f *fakeStorage) Info(context.Context, string) (ObjectInfo, error) { return f.info, f.infoErr }
func (f *fakeStorage) ReadPrefix(context.Context, string) ([]byte, error) {
	return f.prefix, f.prefixErr
}
func (f *fakeStorage) Sign(_ context.Context, _ string, ttl time.Duration) (string, error) {
	f.signTTL = ttl
	if f.signURL == "" {
		return "", ErrStorageUnavailable
	}
	return f.signURL, nil
}
func (f *fakeStorage) Delete(context.Context, string) error {
	f.deleteCalls++
	return f.deleteErr
}

func TestStartUploadValidatesFormatSizeAndPassesSessionMember(t *testing.T) {
	repo := &fakeRepo{}
	storage := &fakeStorage{uploadURL: "https://storage.example.invalid/upload?token=opaque"}
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}
	order := 0

	for _, input := range []UploadInput{
		{MimeType: "image/gif", FileSizeBytes: 1024, SortOrder: &order},
		{MimeType: "image/jpeg", FileSizeBytes: MaxFileSizeBytes + 1, SortOrder: &order},
	} {
		if _, err := service.StartUpload(context.Background(), "member-a", "listing-a", input); !errors.Is(err, errInvalid) {
			t.Fatalf("invalid input returned %v", err)
		}
	}
	if repo.beginCalls != 0 {
		t.Fatal("invalid upload reached repository")
	}

	slot, err := service.StartUpload(context.Background(), "member-a", "listing-a",
		UploadInput{MimeType: "image/jpg", FileSizeBytes: 1024, SortOrder: &order})
	if err != nil {
		t.Fatal(err)
	}
	if repo.lastMember != "member-a" || repo.beginCalls != 1 {
		t.Fatal("service session member was not used for ownership")
	}
	if slot.ExpiresAt.Sub(now) != SignedUploadTTL {
		t.Fatal("upload slot expiration changed")
	}
}

func TestCompleteMissingObjectStaysUnavailable(t *testing.T) {
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepo{record: ImageRecord{
		ID: "image-a", MemberID: "member-a", ListingID: "listing-a", StoragePath: "member-a/listing-a/image-a",
		MimeType: "image/jpeg", FileSizeBytes: 2048, State: PendingUploadState, UploadExpiresAt: now.Add(time.Hour),
	}}
	storage := &fakeStorage{infoErr: ErrObjectNotFound}
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}

	if _, err := service.Complete(context.Background(), "member-a", "listing-a", "image-a"); !errors.Is(err, errIncomplete) {
		t.Fatalf("missing upload returned %v", err)
	}
	if repo.failCalls != 1 || repo.completeCalls != 0 {
		t.Fatal("missing object was promoted to ready")
	}
}

func TestCompleteRejectsMismatchedObject(t *testing.T) {
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepo{record: ImageRecord{
		ID: "image-a", MemberID: "member-a", ListingID: "listing-a", StoragePath: "member-a/listing-a/image-a",
		MimeType: "image/jpeg", FileSizeBytes: 2048, State: PendingUploadState, UploadExpiresAt: now.Add(time.Hour),
	}}
	storage := &fakeStorage{info: ObjectInfo{MimeType: "image/png", FileSizeBytes: 2048}}
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}

	if _, err := service.Complete(context.Background(), "member-a", "listing-a", "image-a"); !errors.Is(err, errInvalid) {
		t.Fatalf("mismatched object returned %v", err)
	}
	if storage.deleteCalls != 1 || repo.failCalls != 1 || repo.completeCalls != 0 {
		t.Fatal("mismatched object was not quarantined")
	}
}

func TestCompleteVerifiesActualImageSignature(t *testing.T) {
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepo{record: ImageRecord{
		ID: "image-a", MemberID: "member-a", ListingID: "listing-a", StoragePath: "member-a/listing-a/image-a",
		MimeType: "image/jpeg", FileSizeBytes: 2048, State: PendingUploadState, UploadExpiresAt: now.Add(time.Hour),
	}}
	storage := &fakeStorage{
		info:   ObjectInfo{MimeType: "image/jpeg", FileSizeBytes: 2048},
		prefix: []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10},
	}
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}

	result, err := service.Complete(context.Background(), "member-a", "listing-a", "image-a")
	if err != nil {
		t.Fatal(err)
	}
	if result.State != ReadyState || repo.completeCalls != 1 {
		t.Fatal("verified image was not promoted to ready")
	}

	repo.completeCalls = 0
	repo.failCalls = 0
	storage.prefix = []byte("not-an-image")
	if _, err := service.Complete(context.Background(), "member-a", "listing-a", "image-a"); !errors.Is(err, errInvalid) {
		t.Fatalf("invalid image signature returned %v", err)
	}
	if repo.completeCalls != 0 || repo.failCalls != 1 {
		t.Fatal("invalid image bytes were promoted")
	}
}

func TestListUsesTenMinuteSignedURLsAndNoStoragePathInResponse(t *testing.T) {
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	repo := &fakeRepo{visible: []ImageRecord{{
		ID: "image-a", StoragePath: "member-a/listing-a/image-a", AltText: ptr("board"), SortOrder: 0, State: ReadyState,
	}}}
	storage := &fakeStorage{signURL: "https://storage.example.invalid/read?token=opaque"}
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}

	items, err := service.List(context.Background(), "listing-a", "")
	if err != nil {
		t.Fatal(err)
	}
	if repo.lastMember != "" {
		t.Fatal("anonymous read unexpectedly gained a member identity")
	}
	if len(items) != 1 || items[0].State != "signed" || items[0].URL == "" || storage.signTTL != SignedReadTTL {
		t.Fatal("signed image response is invalid")
	}
	if items[0].ExpiresAt.Sub(now) != SignedReadTTL {
		t.Fatal("signed read URL exceeds contract TTL")
	}
	encoded, err := json.Marshal(items)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("member-a/listing-a/image-a")) || bytes.Contains(encoded, []byte("storagePath")) {
		t.Fatal("private Storage path leaked into the public response")
	}
}

func TestDeleteFailureKeepsMetadataNonVisibleForRetry(t *testing.T) {
	repo := &fakeRepo{record: ImageRecord{
		ID: "image-a", MemberID: "member-a", ListingID: "listing-a", StoragePath: "member-a/listing-a/image-a", State: ReadyState,
	}}
	storage := &fakeStorage{deleteErr: ErrStorageUnavailable}
	service := &Service{Repo: repo, Storage: storage}

	if err := service.Delete(context.Background(), "member-a", "listing-a", "image-a"); !errors.Is(err, errStorage) {
		t.Fatalf("delete failure returned %v", err)
	}
	if repo.finishCalls != 0 {
		t.Fatal("metadata was removed despite storage delete failure")
	}
}

func TestOtherMemberReferenceErrorIsPreserved(t *testing.T) {
	order := 0
	repo := &fakeRepo{beginErr: errNotFound}
	service := &Service{Repo: repo, Storage: &fakeStorage{uploadURL: "https://storage.example.invalid/upload"}}
	other := "image-owned-by-another-member"
	_, err := service.StartUpload(context.Background(), "member-b", "listing-a", UploadInput{
		MimeType: "image/jpeg", FileSizeBytes: 1024, SortOrder: &order, ReplaceImageID: &other,
	})
	if !errors.Is(err, errNotFound) || repo.lastMember != "member-b" {
		t.Fatal("cross-member replacement was not rejected through the ownership boundary")
	}
}

func splitPath(path string) []string {
	out := make([]string, 3)
	part := 0
	start := 0
	for i := 0; i < len(path) && part < 2; i++ {
		if path[i] == '/' {
			out[part] = path[start:i]
			part++
			start = i + 1
		}
	}
	out[2] = path[start:]
	return out
}
func derefSort(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
func ptr(value string) *string { return &value }
