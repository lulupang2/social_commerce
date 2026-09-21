export type Sport = "surf" | "tennis";

export const RECOMMENDATION_REASON_CODES = [
  "sport_match",
  "skill_match",
  "size_match",
  "preference_match",
  "condition_match",
  "recent_fallback",
  "popular_fallback",
] as const;

export type RecommendationReasonCode =
  (typeof RECOMMENDATION_REASON_CODES)[number];

export interface ProfileSportPreference {
  sportId: string;
  skillLevel?: "beginner" | "intermediate" | "advanced" | "expert" | null;
  sizePreferences?: {
    shoeSizeMm?: number;
    apparelSize?: string;
    boardLengthFeet?: number;
    volumeLiters?: number;
    wetsuitThickness?: string;
    headSizeSqIn?: number;
    weightGrams?: number;
    gripSize?: string;
  } | null;
  preferences?: {
    surfDiscipline?: string;
    tennisPlayStyle?: string;
    handedness?: "left" | "right";
  } | null;
}

export interface RecommendationListingDetails {
  sport: Sport;
  skillLevel?: string;
  size?: string;
  shoeSizeMm?: number;
  boardLengthFeet?: number;
  volumeLiters?: number;
  wetsuitThickness?: string;
  headSizeSqIn?: number;
  weightGrams?: number;
  gripSize?: string;
  discipline?: string;
  playStyle?: string;
  handedness?: string;
  [key: string]: unknown;
}

