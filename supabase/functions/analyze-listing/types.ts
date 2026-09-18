import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedSubject } from "../_shared/auth.ts";
import type { QuotaCheckResult } from "../_shared/quota.ts";
import type { CallAiResult } from "../_shared/openai.ts";

export interface Dependencies {
  getSupabaseClient?: (req: Request) => SupabaseClient;
  authenticateSubject?: (
    req: Request,
    client: SupabaseClient,
  ) => Promise<{
    subject: AuthenticatedSubject | null;
    errorResponse: {
      code: "authentication_required" | "forbidden";
      message: string;
      status: number;
    } | null;
  }>;
  checkAndConsumeQuota?: (
    client: SupabaseClient,
    operation: "recommend-listings" | "analyze-listing",
  ) => Promise<QuotaCheckResult>;
  createSignedUrl?: (
    client: SupabaseClient,
    bucket: string,
    path: string,
    expiresIn: number,
  ) => Promise<{ signedUrl: string | null; error: Error | null }>;
  callAiModel?: <T>(
    options: unknown,
    validateJson: (parsed: unknown) => T | null,
  ) => Promise<CallAiResult<T>>;
}

export interface AnalyzeListingRequest {
  storagePath: string;
  bucket?: string;
  mimeType: string;
  fileSize: number;
  sport?: "surf" | "tennis" | "other";
}

export interface SuggestedListing {
  category:
    | "equipment"
    | "apparel"
    | "footwear"
    | "protective"
    | "accessories"
    | "other";
  sport: "surf" | "tennis" | "other";
  title: string;
  description: string;
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  estimatedPrice: { amount: number; currency: string } | null;
  details: Record<string, unknown>;
  confidence: number;
}

export interface AnalyzeListingResponse {
  success: boolean;
  source: "ai" | "manual_entry_fallback";
  allowManualEntry: true;
  fallback: boolean;
  fallbackReason?: string;
  model?: string;
  privacyNotice: string;
  suggestedListing: SuggestedListing;
}
