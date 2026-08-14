import type {
  RecommendationInput,
  RecommendationListingInput,
  RecommendationProfileSports,
  RecommendationReasonCode,
  RecommendationResult,
} from '@icegear/domain';

/**
 * Adapter interface for recommendation providers.
 * Supports rule-based deterministic processing now and allows swapping or wrapping
 * with remote/external algorithm implementations in the future.
 */
export interface RecommendationProvider {
  recommend(input: RecommendationInput): Promise<RecommendationResult>;
}

export interface RecommendationEngineOptions {
  /** Maximum number of recommendations to return (default 20, max 200). */
  limit?: number;
}

export type {
  RecommendationInput,
  RecommendationItem,
  RecommendationListingInput,
  RecommendationProfileSports,
  RecommendationReasonCode,
  RecommendationResult,
} from '@icegear/domain';
