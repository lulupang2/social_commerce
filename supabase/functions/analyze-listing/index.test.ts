import { assertEquals } from "@std/assert";
import { handleAnalyzeListing } from "./handler.ts";
import type { Dependencies } from "./types.ts";

const VALID_USER_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "20000000-0000-4000-8000-000000000002";

function createMockDeps(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    authenticateSubject: async (req: Request) => {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return {
          subject: null,
          errorResponse: {
            code: "authentication_required",
            message: "Token required",
            status: 401,
          },
        };
      }
      const token = authHeader.substring(7);
      if (token === "banned-token") {
        return {
          subject: null,
          errorResponse: {
            code: "forbidden",
            message: "Banned user",
            status: 403,
          },
        };
      }
      if (token === "valid-token") {
        return {
          subject: { userId: VALID_USER_ID, role: "user", isBanned: false },
          errorResponse: null,
        };
      }
      return {
        subject: null,
        errorResponse: {
          code: "authentication_required",
          message: "Invalid token",
          status: 401,
        },
      };
    },
    checkAndConsumeQuota: async (_client, _op) => {
      return {
        allowed: true,
        remaining: 2,
        resetAt: new Date().toISOString(),
        limitValue: 3,
        windowSeconds: 300,
        errorResponse: null,
      };
    },
    createSignedUrl: async (_client, _bucket, _path, _expiresIn) => {
      return {
        signedUrl:
          "https://example.supabase.co/storage/v1/object/sign/listing-images/sample.jpg?token=123",
        error: null,
      };
    },
    callAiModel: async (_opts, validateJson) => {
      const mockVisionOutput = {
        suggestedListing: {
          category: "equipment",
          sport: "surf",
          title: "Channel Islands Happy Everyday 5'11 surfboard",
          description:
            "A lightly used surfboard with no visible dings or repairs.",
          condition: "good",
          estimatedPrice: { amount: 680000, currency: "KRW" },
          details: {
            discipline: "shortboard",
            boardLengthFeet: 5.11,
            volumeLiters: 32.6,
          },
          confidence: 0.92,
        },
      };
      const validated = validateJson(mockVisionOutput);
      return {
        success: true,
        data: validated,
        model: "mock-gpt-4o",
        provider: "openai",
        errorReason: null,
        attempts: 1,
      };
    },
    ...overrides,
  };
}

function createSamplePayload(overrides: Record<string, unknown> = {}) {
  return {
    storagePath: `${VALID_USER_ID}/listing_123/gear.jpg`,
    bucket: "listing-images",
    mimeType: "image/jpeg",
    fileSize: 1024 * 1024,
    sport: "surf",
    ...overrides,
  };
}

Deno.test("CORS preflight (OPTIONS) returns 200 OK with CORS headers", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "OPTIONS",
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("Non-POST method returns 400 invalid_request error envelope", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "GET",
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error.code, "invalid_request");
});

Deno.test("Missing bearer token returns 401 authentication_required", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error.code, "authentication_required");
});

Deno.test("Banned user returns 403 forbidden", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer banned-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 403);
  const data = await res.json();
  assertEquals(data.error.code, "forbidden");
});

Deno.test("Quota exceeded returns 429 rate_limited", async () => {
  const deps = createMockDeps({
    checkAndConsumeQuota: async () => ({
      allowed: false,
      remaining: 0,
      resetAt: new Date().toISOString(),
      limitValue: 3,
      windowSeconds: 300,
      errorResponse: {
        code: "rate_limited",
        message: "Quota limit exceeded",
        status: 429,
      },
    }),
  });
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleAnalyzeListing(req, deps);
  assertEquals(res.status, 429);
  const data = await res.json();
  assertEquals(data.error.code, "rate_limited");
});

Deno.test("Accessing storage path owned by another user returns 403 forbidden", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(
      createSamplePayload({
        storagePath: `${OTHER_USER_ID}/listing_123/gear.jpg`,
      }),
    ),
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 403);
  const data = await res.json();
  assertEquals(data.error.code, "forbidden");
});

Deno.test("Unsupported MIME type or fileSize > 10MB returns 400 invalid_request", async () => {
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(createSamplePayload({ mimeType: "application/pdf" })),
  });
  const res = await handleAnalyzeListing(req, createMockDeps());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error.code, "invalid_request");
});

Deno.test("Unconfigured AI falls back to manual entry with allowManualEntry: true", async () => {
  const deps = createMockDeps();
  const req = new Request("http://localhost/analyze-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleAnalyzeListing(req, deps);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.source, "manual_entry_fallback");
  assertEquals(data.allowManualEntry, true);
  assertEquals(data.fallback, true);
  assertEquals(typeof data.privacyNotice, "string");
  assertEquals(data.suggestedListing.sport, "surf");
});

Deno.test("Configured AI vision success returns source: ai and suggested listing", async () => {
  Deno.env.set("OPENAI_API_KEY", "sk-mock-key-12345");
  try {
    const deps = createMockDeps();
    const req = new Request("http://localhost/analyze-listing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer valid-token",
      },
      body: JSON.stringify(createSamplePayload()),
    });
    const res = await handleAnalyzeListing(req, deps);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.success, true);
    assertEquals(data.source, "ai");
    assertEquals(data.allowManualEntry, true);
    assertEquals(data.fallback, false);
    assertEquals(
      data.suggestedListing.title,
      "Channel Islands Happy Everyday 5'11 surfboard",
    );
    assertEquals(data.suggestedListing.estimatedPrice.amount, 680000);
  } finally {
    Deno.env.delete("OPENAI_API_KEY");
  }
});
