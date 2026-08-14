import type {
  RecommendationInput,
  RecommendationItem,
  RecommendationListingInput,
  RecommendationProfileSports,
  RecommendationReasonCode,
  RecommendationResult,
  Sport,
} from '@icegear/domain';
import { RECOMMENDATION_LABEL } from '@icegear/domain';
// @ts-ignore
import type { RecommendationEngineOptions } from './types.ts';

const SKILL_LEVEL_RANK: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

const SPORT_LABELS: Record<Sport, string> = {
  ski: '스키',
  hockey: '아이스하키',
};

interface EvaluatedListing {
  listingId: string;
  score: number;
  reasonCodes: RecommendationReasonCode[];
  reasonText: string;
  createdAt: string;
}

/**
 * Check if the equipment is clearly incompatible with user preferences.
 * Returns true if incompatible (should be excluded).
 */
function isIncompatible(
  listing: RecommendationListingInput,
  matchedSportPref: RecommendationProfileSports[number] | null,
): boolean {
  if (!matchedSportPref) {
    return false;
  }

  const { skillLevel, sizePreferences, preferences } = matchedSportPref;
  const details = listing.details as Record<string, unknown> | undefined;
  if (!details) {
    return false;
  }

  // 1. Skill Level extreme mismatch (e.g. beginner vs expert)
  if (skillLevel && typeof details.skillLevel === 'string') {
    const userRank = SKILL_LEVEL_RANK[skillLevel];
    const listingRank = SKILL_LEVEL_RANK[details.skillLevel];
    if (userRank && listingRank && Math.abs(userRank - listingRank) >= 3) {
      return true;
    }
  }

  // 2. Hockey Handedness mismatch (left vs right)
  if (listing.sport === 'hockey') {
    const userHandedness = preferences?.handedness;
    const listingHandedness = details.handedness;
    if (
      userHandedness &&
      typeof listingHandedness === 'string' &&
      userHandedness !== listingHandedness
    ) {
      return true;
    }
  }

  // 3. Hockey Skate size mismatch (difference > 2.0)
  if (listing.sport === 'hockey' && sizePreferences?.skateSize) {
    const listingSkateSize = typeof details.skateSize === 'number' ? details.skateSize : undefined;
    if (listingSkateSize !== undefined) {
      if (Math.abs(sizePreferences.skateSize - listingSkateSize) > 2.0) {
        return true;
      }
    }
  }

  // 4. Ski Boot Mondopoint size mismatch (difference > 25mm)
  if (listing.sport === 'ski') {
    const userMondo = sizePreferences?.bootMondopointMm ?? sizePreferences?.footLengthMm;
    const listingMondo =
      typeof details.bootMondopointMm === 'number' ? details.bootMondopointMm : undefined;
    if (userMondo !== undefined && listingMondo !== undefined) {
      if (Math.abs(userMondo - listingMondo) > 25) {
        return true;
      }
    }
  }

  // 5. Ski Length mismatch (difference > 30cm)
  if (listing.sport === 'ski' && sizePreferences?.skiLengthCm) {
    const listingLength = typeof details.lengthCm === 'number' ? details.lengthCm : undefined;
    if (listingLength !== undefined) {
      if (Math.abs(sizePreferences.skiLengthCm - listingLength) > 30) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate human-readable Korean explanation text for recommendation reasons.
 */
function buildReasonText(codes: RecommendationReasonCode[], sport: Sport): string {
  const sportLabel = SPORT_LABELS[sport] ?? '스포츠';

  const codeSet = new Set(codes);
  if (codeSet.has('sport_match') && codeSet.has('skill_match') && codeSet.has('size_match')) {
    return `선호하는 ${sportLabel} 종목과 스킬 및 사이즈에 꼭 맞는 장비예요`;
  }
  if (codeSet.has('sport_match') && codeSet.has('skill_match')) {
    return `선호하는 ${sportLabel} 종목과 스킬 레벨에 맞는 추천 장비예요`;
  }
  if (codeSet.has('sport_match') && codeSet.has('size_match')) {
    return `선호하는 ${sportLabel} 종목과 사이즈 정보가 일치하는 장비예요`;
  }
  if (codeSet.has('sport_match') && codeSet.has('preference_match')) {
    return `선호하시는 장비 옵션과 잘 어울리는 ${sportLabel} 장비예요`;
  }
  if (codeSet.has('sport_match') && codeSet.has('condition_match')) {
    return `선호하는 ${sportLabel} 종목의 최상급 상태 장비예요`;
  }
  if (codeSet.has('sport_match')) {
    return `선호하시는 ${sportLabel} 종목 맞춤 추천 장비예요`;
  }
  if (codeSet.has('recent_fallback') && codeSet.has('popular_fallback')) {
    return '최근 등록된 인기 추천 장비예요';
  }
  if (codeSet.has('recent_fallback')) {
    return '방금 올라온 최신 추천 장비예요';
  }
  if (codeSet.has('popular_fallback')) {
    return '많은 이웃들이 찜한 인기 추천 장비예요';
  }

  return '회원님의 선호도에 기반한 맞춤 추천 장비예요';
}

/**
 * Evaluate a single listing against profile sports preferences.
 */
function evaluateListing(
  listing: RecommendationListingInput,
  profileSports: RecommendationProfileSports,
  asOfTimestamp: number,
): EvaluatedListing | null {
  // Find matching sport preference by sportId or by sport type
  const matchedSportPref =
    profileSports.find((p) => p.sportId === listing.sportId) ?? profileSports[0] ?? null;

  // Incompatibility check
  if (isIncompatible(listing, matchedSportPref)) {
    return null;
  }

  let rawScore = 0;
  const reasonCodeSet = new Set<RecommendationReasonCode>();

  const details = (listing.details as Record<string, unknown> | undefined) ?? {};

  // A. Preferred Sport Match
  if (matchedSportPref) {
    reasonCodeSet.add('sport_match');
    rawScore += 30;
  }

  // B. Skill Level Match
  if (matchedSportPref?.skillLevel && typeof details.skillLevel === 'string') {
    const userRank = SKILL_LEVEL_RANK[matchedSportPref.skillLevel];
    const listingRank = SKILL_LEVEL_RANK[details.skillLevel];

    if (userRank && listingRank) {
      const diff = Math.abs(userRank - listingRank);
      if (diff === 0) {
        reasonCodeSet.add('skill_match');
        rawScore += 25;
      } else if (diff === 1) {
        reasonCodeSet.add('skill_match');
        rawScore += 15;
      }
    }
  }

  // C. Size Match
  let sizeMatched = false;
  if (matchedSportPref?.sizePreferences) {
    const sizes = matchedSportPref.sizePreferences;

    // Ski boot mondopoint
    if (listing.sport === 'ski') {
      const userMondo = sizes.bootMondopointMm ?? sizes.footLengthMm;
      const listingMondo =
        typeof details.bootMondopointMm === 'number' ? details.bootMondopointMm : undefined;
      if (userMondo !== undefined && listingMondo !== undefined) {
        if (Math.abs(userMondo - listingMondo) <= 10) {
          sizeMatched = true;
          rawScore += 20;
        }
      }

      if (sizes.skiLengthCm !== undefined && typeof details.lengthCm === 'number') {
        if (Math.abs(sizes.skiLengthCm - details.lengthCm) <= 10) {
          sizeMatched = true;
          rawScore += 15;
        }
      }
    }

    // Hockey skate size
    if (
      listing.sport === 'hockey' &&
      sizes.skateSize !== undefined &&
      typeof details.skateSize === 'number'
    ) {
      if (Math.abs(sizes.skateSize - details.skateSize) <= 0.5) {
        sizeMatched = true;
        rawScore += 20;
      }
    }

    // Apparel size matching
    if (sizes.apparelSize && typeof details.size === 'string') {
      if (sizes.apparelSize.toLowerCase() === details.size.trim().toLowerCase()) {
        sizeMatched = true;
        rawScore += 15;
      }
    }
  }

  if (sizeMatched) {
    reasonCodeSet.add('size_match');
  }

  // D. Equipment Preference Match
  let prefMatched = false;
  if (matchedSportPref?.preferences) {
    const prefs = matchedSportPref.preferences;

    if (listing.sport === 'ski' && prefs.discipline && typeof details.discipline === 'string') {
      if (prefs.discipline === 'all_mountain' || prefs.discipline === details.discipline) {
        prefMatched = true;
        rawScore += 15;
      }
    }

    if (listing.sport === 'hockey') {
      if (prefs.format && typeof details.format === 'string') {
        if (prefs.format === details.format) {
          prefMatched = true;
          rawScore += 15;
        }
      }
      if (prefs.position && typeof details.position === 'string') {
        if (prefs.position === 'any' || prefs.position === details.position) {
          prefMatched = true;
          rawScore += 15;
        }
      }
      if (prefs.handedness && typeof details.handedness === 'string') {
        if (prefs.handedness === details.handedness) {
          prefMatched = true;
          rawScore += 15;
        }
      }
    }
  }

  if (prefMatched) {
    reasonCodeSet.add('preference_match');
  }

  // E. Condition Match
  if (listing.condition === 'new' || listing.condition === 'like_new') {
    reasonCodeSet.add('condition_match');
    rawScore += listing.condition === 'new' ? 10 : 8;
  } else if (listing.condition === 'good') {
    rawScore += 5;
  }

  // F. Fallbacks (Freshness & Popularity)
  const listingCreatedMs = new Date(listing.createdAt).getTime();
  const ageDays = (asOfTimestamp - listingCreatedMs) / (1000 * 60 * 60 * 24);
  const isRecent = !isNaN(ageDays) && ageDays >= 0 && ageDays <= 7;
  const isPopular = listing.favoriteCount > 0;

  if (isRecent) {
    rawScore += Math.max(1, Math.round(10 - ageDays));
  }
  if (isPopular) {
    rawScore += Math.min(listing.favoriteCount * 2, 20);
  }

  // Fallback reason code assignment if preferences matched count is low or empty
  const hasPreferenceMatch =
    reasonCodeSet.has('sport_match') ||
    reasonCodeSet.has('skill_match') ||
    reasonCodeSet.has('size_match') ||
    reasonCodeSet.has('preference_match');

  if (!hasPreferenceMatch) {
    if (isRecent) {
      reasonCodeSet.add('recent_fallback');
    }
    if (isPopular) {
      reasonCodeSet.add('popular_fallback');
    }
  }

  // Guarantee at least one reason code to satisfy Zod schema constraint (.min(1))
  if (reasonCodeSet.size === 0) {
    reasonCodeSet.add(isRecent ? 'recent_fallback' : 'popular_fallback');
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(rawScore)));
  const reasonCodes = Array.from(reasonCodeSet);
  const reasonText = buildReasonText(reasonCodes, listing.sport);

  return {
    listingId: listing.listingId,
    score: finalScore,
    reasonCodes,
    reasonText,
    createdAt: listing.createdAt,
  };
}

/**
 * Side-effect-free deterministic recommendation matching engine.
 *
 * Guarantees identical order and reasons for identical inputs.
 * Tie-breaking invariant:
 *   1. Score descending
 *   2. CreatedAt descending (newest first)
 *   3. Listing ID ascending (lexicographical)
 */
export function generateRecommendations(
  input: RecommendationInput,
  options?: RecommendationEngineOptions,
): RecommendationResult {
  const limit = Math.min(options?.limit ?? 20, 200);
  const asOfDate = new Date(input.asOf).getTime();

  const evaluated: EvaluatedListing[] = [];

  for (const listing of input.listings) {
    const result = evaluateListing(listing, input.profileSports, asOfDate);
    if (result !== null) {
      evaluated.push(result);
    }
  }

  // Deterministic sorting
  evaluated.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.listingId.localeCompare(b.listingId);
  });

  const items: RecommendationItem[] = evaluated.slice(0, limit).map((item) => ({
    listingId: item.listingId,
    reasonCodes: item.reasonCodes,
    reasonText: item.reasonText,
    score: item.score,
  }));

  return {
    source: 'rules',
    label: RECOMMENDATION_LABEL,
    generatedAt: input.asOf,
    items,
  };
}
