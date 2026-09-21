package listings

import (
	"context"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"testing"
)

type imageFixture struct{ listingID, memberID string }

func (f *imageFixture) List(_ context.Context, listingID, memberID string) ([]listingimages.View, error) {
	f.listingID, f.memberID = listingID, memberID
	return []listingimages.View{{ID: "image", State: "signed", URL: "https://fixture.invalid/signed?token=x"}}, nil
}
func TestAttachImagesPreservesViewerAndResponse(t *testing.T) {
	r := &imageFixture{}
	h := &Handler{Images: r}
	item := Listing{ID: "listing"}
	if err := h.attachImages(t.Context(), &item, "owner"); err != nil {
		t.Fatal(err)
	}
	if r.listingID != "listing" || r.memberID != "owner" || len(item.Images) != 1 || item.Images[0].ID != "image" {
		t.Fatal("listing image integration lost viewer or response")
	}
}
