import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/error.ts";
import { authenticateSubject } from "../_shared/auth.ts";
import { checkAndConsumeQuota } from "../_shared/quota.ts";
import {
  callOpenAiChatCompletions,
  getEffectiveAiConfig,
} from "../_shared/openai.ts";
import type {
  AnalyzeListingRequest,
  AnalyzeListingResponse,
  Dependencies,
  SuggestedListing,
} from "./types.ts";

const ALLOWED_MIME_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/jpg": true,
  "image/png": true,
  "image/webp": true,
  "image/heic": true,
};

const VALID_CATEGORIES: Record<SuggestedListing["category"], true> = {
  equipment: true,
  apparel: true,
  footwear: true,
  protective: true,
  accessories: true,
  other: true,
};

const VALID_CONDITIONS: Record<SuggestedListing["condition"], true> = {
  new: true,
  like_new: true,
  good: true,
  fair: true,
  poor: true,
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const PRIVACY_NOTICE =
  "Zero retention & privacy: Image analyzed in single-pass mode only. No permanent storage or model training retention.";

function validateRequestPayload(body: unknown): AnalyzeListingRequest | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  if (
    typeof obj.storagePath !== "string" || obj.storagePath.trim().length === 0
  ) {
    return null;
  }
  if (
    typeof obj.mimeType !== "string" ||
    ALLOWED_MIME_TYPES[obj.mimeType.toLowerCase()] !== true
  ) {
    return null;
  }
  if (
    typeof obj.fileSize !== "number" || obj.fileSize <= 0 ||
    obj.fileSize > MAX_FILE_SIZE_BYTES
  ) {
    return null;
  }

  const bucket = typeof obj.bucket === "string"
    ? obj.bucket.trim()
    : "listing-images";
  const sport =
    (obj.sport === "surf" || obj.sport === "tennis" || obj.sport === "other")
      ? obj.sport
      : "other";

  return {
    storagePath: obj.storagePath.trim(),
    bucket,
    mimeType: obj.mimeType.toLowerCase(),
    fileSize: obj.fileSize,
    sport,
  };
}

function validateAiVisionOutput(
  parsed: unknown,
  defaultSport: string,
): SuggestedListing | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const suggestion = (obj.suggestedListing || obj) as Record<string, unknown>;

  const category = (
      typeof suggestion.category === "string" &&
      VALID_CATEGORIES[suggestion.category as SuggestedListing["category"]] ===
        true
    )
    ? (suggestion.category as SuggestedListing["category"])
    : "equipment";

  const sport = (
      suggestion.sport === "surf" ||
      suggestion.sport === "tennis" ||
      suggestion.sport === "other"
    )
    ? suggestion.sport
    : (defaultSport === "surf" || defaultSport === "tennis"
      ? defaultSport
      : "other");

  const title = typeof suggestion.title === "string"
    ? suggestion.title.slice(0, 160)
    : "";
  const description = typeof suggestion.description === "string"
    ? suggestion.description.slice(0, 2000)
    : "";

  const condition = (
      typeof suggestion.condition === "string" &&
      VALID_CONDITIONS[
          suggestion.condition as SuggestedListing["condition"]
        ] === true
    )
    ? (suggestion.condition as SuggestedListing["condition"])
    : "good";

  let estimatedPrice: SuggestedListing["estimatedPrice"] = null;
  if (
    suggestion.estimatedPrice && typeof suggestion.estimatedPrice === "object"
  ) {
    const priceObj = suggestion.estimatedPrice as Record<string, unknown>;
    if (typeof priceObj.amount === "number" && priceObj.amount >= 0) {
      estimatedPrice = {
        amount: Math.round(priceObj.amount),
        currency: typeof priceObj.currency === "string"
          ? priceObj.currency.toUpperCase()
          : "KRW",
      };
    }
  }

  const details = (suggestion.details && typeof suggestion.details === "object")
    ? (suggestion.details as Record<string, unknown>)
    : {};

  const confidence = typeof suggestion.confidence === "number"
    ? Math.min(1.0, Math.max(0.0, suggestion.confidence))
    : 0.8;

  return {
    category,
    sport,
    title,
    description,
    condition,
    estimatedPrice,
    details,
    confidence,
  };
}

