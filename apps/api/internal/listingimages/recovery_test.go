package listingimages

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Restores the signed-URL boundary regression from the pre-merge implementation.
func TestRejectPublicOrUnsignedStorageResponses(t *testing.T) {
	s, err := NewHTTPStorage("https://fixture.supabase.co", "fixture-only", nil)
	if err != nil {
		t.Fatal(err)
	}
	path := "/object/sign/listing-images/member/listing/image"
	for _, value := range []string{
		"/object/public/listing-images/member/listing/image?token=x",
		path, "https://foreign.invalid/storage/v1" + path + "?token=x",
		"//foreign.invalid" + path + "?token=x",
		"/object/sign/other/member/listing/image?token=x",
	} {
		if _, err := s.signedStorageURL(value, path); !errors.Is(err, ErrStorageUnavailable) {
			t.Fatalf("accepted %q", value)
		}
	}
	for _, value := range []string{path + "?token=x", "/storage/v1" + path + "?token=x", "https://fixture.supabase.co/storage/v1" + path + "?token=x"} {
		if _, err := s.signedStorageURL(value, path); err != nil {
			t.Fatal(err)
		}
	}
}

type retryRepo struct {
	fakeRepo
	finishErr error
}

func (r *retryRepo) FinishDelete(context.Context, string, string, string) error {
	r.finishCalls++
	return r.finishErr
}

func TestDeleteRetriesMetadataAfterObjectWasAlreadyDeleted(t *testing.T) {
	r := &retryRepo{finishErr: errDB}
	s := &fakeStorage{}
	service := &Service{Repo: r, Storage: s}
	if err := service.Delete(t.Context(), "member", "listing", "image"); !errors.Is(err, errDB) {
		t.Fatal(err)
	}
	// The object delete happened once; metadata gets the request attempt plus one
	// detached retry so a canceled/failed request does not strand deleting rows.
	if r.finishCalls != 2 || s.deleteCalls != 1 {
		t.Fatalf("unexpected first-attempt calls: finish=%d delete=%d", r.finishCalls, s.deleteCalls)
	}

	r.finishErr = nil
	s.deleteErr = ErrObjectNotFound
	if err := service.Delete(t.Context(), "member", "listing", "image"); err != nil {
		t.Fatal(err)
	}
	if r.finishCalls != 3 || s.deleteCalls != 2 {
		t.Fatal("retry did not finish metadata deletion after object 404")
	}
}

func TestUploadFailureMarksSlotFailed(t *testing.T) {
	r := &fakeRepo{}
	s := &Service{Repo: r, Storage: &fakeStorage{}}
	order := 0
	_, err := s.StartUpload(t.Context(), "member", "listing", UploadInput{MimeType: "image/png", FileSizeBytes: 20, SortOrder: &order})
	if !errors.Is(err, errStorage) || r.failCalls != 1 || r.completeCalls != 0 {
		t.Fatal("failed upload slot was not invalidated")
	}
}

type recoveryRepo struct {
	fakeRepo
	candidates []ImageRecord
	finished   []string
	finishErr  error
	replaced   *ImageRecord
}

func (r *recoveryRepo) RecoveryCandidates(context.Context, time.Time, int) ([]ImageRecord, error) {
	return append([]ImageRecord(nil), r.candidates...), nil
}

func (r *recoveryRepo) FinishRecovery(_ context.Context, record ImageRecord) error {
	if r.finishErr != nil {
		return r.finishErr
	}
	r.finished = append(r.finished, record.ID)
	return nil
}

func (r *recoveryRepo) CompleteUpload(context.Context, string, string, string) (ImageRecord, *ImageRecord, error) {
	r.completeCalls++
	record := r.record
	record.State = ReadyState
	return record, r.replaced, nil
}

type recoveryStorage struct {
	fakeStorage
	deleteErrors map[string]error
	deleted      []string
}

func (s *recoveryStorage) Delete(_ context.Context, path string) error {
	s.deleteCalls++
	s.deleted = append(s.deleted, path)
	if err := s.deleteErrors[path]; err != nil {
		return err
	}
	return nil
}

