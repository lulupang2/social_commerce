import { assertEquals, assertMatch } from "@std/assert";
import { handleRecommendListings } from "./handler.ts";
import type { Dependencies } from "./types.ts";

const VALID_USER_ID = "20000000-0000-4000-8000-000000000001";
const BANNED_USER_ID = "20000000-0000-4000-8000-000000000004";
const LISTING_ID_1 = "10000000-0000-4000-8000-000000000001";
const LISTING_ID_2 = "10000000-0000-4000-8000-000000000002";

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
        remaining: 9,
        resetAt: new Date().toISOString(),
        limitValue: 10,
        windowSeconds: 60,
        errorResponse: null,
      };
    },
    callAiModel: async (_opts, validateJson) => {
      const mockAiOutput = {
        items: [
          {
            listingId: LISTING_ID_1,
            reasonCodes: ["sport_match", "skill_match"],
            reasonText: "AI 추천: 실력대에 잘 맞는 서핑 장비예요.",
            score: 95,
          },
          {
            listingId: "invented-listing-id-999", // Should be filtered out!
            reasonCodes: ["popular_fallback"],
            reasonText: "허위 상품",
            score: 100,
          },
        ],
      };
      const validated = validateJson(mockAiOutput);
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

function createSamplePayload() {
  return {
    profileSports: [
      {
        sportId: "50000000-0000-4000-8000-000000000001",
        skillLevel: "intermediate",
        sizePreferences: { boardLengthFeet: 5.11, volumeLiters: 32 },
        preferences: { surfDiscipline: "shortboard" },
      },
    ],
    listings: [
      {
        listingId: LISTING_ID_1,
        sportId: "50000000-0000-4000-8000-000000000001",
        sport: "surf",
        status: "active",
        condition: "like_new",
        createdAt: "2026-08-01T10:00:00Z",
        favoriteCount: 8,
        details: {
          sport: "surf",
          skillLevel: "intermediate",
          discipline: "shortboard",
          boardLengthFeet: 5.11,
          volumeLiters: 32.6,
        },
      },
      {
        listingId: LISTING_ID_2,
        sportId: "50000000-0000-4000-8000-000000000001",
        sport: "surf",
        status: "active",
        condition: "good",
        createdAt: "2026-08-02T10:00:00Z",
        favoriteCount: 0,
        details: {
          sport: "surf",
          skillLevel: "expert",
          discipline: "shortboard",
          boardLengthFeet: 6.2,
        },
      },
    ],
    asOf: "2026-08-14T12:00:00Z",
  };
}

Deno.test("CORS preflight (OPTIONS) returns 200 OK with CORS headers", async () => {
  const req = new Request("http://localhost/recommend-listings", {
    method: "OPTIONS",
  });
  const res = await handleRecommendListings(req, createMockDeps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("Non-POST method returns 400 invalid_request error envelope", async () => {
  const req = new Request("http://localhost/recommend-listings", {
    method: "GET",
  });
  const res = await handleRecommendListings(req, createMockDeps());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error.code, "invalid_request");
});

Deno.test("Missing bearer token returns 401 authentication_required", async () => {
  const req = new Request("http://localhost/recommend-listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleRecommendListings(req, createMockDeps());
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error.code, "authentication_required");
});

Deno.test("Banned user returns 403 forbidden", async () => {
  const req = new Request("http://localhost/recommend-listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer banned-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleRecommendListings(req, createMockDeps());
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
      limitValue: 10,
      windowSeconds: 60,
      errorResponse: {
        code: "rate_limited",
        message: "Quota limit exceeded",
        status: 429,
      },
    }),
  });
  const req = new Request("http://localhost/recommend-listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });
  const res = await handleRecommendListings(req, deps);
  assertEquals(res.status, 429);
  const data = await res.json();
  assertEquals(data.error.code, "rate_limited");
});

Deno.test("Invalid schema payload returns 400 invalid_request", async () => {
  const req = new Request("http://localhost/recommend-listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify({ invalid: true }),
  });
  const res = await handleRecommendListings(req, createMockDeps());
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error.code, "invalid_request");
});

Deno.test("Valid payload with AI unconfigured falls back to T40 deterministic rules", async () => {
  // When AI API key is not present, falls back cleanly to deterministic rules
  const deps = createMockDeps();
  const req = new Request("http://localhost/recommend-listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer valid-token",
    },
    body: JSON.stringify(createSamplePayload()),
  });

  const res = await handleRecommendListings(req, deps);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.source, "rules");
  assertEquals(data.fallback, true);
  assertEquals(data.label, "맞춤 추천");
  assertEquals(Array.isArray(data.items), true);
  assertEquals(data.items.length > 0, true);
});

Deno.test("Valid payload with AI succeeding returns AI recommendation and filters invented IDs", async () => {
  // Set OPENAI_API_KEY env var in test scope
  Deno.env.set("OPENAI_API_KEY", "sk-mock-key-12345");
  try {
    const deps = createMockDeps();
    const req = new Request("http://localhost/recommend-listings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer valid-token",
      },
      body: JSON.stringify(createSamplePayload()),
    });

    const res = await handleRecommendListings(req, deps);
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.source, "ai");
    assertEquals(data.fallback, false);
    assertEquals(data.items.length, 1); // Invented ID was filtered out!
    assertEquals(data.items[0].listingId, LISTING_ID_1);
  } finally {
    Deno.env.delete("OPENAI_API_KEY");
  }
});