export interface RecommendationListingInput {
  listingId: string;
  sportId: string;
  sport: Sport;
  status: "active";
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  createdAt: string;
  favoriteCount: number;
  details: RecommendationListingDetails;
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

interface EvaluatedListing extends RecommendationItem {
  createdAt: string;
}

const SKILL_LEVEL_RANK: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

const SPORT_LABELS: Record<Sport, string> = {
  surf: "서핑",
  tennis: "테니스",
};

function numericDifference(
  preferred: number | undefined,
  actual: unknown,
): number | null {
  return preferred !== undefined && typeof actual === "number" &&
      Number.isFinite(actual)
    ? Math.abs(preferred - actual)
    : null;
}

function normalizedEqual(
  preferred: string | undefined,
  actual: unknown,
): boolean {
  return Boolean(
    preferred &&
      typeof actual === "string" &&
      preferred.trim().toLowerCase() === actual.trim().toLowerCase(),
  );
}

function isIncompatible(
  listing: RecommendationListingInput,
  preference: ProfileSportPreference | null,
): boolean {
  if (!preference) return false;

  const details = listing.details;
  if (preference.skillLevel && typeof details.skillLevel === "string") {
    const preferredRank = SKILL_LEVEL_RANK[preference.skillLevel];
    const listingRank = SKILL_LEVEL_RANK[details.skillLevel];
    if (
      preferredRank && listingRank && Math.abs(preferredRank - listingRank) >= 3
    ) {
      return true;
    }
  }

  const sizes = preference.sizePreferences;
  if (!sizes) return false;

  const shoeDifference = numericDifference(
    sizes.shoeSizeMm,
    details.shoeSizeMm,
  );
  if (shoeDifference !== null && shoeDifference > 30) return true;

  if (listing.sport === "surf") {
    const lengthDifference = numericDifference(
      sizes.boardLengthFeet,
      details.boardLengthFeet,
    );
    const volumeDifference = numericDifference(
      sizes.volumeLiters,
      details.volumeLiters,
    );
    if (lengthDifference !== null && lengthDifference > 3) return true;
    if (volumeDifference !== null && volumeDifference > 35) return true;
  }

  if (listing.sport === "tennis") {
    const headDifference = numericDifference(
      sizes.headSizeSqIn,
      details.headSizeSqIn,
    );
    const weightDifference = numericDifference(
      sizes.weightGrams,
      details.weightGrams,
    );
    if (headDifference !== null && headDifference > 25) return true;
    if (weightDifference !== null && weightDifference > 80) return true;
  }

  return false;
}

function evaluateSizeMatch(
  listing: RecommendationListingInput,
  preference: ProfileSportPreference | null,
): { matched: boolean; score: number } {
  const sizes = preference?.sizePreferences;
  if (!sizes) return { matched: false, score: 0 };

  const details = listing.details;
  let compared = 0;
  let matched = 0;

  const compareNumber = (
    preferred: number | undefined,
    actual: unknown,
    tolerance: number,
  ) => {
    const difference = numericDifference(preferred, actual);
    if (difference === null) return;
    compared += 1;
    if (difference <= tolerance) matched += 1;
  };
  const compareText = (preferred: string | undefined, actual: unknown) => {
    if (!preferred || typeof actual !== "string") return;
    compared += 1;
    if (normalizedEqual(preferred, actual)) matched += 1;
  };

  compareNumber(sizes.shoeSizeMm, details.shoeSizeMm, 10);
  compareText(sizes.apparelSize, details.size);

  if (listing.sport === "surf") {
    compareNumber(sizes.boardLengthFeet, details.boardLengthFeet, 1);
    compareNumber(sizes.volumeLiters, details.volumeLiters, 10);
    compareText(sizes.wetsuitThickness, details.wetsuitThickness);
  } else {
    compareNumber(sizes.headSizeSqIn, details.headSizeSqIn, 5);
    compareNumber(sizes.weightGrams, details.weightGrams, 20);
    compareText(sizes.gripSize, details.gripSize);
  }

  if (compared === 0 || matched === 0) return { matched: false, score: 0 };
  return { matched: true, score: Math.min(25, 10 + matched * 5) };
}

function hasEquipmentPreferenceMatch(
  listing: RecommendationListingInput,
  preference: ProfileSportPreference | null,
): boolean {
  const preferences = preference?.preferences;
  if (!preferences) return false;

  if (listing.sport === "surf") {
    return normalizedEqual(
      preferences.surfDiscipline,
      listing.details.discipline,
    );
  }

  return (
    normalizedEqual(preferences.tennisPlayStyle, listing.details.playStyle) ||
    normalizedEqual(preferences.handedness, listing.details.handedness)
  );
}

function buildReasonText(
  codes: RecommendationReasonCode[],
  sport: Sport,
): string {
  const sportLabel = SPORT_LABELS[sport];
  const codeSet = new Set(codes);

  if (
    codeSet.has("sport_match") && codeSet.has("skill_match") &&
    codeSet.has("size_match")
  ) {
    return `선호하는 ${sportLabel} 종목과 실력, 사이즈에 잘 맞는 장비예요.`;
  }
  if (codeSet.has("sport_match") && codeSet.has("size_match")) {
    return `찾는 사이즈와 가까운 ${sportLabel} 장비예요.`;
  }
  if (codeSet.has("sport_match") && codeSet.has("preference_match")) {
    return `선호하는 플레이 성향에 맞는 ${sportLabel} 장비예요.`;
  }
  if (codeSet.has("sport_match") && codeSet.has("skill_match")) {
    return `현재 실력대에 잘 맞는 ${sportLabel} 장비예요.`;
  }
  if (codeSet.has("sport_match")) {
    return `관심 종목으로 설정한 ${sportLabel} 장비예요.`;
  }
  if (codeSet.has("recent_fallback") && codeSet.has("popular_fallback")) {
    return "최근 등록되어 많은 관심을 받은 장비예요.";
  }
  if (codeSet.has("recent_fallback")) return "최근 등록된 장비예요.";
  return "많은 이웃이 관심을 보인 장비예요.";
}

function evaluateListing(
  listing: RecommendationListingInput,
  profileSports: ProfileSportPreference[],
  asOfMs: number,
): EvaluatedListing | null {
  const preference =
    profileSports.find((item) => item.sportId === listing.sportId) ?? null;
  if (isIncompatible(listing, preference)) return null;

  let score = 0;
  const reasons = new Set<RecommendationReasonCode>();

  if (preference) {
    score += 30;
    reasons.add("sport_match");

    if (
      preference.skillLevel && typeof listing.details.skillLevel === "string"
    ) {
      const preferredRank = SKILL_LEVEL_RANK[preference.skillLevel];
      const listingRank = SKILL_LEVEL_RANK[listing.details.skillLevel];
      if (preferredRank && listingRank) {
        const difference = Math.abs(preferredRank - listingRank);
        if (difference <= 1) {
          score += difference === 0 ? 20 : 12;
          reasons.add("skill_match");
        }
      }
    }

    const sizeMatch = evaluateSizeMatch(listing, preference);
    if (sizeMatch.matched) {
      score += sizeMatch.score;
      reasons.add("size_match");
    }

    if (hasEquipmentPreferenceMatch(listing, preference)) {
      score += 15;
      reasons.add("preference_match");
    }
  }

  if (listing.condition === "new" || listing.condition === "like_new") {
    score += listing.condition === "new" ? 10 : 8;
    reasons.add("condition_match");
  } else if (listing.condition === "good") {
    score += 4;
  }

  const createdAtMs = new Date(listing.createdAt).getTime();
  const ageDays = (asOfMs - createdAtMs) / 86_400_000;
  const recent = Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 7;
  const popular = listing.favoriteCount > 0;

  if (recent) score += Math.max(1, Math.round(10 - ageDays));
  if (popular) score += Math.min(20, listing.favoriteCount * 2);

  if (!preference) {
    if (recent) reasons.add("recent_fallback");
    if (popular) reasons.add("popular_fallback");
  }
  if (reasons.size === 0) {
    reasons.add(recent ? "recent_fallback" : "popular_fallback");
  }

  const reasonCodes = Array.from(reasons);
  return {
    listingId: listing.listingId,
    score: Math.min(100, Math.max(0, Math.round(score))),
    reasonCodes,
    reasonText: buildReasonText(reasonCodes, listing.sport),
    createdAt: listing.createdAt,
  };
}

export function generateRecommendations(
  input: RecommendationInput,
  options?: { limit?: number },
): RecommendationResult {
  const limit = Math.min(Math.max(options?.limit ?? 20, 0), 200);
  const asOfMs = new Date(input.asOf).getTime();

  const items = input.listings
    .map((listing) => evaluateListing(listing, input.profileSports, asOfMs))
    .filter((item): item is EvaluatedListing => item !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const timeDifference = new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime();
      return timeDifference || left.listingId.localeCompare(right.listingId);
    })
    .slice(0, limit)
    .map(({ createdAt: _createdAt, ...item }) => item);

  return {
    source: "rules",
    label: "맞춤 추천",
    generatedAt: input.asOf,
    items,
  };
}
