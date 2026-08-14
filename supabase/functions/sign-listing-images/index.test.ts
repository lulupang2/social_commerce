import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { handleSignListingImages } from "./handler.ts";
import type { Dependencies } from "./types.ts";

const VALID_LISTING_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_LISTING_ID = "10000000-0000-4000-8000-000000000002";
const OWNER_USER_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "20000000-0000-4000-8000-000000000002";
const MODERATOR_USER_ID = "20000000-0000-4000-8000-000000000003";
const BANNED_USER_ID = "20000000-0000-4000-8000-000000000004";

const IMAGE_ID_1 = "30000000-0000-4000-8000-000000000001";
const IMAGE_ID_2 = "30000000-0000-4000-8000-000000000002";
const IMAGE_ID_3 = "30000000-0000-4000-8000-000000000003";

function createMockDeps(overrides: Partial<Dependencies> = {}): Dependencies {
  const baseDeps: Dependencies = {
    getUserByToken: async (token: string) => {
      await Promise.resolve();
      if (token === "valid-owner-token") {
        return { user: { id: OWNER_USER_ID, email: "owner@test.com" }, error: null };
      }
      if (token === "valid-other-token") {
        return { user: { id: OTHER_USER_ID, email: "other@test.com" }, error: null };
      }
      if (token === "valid-moderator-token") {
        return { user: { id: MODERATOR_USER_ID, email: "mod@test.com" }, error: null };
      }
      if (token === "valid-banned-token") {
        return { user: { id: BANNED_USER_ID, email: "banned@test.com" }, error: null };
      }
      return { user: null, error: new Error("Invalid token") };
    },
    getProfileById: async (userId: string) => {
      await Promise.resolve();
      if (userId === OWNER_USER_ID) {
        return { profile: { id: OWNER_USER_ID, role: "user", is_banned: false }, error: null };
      }
      if (userId === OTHER_USER_ID) {
        return { profile: { id: OTHER_USER_ID, role: "user", is_banned: false }, error: null };
      }
      if (userId === MODERATOR_USER_ID) {
        return { profile: { id: MODERATOR_USER_ID, role: "moderator", is_banned: false }, error: null };
      }
      if (userId === BANNED_USER_ID) {
        return { profile: { id: BANNED_USER_ID, role: "user", is_banned: true }, error: null };
      }
      return { profile: null, error: null };
    },
    getListingById: async (listingId: string) => {
      await Promise.resolve();
      if (listingId === VALID_LISTING_ID) {
        return {
          listing: {
            id: VALID_LISTING_ID,
            seller_id: OWNER_USER_ID,
            status: "active",
          },
          error: null,
        };
      }
      if (listingId === OTHER_LISTING_ID) {
        return {
          listing: {
            id: OTHER_LISTING_ID,
            seller_id: OWNER_USER_ID,
            status: "draft",
          },
          error: null,
        };
      }
      return { listing: null, error: null };
    },
    getListingImages: async (listingId: string, imageIds: string[] | null) => {
      await Promise.resolve();
      const allImages = [
        {
          id: IMAGE_ID_2,
          storage_path: `${OWNER_USER_ID}/${listingId}/img2.jpg`,
          alt_text: "Second image",
          sort_order: 2,
        },
        {
          id: IMAGE_ID_1,
          storage_path: `${OWNER_USER_ID}/${listingId}/img1.jpg`,
          alt_text: "First image",
          sort_order: 1,
        },
        {
          id: IMAGE_ID_3,
          storage_path: `${OWNER_USER_ID}/${listingId}/img3.jpg`,
          alt_text: "Third image",
          sort_order: 3,
        },
      ];

      let filtered = allImages;
      if (imageIds !== null) {
        filtered = allImages.filter((img) => imageIds.includes(img.id));
      }

      return { images: filtered, error: null };
    },
    createSignedUrl: async (path: string, expiresIn: number) => {
      await Promise.resolve();
      return {
        signedUrl: `https://storage.supabase.test/object/sign/listing-images/${path}?token=mock_signed_token&expiresIn=${expiresIn}`,
        error: null,
      };
    },
    env: {
      SUPABASE_URL: "https://mock.supabase.co",
      SUPABASE_ANON_KEY: "mock-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "mock-service-key",
    },
  };

  return { ...baseDeps, ...overrides };
}

Deno.test("CORS preflight (OPTIONS) returns 200 OK with CORS headers", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "OPTIONS",
  });
  const res = await handleSignListingImages(req, createMockDeps());

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertMatch(res.headers.get("access-control-allow-methods") || "", /POST/);
});

Deno.test("Non-POST method returns 400 invalid_request error envelope", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "GET",
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error.code, "invalid_request");
  assertMatch(body.error.requestId, /^req_/);
});

