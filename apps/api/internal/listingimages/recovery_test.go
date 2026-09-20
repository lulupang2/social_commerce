package listingimages

import (
	"context"
	"errors"
	"net/url"
	"testing"
)

func TestRejectPublicOrUnsignedStorageResponses(t *testing.T) {
	base, _ := url.Parse("https://fixture.supabase.co")
	storage := &HTTPStorage{projectURL: base, storageBase: base.String() + "/storage/v1", bucket: "listing-images"}
	for _, value := range []string{
		"/object/public/listing-images/a.png",
		"/object/public/listing-images/a.png?token=fake",
		"/object/sign/other/a.png?token=fake",
		"/object/sign/listing-images/a.png",
		"https://fixture.supabase.co/storage/v1/object/public/listing-images/a.png?token=fake",
	} {
		if _, err := storage.resolveSignedURL(value); !errors.Is(err, errStorageDown) {
			t.Fatalf("non-signed URL accepted: %q", value)
		}
	}
}

func TestDeleteRetryAfterDatabaseFailure(t *testing.T) {
	repo := &fakeRepo{current: Record{StoragePath: "member/listing/image.jpg"}, deleteErr: errDB}
	storage := &fakeStorage{deleteErrors: []error{nil, errObjectNotFound}}
	service := &Service{Repo: repo, Storage: storage}
	if err := service.Delete(t.Context(), "member", "listing", "image"); !errors.Is(err, errDB) {
		t.Fatalf("got %v", err)
	}
	repo.deleteErr = nil
	if err := service.Delete(t.Context(), "member", "listing", "image"); err != nil {
		t.Fatal(err)
	}
	if repo.deleteCalls != 2 || len(storage.deletes) != 2 {
		t.Fatal("retry did not finish DB deletion")
	}
}

type cleanupStorage struct {
	fakeStorage
	cleanupErr error
}

func (s *cleanupStorage) Delete(ctx context.Context, path string) error {
	s.cleanupErr = ctx.Err()
	return s.fakeStorage.Delete(ctx, path)
}
func TestCleanupSurvivesRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	storage := &cleanupStorage{}
	service := &Service{Storage: storage}
	service.cleanupNewObject(ctx, "member/listing/new.png", "create_db")
	if storage.cleanupErr != nil || len(storage.deletes) != 1 {
		t.Fatal("cleanup inherited cancellation")
	}
}

func TestUploadFailureDoesNotWriteMetadata(t *testing.T) {
	repo := &fakeRepo{}
	storage := &fakeStorage{uploadErr: errStorageDown}
	service := &Service{Repo: repo, Storage: storage}
	if _, err := service.Create(t.Context(), "member", "listing", CreateInput{File: ImageFile{Extension: "png"}}); !errors.Is(err, errStorage) {
		t.Fatalf("got %v", err)
	}
	if repo.insertCalls != 0 {
		t.Fatal("failed upload inserted metadata")
	}
}
