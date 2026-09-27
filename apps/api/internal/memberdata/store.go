package memberdata

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ Pool *pgxpool.Pool }
type Profile struct {
	ID               string  `json:"id"`
	DisplayName      string  `json:"displayName"`
	SurfSkill        string  `json:"surfSkill"`
	TennisSkill      string  `json:"tennisSkill"`
	PreferredSport   *string `json:"preferredSport"`
	MaxBudgetKRW     *int64  `json:"maxBudgetKrw"`
	PreferredRegion  string  `json:"preferredRegion"`
	SavedCount       int     `json:"savedCount"`
	TransactionCount int     `json:"transactionCount"`
}

func (s *Store) Ready(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, "SELECT 1 FROM summergear_app.member_preferences LIMIT 0")
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, "SELECT 1 FROM summergear_app.member_favorites LIMIT 0")
	return err
}
func (s *Store) begin(ctx context.Context, memberID string) (pgx.Tx, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('summergear.member_id',$1,true)", memberID); err != nil {
		tx.Rollback(context.Background())
		return nil, err
	}
	return tx, nil
}
func (s *Store) Profile(ctx context.Context, memberID string) (Profile, error) {
	tx, err := s.begin(ctx, memberID)
	if err != nil {
		return Profile{}, err
	}
	defer tx.Rollback(context.Background())
	var p Profile
	err = tx.QueryRow(ctx, `SELECT m.id::text,COALESCE(m.display_name,''),
 COALESCE(p.surf_skill,'beginner'),COALESCE(p.tennis_skill,'beginner'),
 p.preferred_sport,p.max_budget_krw,COALESCE(p.preferred_region,''),
 (SELECT count(*) FROM summergear_app.member_favorites f JOIN summergear_app.listings l ON l.id=f.listing_id AND l.status='active' WHERE f.member_id=m.id),
 (SELECT count(*) FROM summergear_app.orders o WHERE o.buyer_id=m.id AND o.status='confirmed' AND o.payment_status='approved' AND o.fulfillment_status='completed')
 FROM summergear_app.members m LEFT JOIN summergear_app.member_preferences p ON p.member_id=m.id WHERE m.id=$1 AND m.status='active'`, memberID).Scan(&p.ID, &p.DisplayName, &p.SurfSkill, &p.TennisSkill, &p.PreferredSport, &p.MaxBudgetKRW, &p.PreferredRegion, &p.SavedCount, &p.TransactionCount)
	if err != nil {
		return Profile{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return p, nil
}
func (s *Store) Update(ctx context.Context, memberID, name, surf, tennis string, preferredSport *string, budget *int64, region string) (Profile, error) {
	tx, err := s.begin(ctx, memberID)
	if err != nil {
		return Profile{}, err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `UPDATE summergear_app.members SET display_name=$2 WHERE id=$1`, memberID, name); err != nil {
		return Profile{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO summergear_app.member_preferences(member_id,surf_skill,tennis_skill,preferred_sport,max_budget_krw,preferred_region) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(member_id) DO UPDATE SET surf_skill=EXCLUDED.surf_skill,tennis_skill=EXCLUDED.tennis_skill,preferred_sport=EXCLUDED.preferred_sport,max_budget_krw=EXCLUDED.max_budget_krw,preferred_region=EXCLUDED.preferred_region,updated_at=clock_timestamp()`, memberID, surf, tennis, preferredSport, budget, region); err != nil {
		return Profile{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return s.Profile(ctx, memberID)
}
func (s *Store) FavoriteIDs(ctx context.Context, memberID string) ([]string, error) {
	tx, err := s.begin(ctx, memberID)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT f.listing_id::text FROM summergear_app.member_favorites f
 JOIN summergear_app.listings l ON l.id=f.listing_id AND l.status='active'
 WHERE f.member_id=$1 ORDER BY f.created_at DESC,f.listing_id DESC`, memberID)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return ids, nil
}
func (s *Store) SetFavorite(ctx context.Context, memberID, listingID string, favorite bool) (bool, error) {
	tx, err := s.begin(ctx, memberID)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(context.Background())
	if favorite {
		tag, insertErr := tx.Exec(ctx, `INSERT INTO summergear_app.member_favorites(member_id,listing_id)
 SELECT $1,l.id FROM summergear_app.listings l WHERE l.id=$2 AND l.status='active'
 ON CONFLICT(member_id,listing_id) DO NOTHING`, memberID, listingID)
		if insertErr != nil {
			return false, insertErr
		}
		if tag.RowsAffected() == 0 {
			var active bool
			err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM summergear_app.listings WHERE id=$1 AND status='active')`, listingID).Scan(&active)
			if err != nil {
				return false, err
			}
			if !active {
				return false, pgx.ErrNoRows
			}
		}
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM summergear_app.member_favorites WHERE member_id=$1 AND listing_id=$2`, memberID, listingID)
		if err != nil {
			return false, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	return favorite, nil
}