Deno.test("Invalid JSON body returns 400 invalid_request", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "invalid-json{",
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error.code, "invalid_request");
});

Deno.test("Missing or invalid listingId returns 400 invalid_request", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "not-a-uuid" }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error.code, "invalid_request");
});

Deno.test("imageIds exceeding MAX_BATCH_SIZE (50) returns 400 invalid_request", async () => {
  const tooManyIds = Array.from({ length: 51 }, (_, i) =>
    `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
  );
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: VALID_LISTING_ID, imageIds: tooManyIds }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.error.code, "invalid_request");
  assertMatch(body.error.message, /batch size exceeds/i);
});

Deno.test("Invalid bearer token returns 401 authentication_required", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid-token-xyz",
    },
    body: JSON.stringify({ listingId: VALID_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 401);
  assertEquals(body.error.code, "authentication_required");
});

Deno.test("Anonymous caller accessing non-existent listing returns 404 not_found", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: "90000000-0000-4000-8000-000000000999" }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 404);
  assertEquals(body.error.code, "not_found");
});

Deno.test("Anonymous caller accessing draft listing returns 404 not_found (collapsed)", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: OTHER_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 404);
  assertEquals(body.error.code, "not_found");
});

Deno.test("Authenticated non-owner user accessing draft listing returns 404 not_found", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-other-token",
    },
    body: JSON.stringify({ listingId: OTHER_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 404);
  assertEquals(body.error.code, "not_found");
});

Deno.test("Banned user accessing active listing returns 404 not_found", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-banned-token",
    },
    body: JSON.stringify({ listingId: VALID_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 404);
  assertEquals(body.error.code, "not_found");
});

Deno.test("Anonymous caller accessing active listing returns 200 with signed images ordered by sortOrder", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: VALID_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.listingId, VALID_LISTING_ID);
  assertEquals(body.images.length, 3);

  // Assert ordered by sortOrder (1, 2, 3)
  assertEquals(body.images[0].sortOrder, 1);
  assertEquals(body.images[0].id, IMAGE_ID_1);
  assertEquals(body.images[1].sortOrder, 2);
  assertEquals(body.images[1].id, IMAGE_ID_2);
  assertEquals(body.images[2].sortOrder, 3);
  assertEquals(body.images[2].id, IMAGE_ID_3);

  // Assert structure of returned items
  assertNotEquals(body.images[0].url, undefined);
  assertNotEquals(body.images[0].expiresAt, undefined);
  assertEquals(body.images[0].altText, "First image");

  // SECURITY INVARIANT CHECK: storage_path must NOT exist in output!
  assertEquals((body.images[0] as unknown as Record<string, unknown>).storage_path, undefined);
  assertEquals((body.images[0] as unknown as Record<string, unknown>).storagePath, undefined);
});

Deno.test("Authenticated owner accessing own draft listing returns 200 with signed images", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-owner-token",
    },
    body: JSON.stringify({ listingId: OTHER_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.listingId, OTHER_LISTING_ID);
  assertEquals(body.images.length, 3);
});

Deno.test("Moderator accessing draft/review listing returns 200 with signed images", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-moderator-token",
    },
    body: JSON.stringify({ listingId: OTHER_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.listingId, OTHER_LISTING_ID);
  assertEquals(body.images.length, 3);
});

Deno.test("Deduplicates imageIds and returns filtered images ordered by sortOrder", async () => {
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      listingId: VALID_LISTING_ID,
      imageIds: [IMAGE_ID_2, IMAGE_ID_1, IMAGE_ID_2],
    }),
  });
  const res = await handleSignListingImages(req, createMockDeps());
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.images.length, 2);
  assertEquals(body.images[0].id, IMAGE_ID_1);
  assertEquals(body.images[0].sortOrder, 1);
  assertEquals(body.images[1].id, IMAGE_ID_2);
  assertEquals(body.images[1].sortOrder, 2);
});

Deno.test("Storage failure returns 503 dependency_unavailable without leaking storage path", async () => {
  const deps = createMockDeps({
    createSignedUrl: async () => {
      await Promise.resolve();
      return {
        signedUrl: null,
        error: new Error("Internal S3 bucket connection error on bucket listing-images path /secret/path"),
      };
    },
  });
  const req = new Request("http://localhost/sign-listing-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId: VALID_LISTING_ID }),
  });
  const res = await handleSignListingImages(req, deps);
  const body = await res.json();

  assertEquals(res.status, 503);
  assertEquals(body.error.code, "dependency_unavailable");

  // Ensure storage internal paths/errors are NOT leaked in message
  assertEquals(body.error.message.includes("secret/path"), false);
  assertEquals(body.error.message.includes("bucket"), false);
});
