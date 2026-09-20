package listingimages

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeRepo struct {
	visible         []Record
	visibleErr      error
	prepareOrder    int
	prepareErr      error
	insertErr       error
	current         Record
	currentErr      error
	patchResult     Record
	patchErr        error
	replaceResult   Record
	replaceErr      error
	deleteErr       error
	insertCalls     int
	replaceCalls    int
	deleteCalls     int
	capturedNewPath string
}

func (f *fakeRepo) Ready(context.Context) error { return nil }
func (f *fakeRepo) ListVisible(context.Context, string, string) ([]Record, error) {
	return f.visible, f.visibleErr
}
func (f *fakeRepo) PrepareCreate(context.Context, string, string, *int) (int, error) {
	return f.prepareOrder, f.prepareErr
}
func (f *fakeRepo) Insert(context.Context, string, string, Record) error {
	f.insertCalls++
	return f.insertErr
}
func (f *fakeRepo) GetForMutation(context.Context, string, string, string) (Record, error) {
	return f.current, f.currentErr
}
func (f *fakeRepo) Patch(context.Context, string, string, string, PatchInput) (Record, error) {
	return f.patchResult, f.patchErr
}
func (f *fakeRepo) Replace(_ context.Context, _, _, _, _, newPath string, _ bool, _ *string) (Record, error) {
	f.replaceCalls++
	f.capturedNewPath = newPath
	if f.replaceErr != nil {
		return Record{}, f.replaceErr
	}
	result := f.replaceResult
	if result.ID == "" {
		result = f.current
		result.StoragePath = newPath
	}
	return result, nil
}
func (f *fakeRepo) Delete(context.Context, string, string, string, string) error {
	f.deleteCalls++
	return f.deleteErr
}

type fakeStorage struct {
	uploadErr     error
	signErr       error
	signErrByPath map[string]error
	deleteErrors  []error
	uploads       []string
	deletes       []string
	lastTTL       time.Duration
}

func (f *fakeStorage) Upload(_ context.Context, path, _ string, _ []byte) error {
	f.uploads = append(f.uploads, path)
	return f.uploadErr
}
func (f *fakeStorage) Delete(_ context.Context, path string) error {
	f.deletes = append(f.deletes, path)
	if len(f.deleteErrors) == 0 {
		return nil
	}
	err := f.deleteErrors[0]
	f.deleteErrors = f.deleteErrors[1:]
	return err
}
func (f *fakeStorage) Sign(_ context.Context, path string, ttl time.Duration) (string, error) {
	f.lastTTL = ttl
	if f.signErrByPath != nil {
		if err := f.signErrByPath[path]; err != nil {
			return "", err
		}
	}
	if f.signErr != nil {
		return "", f.signErr
	}
	return "https://storage.example.invalid/private?token=signed", nil
}

