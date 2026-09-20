//go:build integration

package listingimages

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func TestListingImageRLSOwnershipAndVisibility(t *testing.T) {
	if os.Getenv("SUMMERGEAR_INTEGRATION") != "fixture" ||
		os.Getenv("DB_TARGET") != "fixture" ||
		os.Getenv("DB_TARGET_ID") != platform.FixtureID {
		t.Fatal("listing image integration requires the explicit isolated fixture")
	}

	ctx := context.Background()
	pools := map[platform.Role]*pgxpool.Pool{}
	for _, role := range []platform.Role{platform.API, platform.Worker, platform.Migration} {
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
		t.Fatal("listing image migration is not current")
	}

	var owner, other string
	imageMust(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('image owner') RETURNING id::text").Scan(&owner))
	imageMust(t, pools[platform.Migration].QueryRow(ctx,
		"INSERT INTO summergear_app.members(display_name) VALUES('image other') RETURNING id::text").Scan(&other))

	createListing := func(title string) string {
		var id string
		imageMust(t, pools[platform.Migration].QueryRow(ctx, `INSERT INTO summergear_app.listings
			(member_id,sport,category,title,description,price_krw,condition,status,details,location_text)
			VALUES($1,'surf','equipment',$2,'listing image integration fixture',1000,'good','pending_review',
			'{"sport":"surf","equipmentType":"surfboard"}'::jsonb,'fixture')
			RETURNING id::text`, owner, title).Scan(&id))
		return id
	}

	privateListing := createListing("private image listing")
	store := &Store{Pool: pools[platform.API]}
	order, err := store.PrepareCreate(ctx, owner, privateListing, nil)
	imageMust(t, err)
	imageID := "11111111-1111-4111-8111-111111111111"
	record := Record{
		ID: imageID, ListingID: privateListing,
		StoragePath: owner + "/" + privateListing + "/" + imageID + ".jpg",
		SortOrder:   order,
	}
	imageMust(t, store.Insert(ctx, owner, privateListing, record))

	ownerImages, err := store.ListVisible(ctx, privateListing, owner)
	imageMust(t, err)
	if len(ownerImages) != 1 || ownerImages[0].ID != imageID {
		t.Fatal("owner could not read private listing image")
	}
	if _, err = store.ListVisible(ctx, privateListing, ""); !errors.Is(err, errListingNotFound) {
		t.Fatalf("anonymous requester discovered private listing images: %v", err)
	}
	if _, err = store.ListVisible(ctx, privateListing, other); !errors.Is(err, errListingNotFound) {
		t.Fatalf("other member discovered private listing images: %v", err)
	}
	if _, err = store.GetForMutation(ctx, other, privateListing, imageID); !errors.Is(err, errListingNotFound) {
		t.Fatalf("other member could target owner image: %v", err)
	}

	var leaked int
	imageMust(t, pools[platform.API].QueryRow(ctx,
		"SELECT count(*) FROM summergear_app.listing_images WHERE listing_id=$1", privateListing).Scan(&leaked))
	if leaked != 0 {
		t.Fatal("transaction-local member context leaked into a later API query")
	}

	tx, err := pools[platform.API].Begin(ctx)
	imageMust(t, err)
	_, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", other)
	imageMust(t, err)
	tag, err := tx.Exec(ctx, "UPDATE summergear_app.listing_images SET alt_text='forbidden' WHERE id=$1", imageID)
	imageMust(t, err)
	if tag.RowsAffected() != 0 {
		t.Fatal("RLS allowed another member to update a private image")
	}
	imageMust(t, tx.Rollback(ctx))

	wrongID := "22222222-2222-4222-8222-222222222222"
	_, err = pools[platform.Migration].Exec(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,storage_path,sort_order)
		VALUES($1,$2,$3,1)`, wrongID, privateListing,
		other+"/"+privateListing+"/"+wrongID+".jpg")
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("namespace trigger did not reject another member path: %v", err)
	}

	alt := "updated"
	patched, err := store.Patch(ctx, owner, privateListing, imageID, PatchInput{AltTextSet: true, AltText: &alt})
	imageMust(t, err)
	if patched.AltText == nil || *patched.AltText != alt {
		t.Fatal("owner metadata update did not persist")
	}
	newPath := owner + "/" + privateListing + "/" + wrongID + ".png"
	replaced, err := store.Replace(ctx, owner, privateListing, imageID, record.StoragePath, newPath, false, nil)
	imageMust(t, err)
	if replaced.StoragePath != newPath || replaced.ID != imageID {
		t.Fatal("replacement did not preserve identity")
	}
	if err = store.Delete(ctx, owner, privateListing, imageID, record.StoragePath); !errors.Is(err, errStateConflict) {
		t.Fatalf("stale delete targeted a replacement: %v", err)
	}
	imageMust(t, store.Delete(ctx, owner, privateListing, imageID, newPath))
	imageMust(t, store.Insert(ctx, owner, privateListing, record))

	tx, err = pools[platform.API].Begin(ctx)
	imageMust(t, err)
	_, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", other)
	imageMust(t, err)
	_, err = tx.Exec(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,storage_path,sort_order) VALUES($1,$2,$3,1)`,
		wrongID, privateListing, owner+"/"+privateListing+"/"+wrongID+".jpg")
	if err == nil {
		t.Fatal("RLS allowed a non-owner to insert")
	}
	imageMust(t, tx.Rollback(ctx))

	_, err = pools[platform.Migration].Exec(ctx,
		"UPDATE summergear_app.listings SET status='active',published_at=clock_timestamp() WHERE id=$1", privateListing)
	imageMust(t, err)
	publicImages, err := store.ListVisible(ctx, privateListing, "")
	imageMust(t, err)
	if len(publicImages) != 1 {
		t.Fatal("active listing images were not anonymously visible")
	}
	if _, err = store.GetForMutation(ctx, owner, privateListing, imageID); !errors.Is(err, errStateConflict) {
		t.Fatalf("owner mutated images on active listing: %v", err)
	}
	if _, err = store.GetForMutation(ctx, other, privateListing, imageID); !errors.Is(err, errListingNotFound) {
		t.Fatalf("non-owner active mutation exposed ownership: %v", err)
	}

	limitListing := createListing("image limit listing")
	for i := 0; i < MaxImages; i++ {
		id := fixtureImageUUID(i + 1)
		_, err = pools[platform.Migration].Exec(ctx, `INSERT INTO summergear_app.listing_images
			(id,listing_id,storage_path,sort_order) VALUES($1,$2,$3,$4)`,
			id, limitListing, owner+"/"+limitListing+"/"+id+".png", i)
		imageMust(t, err)
	}
	thirteenth := fixtureImageUUID(MaxImages + 1)
	_, err = pools[platform.Migration].Exec(ctx, `INSERT INTO summergear_app.listing_images
		(id,listing_id,storage_path,sort_order) VALUES($1,$2,$3,$4)`,
		thirteenth, limitListing, owner+"/"+limitListing+"/"+thirteenth+".png", MaxImages)
	pgErr = nil
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("database accepted more than 12 listing images: %v", err)
	}

	_, err = pools[platform.Worker].Exec(ctx, "SELECT * FROM summergear_app.listing_images LIMIT 0")
	pgErr = nil
	if !errors.As(err, &pgErr) || pgErr.Code != "42501" {
		t.Fatal("worker can access Go listing image metadata")
	}

}

func fixtureImageUUID(n int) string {
	const hex = "0123456789abcdef"
	last := make([]byte, 12)
	for i := range last {
		last[i] = '0'
	}
	last[11] = hex[n%16]
	last[10] = hex[(n/16)%16]
	return "aaaaaaaa-aaaa-4aaa-8aaa-" + string(last)
}

func imageMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
