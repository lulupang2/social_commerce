export type Sport = "ski" | "hockey";

export type RecommendationReasonCode =
  | "sport_match"
  | "skill_level_match"
  | "size_match"
  | "price_fair"
  | "recent_listing"
  | "popular_item"
  | "seller_active";

export interface ProfileSportPreference {
  sportId: string;
  sport: Sport;
  skillLevel?: "beginner" | "intermediate" | "advanced" | "expert";
  sizePreferences?: {
    bootMondopointMm?: number;
    footLengthMm?: number;
    skiLengthCm?: number;
    skateSize?: number;
  };
  preferences?: {
    handedness?: "left" | "right";
  };
}

export interface RecommendationListingDetails {
  sport: Sport;
  skillLevel?: string;
  handedness?: string;
  skateSize?: number;
  bootMondopointMm?: number;
  lengthCm?: number;
  [key: string]: unknown;
}

export interface RecommendationListingInput {
  listingId: string;
  sportId: string;
  sport: Sport;
  status: "active";
  createdAt: string;
  updatedAt?: string;
  details: RecommendationListingDetails;
  favoriteCount?: number;
  sellerRating?: number;
}

export interface RecommendationInput {
  profileSports: ProfileSportPreference[];
  listings: RecommendationListingInput[];
  asOf: string;
}

export interface RecommendationItem {
  listingId: string;
  reasonCodes: RecommendationReasonCode[];
  reasonText: string;
  score: number;
}

export interface RecommendationResult {
  source: "rules";
  label: "맞춤 추천";
  generatedAt: string;
  items: RecommendationItem[];
}

const SKILL_LEVEL_RANK: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

const SPORT_LABELS: Record<Sport, string> = {
  ski: "스키",
  hockey: "아이스하키",
};

function isIncompatible(
  listing: RecommendationListingInput,
  matchedSportPref: ProfileSportPreference | null
): boolean {
  if (!matchedSportPref) return false;

  const { skillLevel, sizePreferences, preferences } = matchedSportPref;
  const details = listing.details;
  if (!details) return false;

  if (skillLevel && typeof details.skillLevel === "string") {
    const userRank = SKILL_LEVEL_RANK[skillLevel];
    const listingRank = SKILL_LEVEL_RANK[details.skillLevel];
    if (userRank && listingRank && Math.abs(userRank - listingRank) >= 3) {
      return true;
    }
  }

  if (listing.sport === "hockey") {
    const userHandedness = preferences?.handedness;
    const listingHandedness = details.handedness;
    if (
      userHandedness &&
      typeof listingHandedness === "string" &&
      userHandedness !== listingHandedness
    ) {
      return true;
    }
  }

  if (listing.sport === "hockey" && sizePreferences?.skateSize) {
    const listingSkateSize =
      typeof details.skateSize === "number" ? details.skateSize : undefined;
    if (listingSkateSize !== undefined) {
      if (Math.abs(sizePreferences.skateSize - listingSkateSize) > 2.0) {
        return true;
      }
    }
  }

  if (listing.sport === "ski") {
    const userMondo =
      sizePreferences?.bootMondopointMm ?? sizePreferences?.footLengthMm;
    const listingMondo =
      typeof details.bootMondopointMm === "number"
        ? details.bootMondopointMm
        : undefined;
    if (userMondo !== undefined && listingMondo !== undefined) {
      if (Math.abs(userMondo - listingMondo) > 25) {
        return true;
      }
    }
  }

  if (listing.sport === "ski" && sizePreferences?.skiLengthCm) {
    const listingLength =
      typeof details.lengthCm === "number" ? details.lengthCm : undefined;
    if (listingLength !== undefined) {
      if (Math.abs(sizePreferences.skiLengthCm - listingLength) > 30) {
        return true;
      }
    }
  }

  return false;
}

function buildReasonText(
  codes: RecommendationReasonCode[],
  sport: Sport
): string {
  const sportLabel = SPORT_LABELS[sport] ?? "스포츠";
  const codeSet = new Set(codes);

  if (codeSet.has("sport_match") && codeSet.has("size_match")) {
    return `선호하시는 ${sportLabel} 장비 중 사이즈가 꼭 맞는 추천 상품입니다.`;
  }
  if (codeSet.has("sport_match") && codeSet.has("skill_level_match")) {
    return `선호하시는 ${sportLabel} 장비 중 실력대에 적합한 상품입니다.`;
  }
  if (codeSet.has("sport_match")) {
    return `관심 등록하신 ${sportLabel} 카테고리의 인기 장비입니다.`;
  }
  if (codeSet.has("recent_listing")) {
    return "최근 등록된 추천 상품입니다.";
  }
  return "회원님의 관심 분야를 고려한 추천 상품입니다.";
}

function evaluateListing(
  listing: RecommendationListingInput,
  profileSports: ProfileSportPreference[],
  asOfMs: number
): { listingId: string; score: number; reasonCodes: RecommendationReasonCode[]; reasonText: string; createdAt: string } | null {
  const matchedPref =
    profileSports.find((p) => p.sport === listing.sport) ?? null;

  if (isIncompatible(listing, matchedPref)) {
    return null;
  }

  let rawScore = 30; // base score
  const reasonCodeSet = new Set<RecommendationReasonCode>();

  if (matchedPref) {
    rawScore += 30;
    reasonCodeSet.add("sport_match");

    const details = listing.details;
    if (matchedPref.skillLevel && details?.skillLevel === matchedPref.skillLevel) {
      rawScore += 15;
      reasonCodeSet.add("skill_level_match");
    }

    if (matchedPref.sizePreferences) {
      reasonCodeSet.add("size_match");
      rawScore += 10;
    }
  }

  // Recency bonus
  const createdMs = new Date(listing.createdAt).getTime();
  if (!isNaN(createdMs) && asOfMs - createdMs <= 7 * 24 * 60 * 60 * 1000) {
    rawScore += 10;
    reasonCodeSet.add("recent_listing");
  }

  if (listing.favoriteCount && listing.favoriteCount > 5) {
    rawScore += 5;
    reasonCodeSet.add("popular_item");
  }

  if (reasonCodeSet.size === 0) {
    reasonCodeSet.add("sport_match");
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

export function generateRecommendations(
  input: RecommendationInput,
  options?: { limit?: number }
): RecommendationResult {
  const limit = Math.min(options?.limit ?? 20, 200);
  const asOfDate = new Date(input.asOf).getTime();

  const evaluated: Array<{
    listingId: string;
    score: number;
    reasonCodes: RecommendationReasonCode[];
    reasonText: string;
    createdAt: string;
  }> = [];

  for (const listing of input.listings) {
    const res = evaluateListing(listing, input.profileSports, asOfDate);
    if (res !== null) {
      evaluated.push(res);
    }
  }

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

  const items = evaluated.slice(0, limit).map((item) => ({
    listingId: item.listingId,
    reasonCodes: item.reasonCodes,
    reasonText: item.reasonText,
    score: item.score,
  }));

  return {
    source: "rules",
    label: "맞춤 추천",
    generatedAt: input.asOf,
    items,
  };
}
