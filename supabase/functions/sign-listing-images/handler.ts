import { createClient } from "@supabase/supabase-js";
import type {
  Dependencies,
  ErrorCode,
  ListingImageRecord,
  ListingRecord,
  SignListingImagesRequest,
  SignListingImagesSuccessResponse,
  SignedImageItem,
  UserRecord,
} from "./types.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 50;
const SIGNED_URL_TTL = 600;

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId?: string
): Response {
  const reqId =
    requestId || `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        requestId: reqId,
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

export async function handleSignListingImages(
  req: Request,
  deps: Dependencies = {}
): Promise<Response> {
  const requestId = `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // 1. Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  // 2. Enforce POST Method
  if (req.method !== "POST") {
    return createErrorResponse(
      "invalid_request",
      "Method not allowed. Only POST requests are supported.",
      400,
      requestId
    );
  }

  // 3. Parse JSON Body
  let body: SignListingImagesRequest;
  try {
    const rawBody = await req.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return createErrorResponse(
        "invalid_request",
        "Request body must be a valid JSON object.",
        400,
        requestId
      );
    }
    body = rawBody as SignListingImagesRequest;
  } catch {
    return createErrorResponse(
      "invalid_request",
      "Invalid JSON in request body.",
      400,
      requestId
    );
  }

  // 4. Validate Payload
  if (!body.listingId || typeof body.listingId !== "string" || !UUID_REGEX.test(body.listingId)) {
    return createErrorResponse(
      "invalid_request",
      "listingId must be a valid UUID.",
      400,
      requestId
    );
  }

  let requestedImageIds: string[] | null = null;
  if (body.imageIds !== undefined && body.imageIds !== null) {
    if (!Array.isArray(body.imageIds)) {
      return createErrorResponse(
        "invalid_request",
        "imageIds must be an array of UUIDs.",
        400,
        requestId
      );
    }

    if (body.imageIds.length > MAX_BATCH_SIZE) {
      return createErrorResponse(
        "invalid_request",
        `imageIds batch size exceeds maximum limit of ${MAX_BATCH_SIZE}.`,
        400,
        requestId
      );
    }

    for (const id of body.imageIds) {
      if (typeof id !== "string" || !UUID_REGEX.test(id)) {
        return createErrorResponse(
          "invalid_request",
          "Each imageId in imageIds must be a valid UUID.",
          400,
          requestId
        );
      }
    }

    // Deduplicate requested IDs
    requestedImageIds = Array.from(new Set(body.imageIds));
  }

  // 5. Environment & Client Setup
  const supabaseUrl = deps.env?.SUPABASE_URL || Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = deps.env?.SUPABASE_ANON_KEY || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabaseServiceKey = deps.env?.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  // 6. Identity Resolution
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  let bearerToken: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    bearerToken = authHeader.substring(7).trim();
  }

  let currentUser: UserRecord | null = null;
  let userRole: string | null = null;

  if (bearerToken && bearerToken !== supabaseAnonKey) {
    if (deps.getUserByToken) {
      const { user, error } = await deps.getUserByToken(bearerToken);
      if (error || !user) {
        return createErrorResponse(
          "authentication_required",
          "Invalid or expired authentication token.",
          401,
          requestId
        );
      }
      currentUser = user;
    } else {
      if (!supabaseUrl || !supabaseAnonKey) {
        return createErrorResponse(
          "dependency_unavailable",
          "Supabase service configuration missing.",
          503,
          requestId
        );
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data: authData, error: authError } = await userClient.auth.getUser(bearerToken);
      if (authError || !authData?.user) {
        return createErrorResponse(
          "authentication_required",
          "Invalid or expired authentication token.",
          401,
          requestId
        );
      }
      currentUser = authData.user;
    }

    if (currentUser) {
      if (deps.getProfileById) {
        const { profile, error: profileErr } = await deps.getProfileById(currentUser.id);
        if (profileErr) {
          return createErrorResponse(
            "dependency_unavailable",
            "Failed to resolve user profile.",
            503,
            requestId
          );
        }
        if (profile) {
          if (profile.is_banned) {
            // Banned user -> collapse to not_found
            return createErrorResponse(
              "not_found",
              "Listing not found.",
              404,
              requestId
            );
          }
          userRole = profile.role;
        }
      } else if (supabaseUrl && (supabaseServiceKey || supabaseAnonKey)) {
        const dbClient = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
        const { data: profileData, error: profileErr } = await dbClient
          .from("profiles")
          .select("role, is_banned")
          .eq("id", currentUser.id)
          .maybeSingle();

        if (profileErr) {
          return createErrorResponse(
            "dependency_unavailable",
            "Failed to resolve user profile.",
            503,
            requestId
          );
        }
        if (profileData) {
          if (profileData.is_banned) {
            return createErrorResponse(
              "not_found",
              "Listing not found.",
              404,
              requestId
            );
          }
          userRole = profileData.role;
        }
      }
    }
  }

  // 7. Retrieve Listing and Authorization Decision
  let listing: ListingRecord | null = null;

  if (deps.getListingById) {
    const { listing: foundListing, error: listingErr } = await deps.getListingById(body.listingId);
    if (listingErr) {
      return createErrorResponse(
        "dependency_unavailable",
        "Failed to query listing record.",
        503,
        requestId
      );
    }
    listing = foundListing;
  } else {
    if (!supabaseUrl || !supabaseAnonKey) {
      return createErrorResponse(
        "dependency_unavailable",
        "Supabase service configuration missing.",
        503,
        requestId
      );
    }
    const publicDbClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: listingData, error: listingErr } = await publicDbClient
      .from("listings")
      .select("id, seller_id, status")
      .eq("id", body.listingId)
      .maybeSingle();

    if (listingErr) {
      return createErrorResponse(
        "dependency_unavailable",
        "Failed to query listing record.",
        503,
        requestId
      );
    }
    listing = listingData as ListingRecord | null;
  }

  if (!listing) {
    return createErrorResponse(
      "not_found",
      "Listing not found.",
      404,
      requestId
    );
  }

  // EXPLICIT AUTHORIZATION DECISION
  const isActive = listing.status === "active";
  const isOwner = currentUser !== null && currentUser.id === listing.seller_id;
  const isOperator = userRole === "moderator" || userRole === "admin";

  let isAuthorized = false;
  if (isActive) {
    isAuthorized = true;
  } else if (isOwner || isOperator) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    // Inaccessible listing collapses to not_found to avoid leaking private draft existence
    return createErrorResponse(
      "not_found",
      "Listing not found.",
      404,
      requestId
    );
  }

  // 8. Fetch Image Metadata
  let imageRecords: ListingImageRecord[] | null = null;
  if (deps.getListingImages) {
    const { images: foundImages, error: imgErr } = await deps.getListingImages(
      listing.id,
      requestedImageIds
    );
    if (imgErr) {
      return createErrorResponse(
        "dependency_unavailable",
        "Failed to query listing images.",
        503,
        requestId
      );
    }
    imageRecords = foundImages;
  } else {
    const dbClient = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
    let query = dbClient
      .from("listing_images")
      .select("id, storage_path, alt_text, sort_order")
      .eq("listing_id", listing.id);

    if (requestedImageIds !== null) {
      query = query.in("id", requestedImageIds);
    }

    query = query.order("sort_order", { ascending: true });

    const { data: imgData, error: imgErr } = await query;
    if (imgErr) {
      return createErrorResponse(
        "dependency_unavailable",
        "Failed to query listing images.",
        503,
        requestId
      );
    }
    imageRecords = (imgData || []) as ListingImageRecord[];
  }

  if (!imageRecords || imageRecords.length === 0) {
    const emptyResponse: SignListingImagesSuccessResponse = {
      listingId: listing.id,
      images: [],
    };
    return new Response(JSON.stringify(emptyResponse), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  // 9. Service-Role Privilege: Generate Signed URLs
  // Only executed after explicit authorization decision passed above!
  const signedImages: SignedImageItem[] = [];

  for (const image of imageRecords) {
    let signedUrl: string | null = null;

    if (deps.createSignedUrl) {
      const { signedUrl: url, error: signErr } = await deps.createSignedUrl(
        image.storage_path,
        SIGNED_URL_TTL
      );
      if (signErr || !url) {
        return createErrorResponse(
          "dependency_unavailable",
          "Storage service unavailable.",
          503,
          requestId
        );
      }
      signedUrl = url;
    } else {
      if (!supabaseUrl || !supabaseServiceKey) {
        return createErrorResponse(
          "dependency_unavailable",
          "Service role key missing for signing private URLs.",
          503,
          requestId
        );
      }
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: signData, error: signErr } = await adminClient.storage
        .from("listing-images")
        .createSignedUrl(image.storage_path, SIGNED_URL_TTL);

      if (signErr || !signData?.signedUrl) {
        return createErrorResponse(
          "dependency_unavailable",
          "Storage service unavailable.",
          503,
          requestId
        );
      }
      signedUrl = signData.signedUrl;
    }

    if (!signedUrl) {
      return createErrorResponse(
        "dependency_unavailable",
        "Storage service unavailable.",
        503,
        requestId
      );
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL * 1000).toISOString();

    signedImages.push({
      id: image.id,
      url: signedUrl,
      expiresAt,
      altText: image.alt_text ?? null,
      sortOrder: image.sort_order,
    });
  }

  // Ensure output is sorted by sortOrder ascending (and secondary by id ascending)
  signedImages.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id);
  });

  const responseBody: SignListingImagesSuccessResponse = {
    listingId: listing.id,
    images: signedImages,
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
