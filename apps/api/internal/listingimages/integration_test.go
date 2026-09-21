//go:build integration

package listingimages

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestImageOwnershipVisibilityAndRLS(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" ||
		os.Getenv("DB_TARGET") != "fixture" ||
		os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("image integration requires the explicit isolated fixture")
	}

	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Migration} {
		cfg, err := platform.LoadConfig(role, "")
		imageMust(t, err)
		pool, err := platform.OpenDatabase(ctx, cfg)
		imageMust(t, err)
		pools[role] = pool
		t.Cleanup(pool.Close)
	}

	files, err := migrate.LoadFiles("/workspace/supabase/migrations")
	imageMust(t, err)
	status, err := migrate.Run(ctx, pools[platform.Migration], files, true, platform.NewLogger(io.Discard, "error"))
	imageMust(t, err)
	if !status.Ready || status.AppVersion != migrate.ListingImagesVersion {
		t.Fatal("image migration is not current")
	}

	var owner, other string
	imageMust(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('image-owner') RETURNING id::text").Scan(&owner))
	imageMust(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('image-other') RETURNING id::text").Scan(&other))

	createListing := func(title string) string {
		var id string
		imageMust(t, pools[platform.Migration].QueryRow(ctx, `INSERT INTO summergear_app.listings
			(member_id,sport,category,title,description,price_krw,condition,status,details,location_text)
			VALUES($1,'surf','equipment',$2,'integration image listing',1000,'good','pending_review',
			'{"sport":"surf","equipmentType":"surfboard"}'::jsonb,'fixture')
			RETURNING id::text`, owner, title).Scan(&id))
		return id
	}

	privateListing := createListing("private-images")
	publicListing := createListing("public-images")
	store := &Store{Pool: pools[platform.API]}
	now := time.Now().UTC()
	order := 0

	makeReady := func(listingID, imageID string) ImageRecord {
		input := UploadInput{MimeType: "image/jpeg", FileSizeBytes: 2048, SortOrder: &order}
		path := owner + "/" + listingID + "/" + imageID
		record, err := store.BeginUpload(ctx, owner, listingID, input, path, now.Add(time.Hour))
		imageMust(t, err)
		ready, _, err := store.CompleteUpload(ctx, owner, listingID, record.ID)
		imageMust(t, err)
		return ready
	}

	privateImage := makeReady(privateListing, "11111111-1111-4111-8111-111111111111")
	_ = makeReady(publicListing, "22222222-2222-4222-8222-222222222222")
	_, err = pools[platform.Migration].Exec(ctx,
		"UPDATE summergear_app.listings SET status='active',published_at=clock_timestamp() WHERE id=$1", publicListing)
	imageMust(t, err)

	if _, err := store.VisibleReady(ctx, privateListing, ""); !errors.Is(err, errNotFound) {
		t.Fatalf("private images visible anonymously: %v", err)
	}
	ownerImages, err := store.VisibleReady(ctx, privateListing, owner)
	imageMust(t, err)
	if len(ownerImages) != 1 || ownerImages[0].ID != privateImage.ID {
		t.Fatal("owner could not read private ready image")
	}
	if _, err := store.VisibleReady(ctx, privateListing, other); !errors.Is(err, errNotFound) {
		t.Fatalf("other member could read private images: %v", err)
	}
	publicImages, err := store.VisibleReady(ctx, publicListing, "")
	imageMust(t, err)
	if len(publicImages) != 1 {
		t.Fatal("active listing images were not publicly visible")
	}

	replacement := privateImage.ID
	if _, err := store.BeginUpload(ctx, other, privateListing,
		UploadInput{MimeType: "image/png", FileSizeBytes: 1024, ReplaceImageID: &replacement},
		other+"/"+privateListing+"/33333333-3333-4333-8333-333333333333", now.Add(time.Hour)); !errors.Is(err, errNotFound) {
		t.Fatalf("other member could reference owner's image: %v", err)
	}
	if _, err := store.BeginDelete(ctx, other, privateListing, privateImage.ID); !errors.Is(err, errNotFound) {
		t.Fatalf("other member could delete owner's image: %v", err)
	}

	tx, err := pools[platform.API].Begin(ctx)
	imageMust(t, err)
	defer tx.Rollback(context.Background())
	_, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", owner)
	imageMust(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,member_id,storage_path,mime_type,file_size_bytes,sort_order,state,upload_expires_at)
		VALUES('44444444-4444-4444-8444-444444444444',$1,$2,$3,'image/jpeg',1024,1,'pending_upload',clock_timestamp()+interval '1 hour')`,
		privateListing, owner, other+"/"+privateListing+"/44444444-4444-4444-8444-444444444444")
	if err == nil {
		t.Fatal("database accepted another member's Storage namespace")
	}
	_ = tx.Rollback(ctx)
}

func imageMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
