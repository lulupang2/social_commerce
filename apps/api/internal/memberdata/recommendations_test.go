package memberdata

import (
	"strings"
	"testing"
	"time"

	"github.com/lulupang2/social_commerce/apps/api/internal/listings"
)

func TestRecommendationRankingAndReasons(t *testing.T) {
	moment := time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)
	items := []listings.Listing{
		{ID: "00000000-0000-4000-8000-000000000001", Sport: "tennis", Location: "Seoul", PriceKRW: 120000, CreatedAt: moment, Details: map[string]any{}},
		{ID: "00000000-0000-4000-8000-000000000002", Sport: "surf", Location: "Yangyang beach", PriceKRW: 50000, CreatedAt: moment, Details: map[string]any{"skillLevel": "intermediate"}},
		{ID: "00000000-0000-4000-8000-000000000003", Sport: "surf", Location: "Yangyang beach", PriceKRW: 50000, CreatedAt: moment, Details: map[string]any{"skillLevel": "expert"}},
	}
	guest := rankCandidates(items, preference{})
	if guest[0].Listing.ID != items[2].ID || guest[0].Reason != nil || guest[0].Score != 0 {
		t.Fatal("guest should get latest with no invented reason")
	}
	sport, region, budget := "surf", "yangyang", int64(60000)
	personal := rankCandidates(items, preference{Sport: &sport, Region: region, Budget: &budget, SurfSkill: "intermediate"})
	if personal[0].Listing.ID != items[1].ID || personal[0].Score != 9 || personal[0].Reason == nil || !strings.Contains(*personal[0].Reason, "실력") {
		t.Fatal("matching skill, sport, budget and region did not rank first")
	}
	if personal[1].Listing.ID != items[2].ID || personal[1].Score != 8 || strings.Contains(*personal[1].Reason, "실력") {
		t.Fatal("nonmatching skill was presented as a match")
	}
	if personal[2].Reason != nil || personal[2].Score != 0 {
		t.Fatal("unmatched item claimed a match")
	}
	if ranked := rankCandidates(items, preference{Budget: &budget}); ranked[0].Listing.ID != items[2].ID || ranked[0].Score != 2 || strings.Contains(*ranked[0].Reason, "종목") {
		t.Fatal("budget-only preference did not use recency tie-break or fabricated sport")
	}
}
