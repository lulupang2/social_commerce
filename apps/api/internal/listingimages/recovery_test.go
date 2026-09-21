package listingimages

import (
	"context"
	"errors"
	"testing"
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

func TestDeleteRetryAfterDatabaseFailure(t *testing.T) {
	r := &retryRepo{finishErr: errDB}
	s := &fakeStorage{}
	service := &Service{Repo: r, Storage: s}
	if err := service.Delete(t.Context(), "member", "listing", "image"); !errors.Is(err, errDB) {
		t.Fatal(err)
	}
	r.finishErr = nil
	s.deleteErr = ErrObjectNotFound
	if err := service.Delete(t.Context(), "member", "listing", "image"); err != nil {
		t.Fatal(err)
	}
	if r.finishCalls != 2 || s.deleteCalls != 2 {
		t.Fatal("retry did not finish metadata deletion")
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
