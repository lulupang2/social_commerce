package listings

import "context"

// EligibleCandidates is bounded to the newest 200 purchasable active listings.
// The same seller and stock predicates as order creation exclude unprepared and sold-out listings.
func (s *Store) EligibleCandidates(ctx context.Context) ([]Listing, error) {
	rows, err := s.Pool.Query(ctx, `SELECT l.id::text,l.member_id::text,m.display_name,l.sport,l.category,l.title,l.description,
 l.price_krw,l.condition,l.status,l.details,l.location_text,l.published_at,l.created_at,l.updated_at
 FROM summergear_app.listings l
 JOIN summergear_app.members m ON m.id=l.member_id
 JOIN summergear_app.inventory_items i ON i.listing_id=l.id AND i.available_quantity>0
 JOIN summergear_app.sellers s ON s.id=i.seller_id AND s.status='approved'
 WHERE l.status='active' AND l.price_krw>0 AND summergear_app.listing_seller_valid(l.id,s.id)
 ORDER BY COALESCE(l.published_at,l.created_at) DESC,l.id DESC LIMIT 200`)
	if err != nil {
		return nil, errDB
	}
	defer rows.Close()
	items := make([]Listing, 0, 200)
	for rows.Next() {
		item, e := scanListing(rows)
		if e != nil {
			return nil, errDB
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, errDB
	}
	return items, nil
}