function buildManualEntryFallback(sportHint?: string): SuggestedListing {
  const sport = (sportHint === "surf" || sportHint === "tennis")
    ? sportHint
    : "other";
  return {
    category: "equipment",
    sport,
    title: "",
    description: "",
    condition: "good",
    estimatedPrice: null,
    details: {},
    confidence: 0,
  };
}

export async function handleAnalyzeListing(
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
  const quotaResult = await quotaFn(supabaseClient, "analyze-listing");
  if (quotaResult.errorResponse) {
    return createErrorResponse(
      quotaResult.errorResponse.code,
      quotaResult.errorResponse.message,
      quotaResult.errorResponse.status,
    );
  }

  // 3. Parse and validate payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse("invalid_request", "Invalid JSON payload", 400);
  }

  const payload = validateRequestPayload(body);
  if (!payload) {
    return createErrorResponse(
      "invalid_request",
      "Invalid payload. Required: storagePath (string), mimeType (jpeg|png|webp|heic), fileSize (number <= 10MB)",
      400,
    );
  }

  // 4. Validate object path ownership
  // storagePath MUST start with `${subject.userId}/` to verify user owns the private object!
  const userPrefix = `${subject.userId}/`;
  if (!payload.storagePath.startsWith(userPrefix)) {
    return createErrorResponse(
      "forbidden",
      "Access denied. Cannot analyze storage object path owned by another user subject.",
      403,
    );
  }

  // 5. Short-lived server read for image
  let signedUrl: string | null = null;
  if (deps.createSignedUrl) {
    const res = await deps.createSignedUrl(
      supabaseClient,
      payload.bucket || "listing-images",
      payload.storagePath,
      60,
    );
    signedUrl = res.signedUrl;
  } else {
    try {
      const { data, error } = await supabaseClient.storage
        .from(payload.bucket || "listing-images")
        .createSignedUrl(payload.storagePath, 60);
      if (!error && data?.signedUrl) {
        signedUrl = data.signedUrl;
      }
    } catch {
      signedUrl = null;
    }
  }

  const aiConfig = getEffectiveAiConfig();

  // 6. Try AI Vision Model analysis if API key is present and signedUrl is valid
  if (aiConfig.apiKeyPresent && signedUrl) {
    const systemPrompt =
      `You are a SummerGear image analyzer for surf and tennis equipment. Analyze the provided gear image and return JSON matching: {"suggestedListing": {"category": "equipment"|"apparel"|"footwear"|"protective"|"accessories"|"other", "sport": "surf"|"tennis"|"other", "title": string, "description": string, "condition": "new"|"like_new"|"good"|"fair"|"poor", "estimatedPrice": {"amount": number, "currency": "KRW"}, "details": object, "confidence": number (0-1)}}. For surf details use equipmentType, discipline, boardLengthFeet, volumeLiters, finSystem, wetsuitThickness. For tennis details use equipmentType, playStyle, handedness, headSizeSqIn, weightGrams, gripSize, stringPattern, strung. Delete image input after one inference; do not retain it or use it for training.`;

    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text:
              `Analyze this sports gear image for a user listing. Sport hint: ${payload.sport}`,
          },
          { type: "image_url" as const, image_url: { url: signedUrl } },
        ],
      },
    ];

    const callAiFn = deps.callAiModel ?? callOpenAiChatCompletions;
    const aiResult = await callAiFn(
      {
        systemPrompt,
        messages,
        maxTokens: 1000,
        timeoutMs: 12000,
        maxRetries: 2,
      },
      (parsed) => validateAiVisionOutput(parsed, payload.sport || "other"),
    );

    if (aiResult.success && aiResult.data) {
      const responsePayload: AnalyzeListingResponse = {
        success: true,
        source: "ai",
        allowManualEntry: true,
        fallback: false,
        model: aiResult.model,
        privacyNotice: PRIVACY_NOTICE,
        suggestedListing: aiResult.data,
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

  // 7. Manual Entry Fallback
  const fallbackReason = !aiConfig.apiKeyPresent
    ? "unconfigured_api_key"
    : (!signedUrl ? "storage_read_failed" : "ai_vision_failed");

  const fallbackPayload: AnalyzeListingResponse = {
    success: true,
    source: "manual_entry_fallback",
    allowManualEntry: true,
    fallback: true,
    fallbackReason,
    privacyNotice: PRIVACY_NOTICE,
    suggestedListing: buildManualEntryFallback(payload.sport),
  };

  return new Response(JSON.stringify(fallbackPayload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
