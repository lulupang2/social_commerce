package listings

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
)

const maxListingPrice int64 = 999999999999

type PageQuery struct {
	Filters Filters
	Limit   int
	Cursor  string
}
type ListingPage struct {
	Items      []Listing `json:"items"`
	NextCursor *string   `json:"nextCursor"`
}
type listingCursor struct {
	FilterHash [32]byte  `json:"filterHash"`
	CreatedAt  time.Time `json:"createdAt"`
	Price      int64     `json:"price"`
	ID         string    `json:"id"`
}

func normalizeFilters(filters Filters) (Filters, error) {
	filters.Sport = strings.TrimSpace(filters.Sport)
	filters.Category = strings.TrimSpace(filters.Category)
	filters.Search = strings.TrimSpace(filters.Search)
	filters.Location = strings.TrimSpace(filters.Location)
	if filters.Sort == "" {
		filters.Sort = "recent"
	}
	if filters.Sport != "" && !oneOf(filters.Sport, "surf", "tennis") ||
		filters.Category != "" && !validCategory(filters.Category) ||
		len([]rune(filters.Search)) > 120 || len([]rune(filters.Location)) > 160 ||
		!oneOf(filters.Sort, "recent", "price_asc", "price_desc") ||
		filters.MinPrice != nil && (*filters.MinPrice < 0 || *filters.MinPrice > maxListingPrice) ||
		filters.MaxPrice != nil && (*filters.MaxPrice < 0 || *filters.MaxPrice > maxListingPrice) ||
		filters.MinPrice != nil && filters.MaxPrice != nil && *filters.MinPrice > *filters.MaxPrice {
		return Filters{}, errInvalid
	}
	return filters, nil
}

func (s *Store) ListPage(ctx context.Context, query PageQuery) (ListingPage, error) {
	filters, err := normalizeFilters(query.Filters)
	if err != nil {
		return ListingPage{}, err
	}
	if query.Limit == 0 {
		query.Limit = 24
	}
	if query.Limit < 1 || query.Limit > 50 {
		return ListingPage{}, errInvalid
	}
	encoded, err := json.Marshal(filters)
	if err != nil {
		return ListingPage{}, errInvalid
	}
	hash := sha256.Sum256(encoded)
	var cursor listingCursor
	var anchor any
	var anchorID any
	if query.Cursor != "" {
		if len(query.Cursor) > 1024 {
			return ListingPage{}, errInvalid
		}
		data, e := base64.RawURLEncoding.DecodeString(query.Cursor)
		if e != nil || json.Unmarshal(data, &cursor) != nil || cursor.FilterHash != hash || uuid.Validate(cursor.ID) != nil || cursor.CreatedAt.IsZero() || cursor.Price < 0 || cursor.Price > maxListingPrice {
			return ListingPage{}, errInvalid
		}
		anchorID = cursor.ID
		if filters.Sort == "recent" {
			anchor = cursor.CreatedAt
		} else {
			anchor = cursor.Price
		}
	}
	order := "l.created_at DESC,l.id DESC"
	anchorSQL := "($8::timestamptz IS NULL OR (l.created_at,l.id)<($8::timestamptz,$9::uuid))"
	if filters.Sort == "price_asc" {
		order = "l.price_krw ASC,l.id ASC"
		anchorSQL = "($8::bigint IS NULL OR (l.price_krw,l.id)>($8::bigint,$9::uuid))"
	}
	if filters.Sort == "price_desc" {
		order = "l.price_krw DESC,l.id DESC"
		anchorSQL = "($8::bigint IS NULL OR (l.price_krw,l.id)<($8::bigint,$9::uuid))"
	}
	search := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(filters.Search)
	rows, err := s.Pool.Query(ctx, `SELECT l.id::text,l.member_id::text,m.display_name,l.sport,l.category,l.title,l.description,
 l.price_krw,l.condition,l.status,l.details,l.location_text,l.published_at,l.created_at,l.updated_at
 FROM summergear_app.listings l JOIN summergear_app.members m ON m.id=l.member_id
 WHERE l.status='active' AND ($1='' OR l.sport=$1) AND ($2='' OR l.category=$2)
 AND ($3='' OR l.title ILIKE '%'||$3||'%' ESCAPE '\' OR l.description ILIKE '%'||$3||'%' ESCAPE '\' OR l.location_text ILIKE '%'||$3||'%' ESCAPE '\')
 AND ($4='' OR l.location_text ILIKE '%'||$4||'%' ESCAPE '\')
 AND ($5::bigint IS NULL OR l.price_krw>=$5) AND ($6::bigint IS NULL OR l.price_krw<=$6)
 AND `+anchorSQL+` ORDER BY `+order+` LIMIT $7`, filters.Sport, filters.Category, search,
		strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(filters.Location), filters.MinPrice, filters.MaxPrice, query.Limit+1, anchor, anchorID)
	if err != nil {
		return ListingPage{}, errDB
	}
	defer rows.Close()
	items := make([]Listing, 0, query.Limit)
	for rows.Next() {
		item, e := scanListing(rows)
		if e != nil {
			return ListingPage{}, errDB
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return ListingPage{}, errDB
	}
	result := ListingPage{Items: items}
	if len(items) > query.Limit {
		result.Items = items[:query.Limit]
		last := result.Items[len(result.Items)-1]
		token, e := json.Marshal(listingCursor{FilterHash: hash, CreatedAt: last.CreatedAt, Price: last.PriceKRW, ID: last.ID})
		if e != nil {
			return ListingPage{}, errDB
		}
		next := base64.RawURLEncoding.EncodeToString(token)
		result.NextCursor = &next
	}
	return result, nil
}