func TestRecoverySweepIsIdempotentAndDefersStorageFailure(t *testing.T) {
	candidates := []ImageRecord{
		{ID: "failed", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/failed", State: FailedState},
		{ID: "deleting", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/deleting", State: DeletingState},
		{ID: "deferred", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/deferred", State: FailedState},
	}
	repo := &recoveryRepo{candidates: candidates}
	storage := &recoveryStorage{deleteErrors: map[string]error{
		"member/listing/deleting": ErrObjectNotFound,
		"member/listing/deferred": ErrStorageUnavailable,
	}}
	service := &Service{Repo: repo, Storage: storage}

	stats, err := service.Recover(t.Context(), 100)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Scanned != 3 || stats.Cleaned != 2 || stats.Deferred != 1 {
		t.Fatalf("unexpected recovery stats: %+v", stats)
	}
	if len(repo.finished) != 2 || repo.finished[0] != "failed" || repo.finished[1] != "deleting" {
		t.Fatalf("unexpected recovered records: %v", repo.finished)
	}

	// A later sweep may see the same metadata again after an ambiguous DB result.
	// Object 404 remains success, and FinishRecovery is state-gated/idempotent.
	repo.candidates = candidates[:2]
	storage.deleteErrors["member/listing/failed"] = ErrObjectNotFound
	stats, err = service.Recover(t.Context(), 100)
	if err != nil || stats.Cleaned != 2 || stats.Deferred != 0 {
		t.Fatalf("idempotent recovery failed: %+v %v", stats, err)
	}
}

type cancelAwareRepo struct {
	fakeRepo
	cancel         context.CancelFunc
	failContextErr error
}

func (r *cancelAwareRepo) BeginUpload(ctx context.Context, memberID, listingID string, input UploadInput, path string, expires time.Time) (ImageRecord, error) {
	record, err := r.fakeRepo.BeginUpload(ctx, memberID, listingID, input, path, expires)
	if r.cancel != nil {
		r.cancel()
	}
	return record, err
}

func (r *cancelAwareRepo) FailUpload(ctx context.Context, memberID, listingID, imageID string) error {
	r.failContextErr = ctx.Err()
	return r.fakeRepo.FailUpload(ctx, memberID, listingID, imageID)
}

func TestCleanupUsesDetachedContextAfterRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	repo := &cancelAwareRepo{}
	repo.cancel = cancel
	service := &Service{Repo: repo, Storage: &fakeStorage{}}
	order := 0

	_, err := service.StartUpload(ctx, "member", "listing", UploadInput{MimeType: "image/png", FileSizeBytes: 20, SortOrder: &order})
	if !errors.Is(err, errStorage) {
		t.Fatal(err)
	}
	if repo.failCalls != 1 || repo.failContextErr != nil {
		t.Fatalf("request cancellation prevented slot cleanup: calls=%d contextErr=%v", repo.failCalls, repo.failContextErr)
	}
}

func TestExpiredSlotLeakAndReplacementDeleteFailureAreRecovered(t *testing.T) {
	now := time.Date(2026, 9, 21, 0, 0, 0, 0, time.UTC)
	expired := ImageRecord{
		ID: "expired", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/expired",
		MimeType: "image/jpeg", FileSizeBytes: 100, State: PendingUploadState, UploadExpiresAt: now.Add(-time.Minute),
	}
	repo := &recoveryRepo{fakeRepo: fakeRepo{record: expired}}
	storage := &recoveryStorage{deleteErrors: map[string]error{"member/listing/expired": ErrStorageUnavailable}}
	service := &Service{Repo: repo, Storage: storage, Now: func() time.Time { return now }}

	if _, err := service.Complete(t.Context(), "member", "listing", "expired"); !errors.Is(err, errExpired) {
		t.Fatal(err)
	}
	if repo.failCalls != 1 || storage.deleteCalls != 1 {
		t.Fatal("expired slot was not marked failed and cleanup attempted")
	}
	repo.candidates = []ImageRecord{{ID: "expired", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/expired", State: FailedState}}
	delete(storage.deleteErrors, "member/listing/expired")
	stats, err := service.Recover(t.Context(), 10)
	if err != nil || stats.Cleaned != 1 {
		t.Fatalf("expired object leak was not recovered: %+v %v", stats, err)
	}

	data := makeJPEG(t, 16, 16)
	newRecord := ImageRecord{
		ID: "new", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/new",
		MimeType: "image/jpeg", FileSizeBytes: int64(len(data)), State: PendingUploadState, UploadExpiresAt: now.Add(time.Hour),
	}
	oldRecord := ImageRecord{
		ID: "old", MemberID: "member", ListingID: "listing", StoragePath: "member/listing/old",
		MimeType: "image/jpeg", FileSizeBytes: int64(len(data)), State: ReadyState, UploadExpiresAt: now.Add(time.Hour),
	}
	repo.record = newRecord
	repo.replaced = &oldRecord
	storage.info = ObjectInfo{MimeType: "image/jpeg", FileSizeBytes: int64(len(data))}
	storage.object = data
	storage.deleteErrors[oldRecord.StoragePath] = ErrStorageUnavailable

	result, err := service.Complete(t.Context(), "member", "listing", "new")
	if err != nil || result.State != ReadyState {
		t.Fatalf("replacement completion failed: %#v %v", result, err)
	}
	repo.candidates = []ImageRecord{{ID: oldRecord.ID, MemberID: oldRecord.MemberID, ListingID: oldRecord.ListingID, StoragePath: oldRecord.StoragePath, State: DeletingState}}
	delete(storage.deleteErrors, oldRecord.StoragePath)
	stats, err = service.Recover(t.Context(), 10)
	if err != nil || stats.Cleaned != 1 {
		t.Fatalf("old replacement object was not recovered: %+v %v", stats, err)
	}
}
