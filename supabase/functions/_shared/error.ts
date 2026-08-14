import { corsHeaders } from "./cors.ts";

export type ErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "internal_error"
  | "dependency_unavailable";

export function sanitizeErrorMessage(message: string): string {
  let redacted = message;
  // Redact secrets, keys, bearer tokens
  redacted = redacted.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_API_KEY]");
  redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[REDACTED_JWT]");
  return redacted;
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId?: string
): Response {
  const reqId =
    requestId || `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const cleanMessage = sanitizeErrorMessage(message);

  return new Response(
    JSON.stringify({
      error: {
        code,
        message: cleanMessage,
        requestId: reqId,
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}
