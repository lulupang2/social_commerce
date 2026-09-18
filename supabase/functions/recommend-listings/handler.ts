import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/error.ts";
import { authenticateSubject } from "../_shared/auth.ts";
import { checkAndConsumeQuota } from "../_shared/quota.ts";
import {
  callOpenAiChatCompletions,
  getEffectiveAiConfig,
} from "../_shared/openai.ts";
import {
  generateRecommendations,
  RECOMMENDATION_REASON_CODES,
} from "../_shared/recommendation_rules.ts";
import type {
  RecommendationInput,
  RecommendationItem,
  RecommendationReasonCode,
} from "../_shared/recommendation_rules.ts";
import type { Dependencies, RecommendListingsResponse } from "./types.ts";

function validateInput(body: unknown): RecommendationInput | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (
    !Array.isArray(obj.profileSports) || !Array.isArray(obj.listings) ||
    typeof obj.asOf !== "string"
  ) {
    return null;
  }

  // Validate timestamp
  if (isNaN(new Date(obj.asOf).getTime())) return null;

  // Max listings count safety cap
  if (obj.listings.length > 200) return null;

  return body as RecommendationInput;
}

function validateAiOutput(
  parsed: unknown,
  inputListingIds: Set<string>,
): RecommendationItem[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return null;

  const validItems: RecommendationItem[] = [];
  const seenListingIds = new Set<string>();

  for (const item of obj.items) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;

    if (
      typeof it.listingId !== "string" || !inputListingIds.has(it.listingId)
    ) {
      continue; // Filter out invented listing IDs!
    }
    if (seenListingIds.has(it.listingId)) continue;
    seenListingIds.add(it.listingId);

    if (!Array.isArray(it.reasonCodes) || typeof it.reasonText !== "string") {
      continue;
    }
    const reasonCodes = it.reasonCodes.filter(
      (code): code is RecommendationReasonCode =>
        typeof code === "string" &&
        RECOMMENDATION_REASON_CODES.includes(code as RecommendationReasonCode),
    );
    if (reasonCodes.length === 0 || it.reasonText.trim().length === 0) continue;
    const score = typeof it.score === "number"
      ? Math.min(100, Math.max(0, Math.round(it.score)))
      : 50;

    validItems.push({
      listingId: it.listingId,
      reasonCodes,
      reasonText: it.reasonText.trim().slice(0, 160),
      score,
    });
  }

  return validItems;
}

export async function handleRecommendListings(
  req: Request,
  deps: Dependencies = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createErrorResponse(
      "invalid_request",
      "Method not allowed. Use POST.",
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ||
    "https://example.supabase.co";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "mock-anon-key";

  const supabaseClient = deps.getSupabaseClient
    ? deps.getSupabaseClient(req)
    : createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") || "",
        },
      },
    });

  // 1. Authenticate subject
  const authFn = deps.authenticateSubject ?? authenticateSubject;
  const { subject, errorResponse: authError } = await authFn(
    req,
    supabaseClient,
  );
  if (authError) {
    return createErrorResponse(
      authError.code,
      authError.message,
      authError.status,
    );
  }
  if (!subject) {
    return createErrorResponse(
      "authentication_required",
      "Subject authentication required",
      401,
    );
  }

  // 2. Consume persistent quota
  const quotaFn = deps.checkAndConsumeQuota ?? checkAndConsumeQuota;
  const quotaResult = await quotaFn(supabaseClient, "recommend-listings");
  if (quotaResult.errorResponse) {
    return createErrorResponse(
      quotaResult.errorResponse.code,
      quotaResult.errorResponse.message,
      quotaResult.errorResponse.status,
    );
  }

  // 3. Parse and validate body payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse("invalid_request", "Invalid JSON payload", 400);
  }

  const input = validateInput(body);
  if (!input) {
    return createErrorResponse(
      "invalid_request",
      "Invalid recommendation input schema. Required: profileSports (array), listings (array max 200), asOf (ISO string)",
      400,
    );
  }

  const aiConfig = getEffectiveAiConfig();
  const inputListingIds = new Set(input.listings.map((l) => l.listingId));

  // 4. Try AI recommendation if API key is present
  if (aiConfig.apiKeyPresent) {
    const systemPrompt =
      `You are a SummerGear recommendation engine for surf and tennis equipment. Select and score listings from the provided input only. Return JSON matching: {"items": [{"listingId": string, "reasonCodes": ["sport_match"|"skill_match"|"size_match"|"preference_match"|"condition_match"|"recent_fallback"|"popular_fallback"], "reasonText": string (natural Korean, max 160 chars), "score": number (0-100)}]}. Never invent listing IDs or reason codes.`;
    const userPrompt = JSON.stringify({
      userPreferences: input.profileSports,
      availableListings: input.listings.map((l) => ({
        listingId: l.listingId,
        sport: l.sport,
        details: l.details,
        createdAt: l.createdAt,
      })),
      asOf: input.asOf,
    });

    const callAiFn = deps.callAiModel ?? callOpenAiChatCompletions;
    const aiResult = await callAiFn(
      {
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1000,
        timeoutMs: 10000,
        maxRetries: 2,
      },
      (parsed) => validateAiOutput(parsed, inputListingIds),
    );

    if (aiResult.success && aiResult.data && aiResult.data.length > 0) {
      const responsePayload: RecommendListingsResponse = {
        source: "ai",
        label: "맞춤 추천",
        generatedAt: input.asOf,
        items: aiResult.data,
        fallback: false,
        model: aiResult.model,
      };

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }
  }

  // 5. Fallback to T40 deterministic rule engine
  const rulesResult = generateRecommendations(input);
  const fallbackReason = aiConfig.apiKeyPresent
    ? "ai_execution_failed"
    : "unconfigured_api_key";

  const fallbackPayload: RecommendListingsResponse = {
    source: "rules",
    label: "맞춤 추천",
    generatedAt: input.asOf,
    items: rulesResult.items,
    fallback: true,
    fallbackReason,
  };

  return new Response(JSON.stringify(fallbackPayload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
