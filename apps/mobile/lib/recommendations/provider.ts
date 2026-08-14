import type {
  HockeyEquipmentType,
  HockeyFormat,
  HockeyPosition,
  Handedness,
  Listing,
  RecommendationInput,
  RecommendationListingInput,
  RecommendationProfileSports,
  RecommendationResult,
  SkiDiscipline,
  SkiEquipmentType,
  SportListingDetails,
} from '@icegear/domain';
// @ts-ignore
import { generateRecommendations } from './engine.ts';
// @ts-ignore
import type { RecommendationEngineOptions, RecommendationProvider } from './types.ts';

/**
 * Adapt a mobile `Listing` domain object to `RecommendationListingInput`.
 * Ensures safe fallback and correct discriminated union shape.
 */
export function adaptListingToRecommendationInput(listing: Listing): RecommendationListingInput {
  const details = (listing.details ?? {}) as Record<string, unknown>;
  const extListing = listing as unknown as Listing & {
    sportId?: string;
    favoriteCount?: number;
  };

  const base = {
    listingId: listing.id,
    sportId: extListing.sportId ?? listing.id,
    status: listing.status as 'active',
    condition: listing.condition,
    createdAt: listing.createdAt,
    favoriteCount: extListing.favoriteCount ?? 0,
  };
  if (listing.sport === 'ski') {
    const skiDetails: SportListingDetails = {
      sport: 'ski',
      brand: typeof details.brand === 'string' ? details.brand : undefined,
      model: typeof details.model === 'string' ? details.model : undefined,
      year: typeof details.year === 'number' ? details.year : undefined,
      size: typeof details.size === 'string' ? details.size : undefined,
      gender:
        details.gender === 'men' ||
        details.gender === 'women' ||
        details.gender === 'unisex' ||
        details.gender === 'youth'
          ? details.gender
          : undefined,
      skillLevel:
        details.skillLevel === 'beginner' ||
        details.skillLevel === 'intermediate' ||
        details.skillLevel === 'advanced' ||
        details.skillLevel === 'expert'
          ? details.skillLevel
          : undefined,
      notes: typeof details.notes === 'string' ? details.notes : undefined,
      equipmentType:
        typeof details.equipmentType === 'string'
          ? (details.equipmentType as SkiEquipmentType)
          : undefined,
      discipline:
        typeof details.discipline === 'string' ? (details.discipline as SkiDiscipline) : undefined,
      lengthCm: typeof details.lengthCm === 'number' ? details.lengthCm : undefined,
      waistWidthMm: typeof details.waistWidthMm === 'number' ? details.waistWidthMm : undefined,
      radiusM: typeof details.radiusM === 'number' ? details.radiusM : undefined,
      bootMondopointMm:
        typeof details.bootMondopointMm === 'number' ? details.bootMondopointMm : undefined,
      bootFlex: typeof details.bootFlex === 'number' ? details.bootFlex : undefined,
      bindingIncluded:
        typeof details.bindingIncluded === 'boolean' ? details.bindingIncluded : undefined,
    };
    return {
      ...base,
      sport: 'ski',
      details: skiDetails,
    };
  }

  const hockeyDetails: SportListingDetails = {
    sport: 'hockey',
    brand: typeof details.brand === 'string' ? details.brand : undefined,
    model: typeof details.model === 'string' ? details.model : undefined,
    year: typeof details.year === 'number' ? details.year : undefined,
    size: typeof details.size === 'string' ? details.size : undefined,
    gender:
      details.gender === 'men' ||
      details.gender === 'women' ||
      details.gender === 'unisex' ||
      details.gender === 'youth'
        ? details.gender
        : undefined,
    skillLevel:
      details.skillLevel === 'beginner' ||
      details.skillLevel === 'intermediate' ||
      details.skillLevel === 'advanced' ||
      details.skillLevel === 'expert'
        ? details.skillLevel
        : undefined,
    notes: typeof details.notes === 'string' ? details.notes : undefined,
    equipmentType:
      typeof details.equipmentType === 'string'
        ? (details.equipmentType as HockeyEquipmentType)
        : undefined,
    format: typeof details.format === 'string' ? (details.format as HockeyFormat) : undefined,
    position:
      typeof details.position === 'string' ? (details.position as HockeyPosition) : undefined,
    handedness:
      typeof details.handedness === 'string' ? (details.handedness as Handedness) : undefined,
    stickFlex: typeof details.stickFlex === 'number' ? details.stickFlex : undefined,
    stickLengthCm: typeof details.stickLengthCm === 'number' ? details.stickLengthCm : undefined,
    curve: typeof details.curve === 'string' ? details.curve : undefined,
    kickPoint: typeof details.kickPoint === 'string' ? details.kickPoint : undefined,
    skateSize: typeof details.skateSize === 'number' ? details.skateSize : undefined,
    skateWidth: typeof details.skateWidth === 'string' ? details.skateWidth : undefined,
  };

  return {
    ...base,
    sport: 'hockey',
    details: hockeyDetails,
  };
}

/**
 * Adapt a user profile (or empty profile) to `RecommendationProfileSports`.
 */
export function adaptProfileToRecommendationSports(
  profileSportsInput: unknown,
): RecommendationProfileSports {
  if (!Array.isArray(profileSportsInput)) {
    return [];
  }

  const validSports: RecommendationProfileSports = [];
  const seenSportIds = new Set<string>();

  for (const item of profileSportsInput) {
    if (
      item &&
      typeof item === 'object' &&
      'sportId' in item &&
      typeof item.sportId === 'string' &&
      !seenSportIds.has(item.sportId)
    ) {
      seenSportIds.add(item.sportId);
      validSports.push({
        sportId: item.sportId,
        skillLevel: typeof item.skillLevel === 'string' ? item.skillLevel : null,
        sizePreferences: item.sizePreferences ?? null,
        preferences: item.preferences ?? null,
      });
    }
  }

  return validSports;
}

/**
 * Deterministic rule-based implementation of `RecommendationProvider`.
 */
export class RuleBasedRecommendationProvider implements RecommendationProvider {
  private readonly defaultOptions?: RecommendationEngineOptions;

  constructor(defaultOptions?: RecommendationEngineOptions) {
    this.defaultOptions = defaultOptions;
  }
  async recommend(
    input: RecommendationInput,
    options?: RecommendationEngineOptions,
  ): Promise<RecommendationResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    return generateRecommendations(input, mergedOptions);
  }

  async recommendForListings(
    listings: readonly Listing[],
    profileSports: unknown,
    asOf?: string,
    options?: RecommendationEngineOptions,
  ): Promise<RecommendationResult> {
    const inputListings = listings
      .filter((l) => l.status === 'active')
      .map(adaptListingToRecommendationInput);

    const inputProfileSports = adaptProfileToRecommendationSports(profileSports);

    const input: RecommendationInput = {
      profileSports: inputProfileSports,
      listings: inputListings,
      asOf: asOf ?? new Date().toISOString(),
    };

    return this.recommend(input, options);
  }
}

export const defaultRecommendationProvider = new RuleBasedRecommendationProvider();
