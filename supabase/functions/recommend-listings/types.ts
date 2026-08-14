import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedSubject } from "../_shared/auth.ts";
import type { QuotaCheckResult } from "../_shared/quota.ts";
import type {
  RecommendationInput,
  RecommendationResult,
} from "../_shared/recommendation_rules.ts";
import type { CallAiResult } from "../_shared/openai.ts";

export interface Dependencies {
  getSupabaseClient?: (req: Request) => SupabaseClient;
  authenticateSubject?: (
    req: Request,
    client: SupabaseClient
  ) => Promise<{
    subject: AuthenticatedSubject | null;
    errorResponse: { code: "authentication_required" | "forbidden"; message: string; status: number } | null;
  }>;
  checkAndConsumeQuota?: (
    client: SupabaseClient,
    operation: "recommend-listings" | "analyze-listing"
  ) => Promise<QuotaCheckResult>;
  callAiModel?: <T>(
    options: unknown,
    validateJson: (parsed: unknown) => T | null
  ) => Promise<CallAiResult<T>>;
}

export interface RecommendListingsResponse {
  source: "ai" | "rules";
  label: "맞춤 추천";
  generatedAt: string;
  items: Array<{
    listingId: string;
    reasonCodes: string[];
    reasonText: string;
    score?: number;
  }>;
  fallback: boolean;
  fallbackReason?: string;
  model?: string;
}
