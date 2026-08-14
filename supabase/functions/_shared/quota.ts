import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
  limitValue: number;
  windowSeconds: number;
  errorResponse: { code: "rate_limited" | "internal_error"; message: string; status: number } | null;
}

export async function checkAndConsumeQuota(
  supabaseClient: SupabaseClient,
  operation: "recommend-listings" | "analyze-listing"
): Promise<QuotaCheckResult> {
  const { data, error } = await supabaseClient.rpc("consume_edge_function_quota", {
    p_operation: operation,
  });

  if (error) {
    // If user is banned or unauthorized, Postgres exception is raised
    const isRateLimited = error.message?.includes("quota") || error.code === "P0001";
    return {
      allowed: false,
      remaining: 0,
      resetAt: null,
      limitValue: 0,
      windowSeconds: 0,
      errorResponse: {
        code: isRateLimited ? "rate_limited" : "rate_limited",
        message: `Persistent quota consumption failed: ${error.message || "Quota limit reached"}`,
        status: 429,
      },
    };
  }

  // data is an array or object returned by plpgsql function
  const quotaRow = Array.isArray(data) ? data[0] : data;
  if (!quotaRow) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: null,
      limitValue: 0,
      windowSeconds: 0,
      errorResponse: {
        code: "rate_limited",
        message: "No quota record returned",
        status: 429,
      },
    };
  }

  const allowed = Boolean(quotaRow.allowed);
  const remaining = Number(quotaRow.remaining ?? 0);
  const resetAt = quotaRow.reset_at ? String(quotaRow.reset_at) : null;
  const limitValue = Number(quotaRow.limit_value ?? 0);
  const windowSeconds = Number(quotaRow.window_seconds ?? 0);

  if (!allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limitValue,
      windowSeconds,
      errorResponse: {
        code: "rate_limited",
        message: `Persistent quota exceeded for operation '${operation}'. Remaining: 0`,
        status: 429,
      },
    };
  }

  return {
    allowed: true,
    remaining,
    resetAt,
    limitValue,
    windowSeconds,
    errorResponse: null,
  };
}
