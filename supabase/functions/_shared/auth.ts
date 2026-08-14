import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthenticatedSubject {
  userId: string;
  email?: string;
  role: string;
  isBanned: boolean;
}

export interface AuthResult {
  subject: AuthenticatedSubject | null;
  errorResponse: { code: "authentication_required" | "forbidden"; message: string; status: number } | null;
}

export async function authenticateSubject(
  req: Request,
  supabaseClient: SupabaseClient
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      subject: null,
      errorResponse: {
        code: "authentication_required",
        message: "Missing or malformed Authorization header",
        status: 401,
      },
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      subject: null,
      errorResponse: {
        code: "authentication_required",
        message: "Bearer token required",
        status: 401,
      },
    };
  }

  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      subject: null,
      errorResponse: {
        code: "authentication_required",
        message: "Invalid or expired authentication token",
        status: 401,
      },
    };
  }

  const userId = userData.user.id;

  // Verify profile status in profiles table
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, role, is_banned")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      subject: null,
      errorResponse: {
        code: "authentication_required",
        message: "Failed to verify subject profile status",
        status: 401,
      },
    };
  }

  if (!profile) {
    return {
      subject: null,
      errorResponse: {
        code: "forbidden",
        message: "Subject profile not found",
        status: 403,
      },
    };
  }

  if (profile.is_banned) {
    return {
      subject: null,
      errorResponse: {
        code: "forbidden",
        message: "Banned profile cannot consume edge function resources",
        status: 403,
      },
    };
  }

  return {
    subject: {
      userId: profile.id,
      email: userData.user.email,
      role: profile.role || "user",
      isBanned: profile.is_banned || false,
    },
    errorResponse: null,
  };
}