func TestListVisibleSignedUnavailableAndTTL(t *testing.T) {
	now := time.Date(2026, 9, 21, 1, 2, 3, 0, time.UTC)
	repo := &fakeRepo{visible: []Record{
		{ID: "one", StoragePath: "member/listing/one.jpg", SortOrder: 0},
		{ID: "two", StoragePath: "member/listing/two.jpg", SortOrder: 1},
	}}
	storage := &fakeStorage{signErrByPath: map[string]error{"member/listing/two.jpg": errObjectNotFound}}
	service := &Service{Repo: repo, Storage: storage, TTL: 600 * time.Second, Now: func() time.Time { return now }}

	views, err := service.ListVisible(context.Background(), "listing", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 2 || views[0].State != "signed" || views[0].URL == nil || views[0].ExpiresAt == nil {
		t.Fatalf("unexpected signed view: %#v", views)
	}
	if views[0].ExpiresAt.Sub(now) != 600*time.Second || storage.lastTTL != 600*time.Second {
		t.Fatal("signed URL TTL exceeded contract")
	}
	if views[1].State != "unavailable" || views[1].Reason == nil || *views[1].Reason != "not_found" || views[1].URL != nil {
		t.Fatalf("missing object did not become unavailable: %#v", views[1])
	}
}

func TestListVisibleStorageOutageReturns503(t *testing.T) {
	repo := &fakeRepo{visible: []Record{{ID: "one", StoragePath: "member/listing/one.jpg"}}}
	service := &Service{Repo: repo, Storage: &fakeStorage{signErr: errStorageDown}, TTL: 600 * time.Second}
	if _, err := service.ListVisible(context.Background(), "listing", ""); !errors.Is(err, errStorage) {
		t.Fatalf("storage outage returned %v", err)
	}
}

func TestCreateLimitAndDatabaseCleanup(t *testing.T) {
	file := ImageFile{Bytes: testPNG(10, 10), MIMEType: "image/png", Extension: "png", Width: 10, Height: 10}
	limitRepo := &fakeRepo{prepareErr: errLimitReached}
	limitStorage := &fakeStorage{}
	limitService := &Service{Repo: limitRepo, Storage: limitStorage, TTL: 600 * time.Second}
	if _, err := limitService.Create(context.Background(), "member", "listing", CreateInput{File: file}); !errors.Is(err, errLimitReached) {
		t.Fatalf("limit returned %v", err)
	}
	if len(limitStorage.uploads) != 0 {
		t.Fatal("limit failure uploaded a file")
	}

	repo := &fakeRepo{prepareOrder: 4, insertErr: errDB}
	storage := &fakeStorage{}
	service := &Service{Repo: repo, Storage: storage, TTL: 600 * time.Second}
	_, err := service.Create(context.Background(), "member", "listing", CreateInput{File: file})
	if !errors.Is(err, errDB) {
		t.Fatalf("database failure returned %v", err)
	}
	if len(storage.uploads) != 1 || len(storage.deletes) != 1 || storage.uploads[0] != storage.deletes[0] {
		t.Fatal("new Storage object was not cleaned after DB failure")
	}
}

func TestReplaceCleanupSemantics(t *testing.T) {
	current := Record{ID: "image", ListingID: "listing", StoragePath: "member/listing/old.jpg", SortOrder: 2}
	file := ImageFile{Bytes: testPNG(10, 10), MIMEType: "image/png", Extension: "png", Width: 10, Height: 10}

	repo := &fakeRepo{current: current}
	storage := &fakeStorage{deleteErrors: []error{errStorageDown}}
	service := &Service{Repo: repo, Storage: storage, TTL: 600 * time.Second}
	view, err := service.Replace(context.Background(), "member", "listing", "image", ReplaceInput{File: file})
	if err != nil {
		t.Fatal(err)
	}
	if view.ID != "image" || repo.replaceCalls != 1 || repo.capturedNewPath == current.StoragePath {
		t.Fatal("replacement did not preserve image identity with a new object key")
	}
	if len(storage.deletes) != 1 || storage.deletes[0] != current.StoragePath {
		t.Fatal("old object cleanup was not attempted")
	}

	repo2 := &fakeRepo{current: current, replaceErr: errDB}
	storage2 := &fakeStorage{}
	service2 := &Service{Repo: repo2, Storage: storage2, TTL: 600 * time.Second}
	if _, err := service2.Replace(context.Background(), "member", "listing", "image", ReplaceInput{File: file}); !errors.Is(err, errDB) {
		t.Fatalf("replace DB failure returned %v", err)
	}
	if len(storage2.uploads) != 1 || len(storage2.deletes) != 1 || storage2.uploads[0] != storage2.deletes[0] {
		t.Fatal("replacement DB failure did not clean the new object")
	}
}

func TestDeleteIsRetrySafeAfterStorageFailure(t *testing.T) {
	current := Record{ID: "image", ListingID: "listing", StoragePath: "member/listing/image.jpg"}
	repo := &fakeRepo{current: current}
	storage := &fakeStorage{deleteErrors: []error{errStorageDown, errObjectNotFound}}
	service := &Service{Repo: repo, Storage: storage, TTL: 600 * time.Second}

	if err := service.Delete(context.Background(), "member", "listing", "image"); !errors.Is(err, errStorage) {
		t.Fatalf("first delete returned %v", err)
	}
	if repo.deleteCalls != 0 {
		t.Fatal("metadata was deleted after Storage failure")
	}
	if err := service.Delete(context.Background(), "member", "listing", "image"); err != nil {
		t.Fatal(err)
	}
	if repo.deleteCalls != 1 {
		t.Fatal("retry did not finish metadata deletion after object-not-found")
	}
}
