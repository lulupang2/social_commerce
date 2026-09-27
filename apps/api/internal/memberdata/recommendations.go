package memberdata

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/listings"
)

type preference struct {
	Sport       *string
	Budget      *int64
	Region      string
	SurfSkill   string
	TennisSkill string
}
type Recommendation struct {
	Listing listings.Listing `json:"listing"`
	Reason  *string          `json:"reason"`
	Score   int              `json:"score"`
}

func (s *Store) recommendationPreference(ctx context.Context, member string) (preference, error) {
	tx, err := s.begin(ctx, member)
	if err != nil {
		return preference{}, err
	}
	defer tx.Rollback(context.Background())
	var p preference
	err = tx.QueryRow(ctx, `SELECT preferred_sport,max_budget_krw,preferred_region,surf_skill,tennis_skill
 FROM summergear_app.member_preferences WHERE member_id=$1`, member).Scan(&p.Sport, &p.Budget, &p.Region, &p.SurfSkill, &p.TennisSkill)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return preference{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return preference{}, err
	}
	return p, nil
}

func rankCandidates(items []listings.Listing, p preference) []Recommendation {
	result := make([]Recommendation, 0, len(items))
	for _, item := range items {
		score := 0
		matches := make([]string, 0, 4)
		if p.Sport != nil && item.Sport == *p.Sport {
			score += 4
			matches = append(matches, map[string]string{"surf": "선호 종목 서핑", "tennis": "선호 종목 테니스"}[item.Sport])
			if skill, ok := item.Details["skillLevel"].(string); ok && skill != "" &&
				((item.Sport == "surf" && skill == p.SurfSkill) || (item.Sport == "tennis" && skill == p.TennisSkill)) {
				score++
				matches = append(matches, "설정한 실력과 일치")
			}
		}
		if p.Budget != nil && item.PriceKRW <= *p.Budget {
			score += 2
			matches = append(matches, "설정한 예산 이하")
		}
		if p.Region != "" && strings.Contains(strings.ToLower(item.Location), strings.ToLower(p.Region)) {
			score += 2
			matches = append(matches, "선호 지역 일치")
		}
		var reason *string
		if score > 0 {
			text := strings.Join(matches, " · ")
			reason = &text
		}
		result = append(result, Recommendation{Listing: item, Reason: reason, Score: score})
	}
	date := func(item listings.Listing) time.Time {
		if item.PublishedAt != nil {
			return *item.PublishedAt
		}
		return item.CreatedAt
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Score != result[j].Score {
			return result[i].Score > result[j].Score
		}
		left, right := date(result[i].Listing), date(result[j].Listing)
		if !left.Equal(right) {
			return left.After(right)
		}
		return result[i].Listing.ID > result[j].Listing.ID
	})
	if len(result) > 12 {
		return result[:12]
	}
	return result
}

func (h *Handler) recommendations(c fiber.Ctx, ctx context.Context) error {
	var prefs preference
	view, err := h.Auth.RequireSession(c, ctx)
	if err == nil {
		prefs, err = h.Store.recommendationPreference(ctx, view.Member.ID)
		if err != nil {
			return err
		}
	} else if auth.PublicFailure(err).Status != 401 {
		return err
	}
	items, err := h.Listings.EligibleCandidates(ctx)
	if err != nil {
		return err
	}
	result := rankCandidates(items, prefs)
	for i := range result {
		result[i].Listing.Images, err = h.Images.List(ctx, result[i].Listing.ID, "")
		if err != nil {
			return err
		}
	}
	return c.JSON(fiber.Map{"items": result})
}
