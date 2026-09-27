package migrate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

const AuthVersion = "0008_go_auth"
const ListingsVersion = "0009_go_listings"
const ListingImagesVersion = "0010_go_listing_images"
const SellersVersion = "0011_sellers"
const OrdersVersion = "0012_orders"
const PaymentsVersion = "0013_payments"
const CommerceRuntimeVersion = "0014_commerce_runtime"
const CommerceVersion = "0015_toss_test"
const MemberDataVersion = "0016_member_personal_data"
const ReviewVersion = "0017_listing_reviews"
const SocialVersion = "0018_social_go"
const RecommendationsVersion = "0019_member_recommendations"
const SellerFlowVersion = "0020_service_sellers"
const FulfillmentVersion = "0021_order_fulfillment"
const PushVersion = "0022_push_notifications"
const RecoveryVersion = "0023_payment_recovery"
const PushReceiptsVersion = "0024_push_receipts"

var manifest = []string{AppVersion, AuthVersion, ListingsVersion, ListingImagesVersion, SellersVersion, OrdersVersion, PaymentsVersion, CommerceRuntimeVersion, CommerceVersion, MemberDataVersion, ReviewVersion, SocialVersion, RecommendationsVersion, SellerFlowVersion, FulfillmentVersion, PushVersion, RecoveryVersion, PushReceiptsVersion}

type File struct {
	Version string
	SQL     []byte
}

func LoadFiles(dir string) ([]File, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, errors.New("app migration directory cannot be read")
	}
	for _, entry := range entries {
		name := entry.Name()
		if len(name) > 4 && name[:4] >= "0007" && strings.HasSuffix(name, ".sql") {
			known := false
			for _, version := range manifest {
				if name == version+".sql" {
					known = true
				}
			}
			if !known {
				return nil, errors.New("unknown app migration file; update the ordered manifest explicitly")
			}
		}
	}
	files := make([]File, 0, len(manifest))
	for _, version := range manifest {
		data, err := os.ReadFile(filepath.Join(dir, version+".sql"))
		if err != nil {
			return nil, errors.New("required app migration file cannot be read")
		}
		files = append(files, File{version, data})
	}
	return files, nil
}
func checksum(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func validateFiles(files []File) error {
	if len(files) == 0 || len(files) > len(manifest) {
		return errors.New("invalid app migration manifest")
	}
	for i, file := range files {
		if file.Version != manifest[i] || len(file.SQL) == 0 {
			return errors.New("app migrations must be a complete ordered prefix beginning at 0007")
		}
	}
	return nil
}

// Run locks the entire chain, checks all supplied checksums before applying any
// pending file, and commits each migration and its history in one transaction.
// Inspection also checks source checksums, but never creates or changes objects.
func Run(ctx context.Context, pool *pgxpool.Pool, files []File, apply bool, logger *slog.Logger) (Status, error) {
	if err := validateFiles(files); err != nil {
		return Status{}, err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return Status{}, platform.ErrDatabase
	}
	defer conn.Release()
	var locked bool
	if err = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, lockID).Scan(&locked); err != nil {
		return Status{}, platform.ErrDatabase
	}
	if !locked {
		return Status{}, errors.New("another app migration is in progress")
	}
	defer conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, lockID)
	if apply {
		if _, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS summergear_meta.schema_migrations
   (version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
			return Status{}, platform.ErrDatabase
		}
	}
	rows, err := pool.Query(ctx, `SELECT version,checksum FROM summergear_meta.schema_migrations ORDER BY version`)
	if err != nil {
		return Status{}, errors.New("app migration history unavailable")
	}
	count := 0
	for rows.Next() {
		var version, sum string
		if rows.Scan(&version, &sum) != nil {
			rows.Close()
			return Status{}, platform.ErrDatabase
		}
		if count >= len(files) || files[count].Version != version {
			rows.Close()
			return Status{}, errors.New("app migration history contains a gap, unknown version or unavailable source")
		}
		if checksum(files[count].SQL) != sum {
			rows.Close()
			return Status{}, errors.New("app migration checksum mismatch; never rewrite applied SQL")
		}
		count++
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Status{}, platform.ErrDatabase
	}
	if !apply && count != len(files) {
		return Status{}, errors.New("app migrations are pending")
	}
	for _, file := range files[count:] {
		tx, err := pool.Begin(ctx)
		if err != nil {
			return Status{}, platform.ErrDatabase
		}
		if _, err = tx.Exec(ctx, string(file.SQL)); err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO summergear_meta.schema_migrations(version,checksum) VALUES($1,$2)`, file.Version, checksum(file.SQL))
		}
		if err != nil {
			tx.Rollback(context.Background())
			return Status{}, errors.New("app migration failed")
		}
		if err = tx.Commit(ctx); err != nil {
			return Status{}, platform.ErrDatabase
		}
	}
	if apply {
		m, err := rivermigrate.New(riverpgxv5.New(pool), &rivermigrate.Config{Schema: platform.RiverSchema, Logger: logger})
		if err != nil {
			return Status{}, errors.New("River migration initialization failed")
		}
		// River enum migrations require their own official per-version transactions.
		if _, err = m.Migrate(ctx, rivermigrate.DirectionUp, &rivermigrate.MigrateOpts{TargetVersion: RiverVersion}); err != nil {
			return Status{}, errors.New("River migration failed")
		}
		if _, err = pool.Exec(ctx, grants); err != nil {
			return Status{}, errors.New("runtime grant reconciliation failed")
		}
	}
	return Inspect(ctx, pool, logger)
}
