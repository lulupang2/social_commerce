import {
  appRoleSchema,
  httpsUrlSchema,
  isoTimestampSchema,
  onboardingPayloadSchema,
  profileSportPreferenceSchema,
  profileUpdateSchema,
  sportSchema,
  uuidSchema,
  type AppRole,
  type Onboarding,
  type OnboardingPayload,
  type ProfileEquipmentPreferences,
  type ProfileSizePreferences,
  type ProfileSportPreference,
  type ProfileUpdate,
  type SkillLevel,
  type Sport,
} from '@icegear/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isDemoAnonymousAuthEnabled, supabase } from '../supabase/client';

const PROFILE_SELECT =
  'id,handle,display_name,bio,avatar_url,role,is_banned,onboarding_completed_at,created_at,updated_at';
const PROFILE_SPORT_SELECT =
  'sport_id,skill_level,size_preferences,preferences,created_at,updated_at,sports(slug)';
const DATABASE_USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  is_banned: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileSportRow = {
  sport_id: string;
  skill_level: string | null;
  size_preferences: unknown;
  preferences: unknown;
  created_at: string;
  updated_at: string;
  sports?: { slug?: unknown } | Array<{ slug?: unknown }> | null;
};

type ProfileBaseWrite = {
  display_name?: string;
  handle?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
};

export type ProfileRepositoryErrorCode =
  | 'not_configured'
  | 'unauthenticated'
  | 'not_found'
  | 'validation_error'
  | 'unsupported_field'
  | 'account_restricted'
  | 'conflict'
  | 'request_failed'
  | 'mapping_failed';

export interface ProfileRepositoryError {
  code: ProfileRepositoryErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type ProfileRepositoryResult<T> =
  { data: T; error: null } | { data: null; error: ProfileRepositoryError };

export interface CurrentProfileSport extends ProfileSportPreference {
  sport: Sport | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: AppRole;
  isBanned: boolean;
  onboardingCompletedAt: string | null;
  onboardingState: 'required' | 'complete';
  sports: CurrentProfileSport[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileActivityStatistics {
  asOf: string;
  source: 'owner_scoped_database_rows';
  favorites: {
    listingCount: number;
  };
  listings: {
    draftCount: number;
    pendingReviewCount: number;
    activeCount: number;
  };
  community: {
    draftPostCount: number;
    publishedPostCount: number;
    likesGivenCount: number;
  };
  impact: {
    status: 'unavailable';
    reason: 'no_audited_completed_records';
  };
}

export interface ProfileRepository {
  getCurrent(): Promise<ProfileRepositoryResult<CurrentProfile>>;
  completeOnboarding(payload: OnboardingPayload): Promise<ProfileRepositoryResult<CurrentProfile>>;
  updateCurrent(payload: ProfileUpdate): Promise<ProfileRepositoryResult<CurrentProfile>>;
  getActivityStatistics(): Promise<ProfileRepositoryResult<ProfileActivityStatistics>>;
}

function success<T>(data: T): ProfileRepositoryResult<T> {
  return { data, error: null };
}

function failure<T>(error: ProfileRepositoryError): ProfileRepositoryResult<T> {
  return { data: null, error };
}

function requestError(): ProfileRepositoryError {
  return {
    code: 'request_failed',
    message: 'Your profile could not be updated. Try again shortly.',
  };
}

function configuredClient(
  client: SupabaseClient | null,
): { client: SupabaseClient; error: null } | { client: null; error: ProfileRepositoryError } {
  return client
    ? { client, error: null }
    : {
        client: null,
        error: {
          code: 'not_configured',
          message: 'Connect Supabase before loading your profile.',
        },
      };
}

function formatValidationErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): ProfileRepositoryError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.length ? issue.path.map(String).join('.') : 'form';
    fieldErrors[field] ??= issue.message;
  }
  return {
    code: 'validation_error',
    message: 'Check your profile details and try again.',
    fieldErrors,
  };
}

function unsupportedFieldsError(fields: string[]): ProfileRepositoryError {
  return {
    code: 'unsupported_field',
    message: 'Some profile fields are not available until their storage policy is approved.',
    fieldErrors: Object.fromEntries(
      fields.map((field) => [field, 'This field is not stored by the current profile schema.']),
    ),
  };
}

function usernamePersistenceError(
  username: string | null | undefined,
): ProfileRepositoryError | null {
  if (username == null || DATABASE_USERNAME_PATTERN.test(username)) return null;
  return {
    code: 'validation_error',
    message: 'Check your profile details and try again.',
    fieldErrors: {
      username: 'Use 3-30 lowercase letters, numbers, or underscores.',
    },
  };
}

function relationSportSlug(row: ProfileSportRow): unknown {
  const relation = Array.isArray(row.sports) ? row.sports[0] : row.sports;
  return relation?.slug;
}

function mapProfileSport(row: ProfileSportRow): CurrentProfileSport {
  const preference = profileSportPreferenceSchema.parse({
    sportId: row.sport_id,
    skillLevel: row.skill_level,
    sizePreferences: row.size_preferences,
    preferences: row.preferences,
  });
  const sportResult = sportSchema.safeParse(relationSportSlug(row));

  return {
    ...preference,
    sport: sportResult.success ? sportResult.data : null,
    createdAt: isoTimestampSchema.parse(row.created_at),
    updatedAt: isoTimestampSchema.parse(row.updated_at),
  };
}

function mapProfile(row: ProfileRow, sportRows: ProfileSportRow[]): CurrentProfile {
  const role = appRoleSchema.parse(row.role);
  const createdAt = isoTimestampSchema.parse(row.created_at);
  const updatedAt = isoTimestampSchema.parse(row.updated_at);
  const onboardingCompletedAt = row.onboarding_completed_at
    ? isoTimestampSchema.parse(row.onboarding_completed_at)
    : null;
  const avatarUrl = row.avatar_url ? httpsUrlSchema.parse(row.avatar_url) : null;

  if (
    (row.display_name !== null &&
      (typeof row.display_name !== 'string' || row.display_name.trim().length > 80)) ||
    (row.bio !== null && (typeof row.bio !== 'string' || row.bio.length > 500)) ||
    (row.handle !== null && typeof row.handle !== 'string') ||
    typeof row.is_banned !== 'boolean'
  ) {
    throw new Error('Profile row is invalid');
  }

  const sports = sportRows.map(mapProfileSport);
  if (onboardingCompletedAt && sports.length === 0) {
    throw new Error('Completed onboarding has no sport preferences');
  }

  return {
    id: uuidSchema.parse(row.id),
    username: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl,
    role,
    isBanned: row.is_banned,
    onboardingCompletedAt,
    onboardingState: onboardingCompletedAt ? 'complete' : 'required',
    sports,
    createdAt,
    updatedAt,
  };
}

async function verifiedUserId(client: SupabaseClient): Promise<ProfileRepositoryResult<string>> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return failure({
      code: 'unauthenticated',
      message: 'Sign in before accessing your profile.',
    });
  }
  if (data.user.is_anonymous === true && !isDemoAnonymousAuthEnabled) {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Identity remains rejected even if local session cleanup fails.
    }
    return failure({
      code: 'unauthenticated',
      message: 'Anonymous sessions are disabled for this build.',
    });
  }
  return success(data.user.id);
}

async function readCurrentProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRepositoryResult<CurrentProfile>> {
  const [profileResult, sportsResult] = await Promise.all([
    client.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
    client
      .from('profile_sports')
      .select(PROFILE_SPORT_SELECT)
      .eq('profile_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  if (profileResult.error || sportsResult.error) return failure(requestError());
  if (!profileResult.data) {
    return failure({ code: 'not_found', message: 'Profile not found.' });
  }

  try {
    return success(
      mapProfile(profileResult.data as ProfileRow, (sportsResult.data ?? []) as ProfileSportRow[]),
    );
  } catch {
    return failure({
      code: 'mapping_failed',
      message: 'Your saved profile contains data this app cannot safely display.',
    });
  }
}

async function requireWritableProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRepositoryResult<CurrentProfile>> {
  const current = await readCurrentProfile(client, userId);
  if (current.error) return current;
  if (current.data.isBanned) {
    return failure({
      code: 'account_restricted',
      message: 'This account cannot change profile information.',
    });
  }
  return current;
}

function profileBaseWrite(
  payload: Pick<Onboarding | ProfileUpdate, 'displayName' | 'username' | 'bio' | 'avatarUrl'>,
): ProfileBaseWrite {
  const write: ProfileBaseWrite = {};
  if (payload.displayName !== undefined) write.display_name = payload.displayName;
  if (payload.username !== undefined) write.handle = payload.username;
  if (payload.bio !== undefined) write.bio = payload.bio;
  if (payload.avatarUrl !== undefined) write.avatar_url = payload.avatarUrl;
  return write;
}

async function validateActiveSports(
  client: SupabaseClient,
  sports: ProfileSportPreference[],
): Promise<ProfileRepositoryError | null> {
  const ids = sports.map((sport) => sport.sportId);
  const { data, error } = await client
    .from('sports')
    .select('id')
    .in('id', ids)
    .eq('is_active', true);
  if (error) return requestError();

  const activeIds = new Set((data ?? []).map((row) => row.id as string));
  const missingIndex = sports.findIndex((sport) => !activeIds.has(sport.sportId));
  if (missingIndex >= 0) {
    return {
      code: 'validation_error',
      message: 'Check your sport preferences and try again.',
      fieldErrors: {
        [`sports.${missingIndex}.sportId`]: 'Choose an active sport from the catalog.',
      },
    };
  }
  return null;
}

async function writeProfileBase(
  client: SupabaseClient,
  userId: string,
  write: ProfileBaseWrite,
): Promise<ProfileRepositoryError | null> {
  if (Object.keys(write).length === 0) return null;

  const { data, error } = await client
    .from('profiles')
    .update(write)
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error?.code === '23505') {
    return {
      code: 'conflict',
      message: 'That username is already in use.',
      fieldErrors: { username: 'Choose another username.' },
    };
  }
  if (error) return requestError();
  return data ? null : { code: 'not_found', message: 'Profile not found.' };
}

async function replaceProfileSports(
  client: SupabaseClient,
  userId: string,
  sports: ProfileSportPreference[],
): Promise<ProfileRepositoryError | null> {
  const existingResult = await client
    .from('profile_sports')
    .select('sport_id')
    .eq('profile_id', userId);
  if (existingResult.error) return requestError();

  const { error: upsertError } = await client.from('profile_sports').upsert(
    sports.map((sport) => ({
      profile_id: userId,
      sport_id: sport.sportId,
      skill_level: (sport.skillLevel ?? null) as SkillLevel | null,
      size_preferences: (sport.sizePreferences ?? null) as ProfileSizePreferences | null,
      preferences: (sport.preferences ?? null) as ProfileEquipmentPreferences | null,
    })),
    { onConflict: 'profile_id,sport_id' },
  );
  if (upsertError) return requestError();

  const desiredIds = new Set(sports.map((sport) => sport.sportId));
  const removedIds = (existingResult.data ?? [])
    .map((row) => row.sport_id as string)
    .filter((sportId) => !desiredIds.has(sportId));
  if (removedIds.length > 0) {
    const { error: deleteError } = await client
      .from('profile_sports')
      .delete()
      .eq('profile_id', userId)
      .in('sport_id', removedIds);
    if (deleteError) return requestError();
  }
  return null;
}

async function markOnboardingComplete(
  client: SupabaseClient,
  userId: string,
  current: CurrentProfile,
): Promise<ProfileRepositoryError | null> {
  if (current.onboardingCompletedAt) return null;

  const { error } = await client
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('onboarding_completed_at', null);
  return error ? requestError() : null;
}

function countValue(value: number | null): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function createProfileRepository(
  client: SupabaseClient | null = supabase,
): ProfileRepository {
  async function getCurrent(): Promise<ProfileRepositoryResult<CurrentProfile>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const identity = await verifiedUserId(configured.client);
    if (identity.error) return identity;
    return readCurrentProfile(configured.client, identity.data);
  }

  async function completeOnboarding(
    payload: OnboardingPayload,
  ): Promise<ProfileRepositoryResult<CurrentProfile>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const parsed = onboardingPayloadSchema.safeParse(payload);
    if (!parsed.success) return failure(formatValidationErrors(parsed.error.issues));

    const unsupportedFields = ['location', 'acceptTerms', 'marketingOptIn'].filter(
      (field) => field in payload,
    );
    if (unsupportedFields.length > 0) {
      return failure(unsupportedFieldsError(unsupportedFields));
    }
    const usernameError = usernamePersistenceError(parsed.data.username);
    if (usernameError) return failure(usernameError);

    const identity = await verifiedUserId(configured.client);
    if (identity.error) return identity;
    const current = await requireWritableProfile(configured.client, identity.data);
    if (current.error) return current;

    const sportError = await validateActiveSports(configured.client, parsed.data.sports);
    if (sportError) return failure(sportError);

    const baseError = await writeProfileBase(
      configured.client,
      identity.data,
      profileBaseWrite(parsed.data),
    );
    if (baseError) return failure(baseError);

    const preferencesError = await replaceProfileSports(
      configured.client,
      identity.data,
      parsed.data.sports,
    );
    if (preferencesError) return failure(preferencesError);

    const completionError = await markOnboardingComplete(
      configured.client,
      identity.data,
      current.data,
    );
    if (completionError) return failure(completionError);

    const completed = await readCurrentProfile(configured.client, identity.data);
    if (completed.error) return completed;
    return completed.data.onboardingState === 'complete'
      ? completed
      : failure({
          code: 'request_failed',
          message: 'Onboarding was saved but could not be marked complete. Try again.',
        });
  }

  async function updateCurrent(
    payload: ProfileUpdate,
  ): Promise<ProfileRepositoryResult<CurrentProfile>> {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const parsed = profileUpdateSchema.safeParse(payload);
    if (!parsed.success) return failure(formatValidationErrors(parsed.error.issues));
    if ('location' in payload) return failure(unsupportedFieldsError(['location']));

    const usernameError = usernamePersistenceError(parsed.data.username);
    if (usernameError) return failure(usernameError);

    const identity = await verifiedUserId(configured.client);
    if (identity.error) return identity;
    const current = await requireWritableProfile(configured.client, identity.data);
    if (current.error) return current;

    if (parsed.data.sports) {
      const sportError = await validateActiveSports(configured.client, parsed.data.sports);
      if (sportError) return failure(sportError);
    }

    const baseError = await writeProfileBase(
      configured.client,
      identity.data,
      profileBaseWrite(parsed.data),
    );
    if (baseError) return failure(baseError);

    if (parsed.data.sports) {
      const preferencesError = await replaceProfileSports(
        configured.client,
        identity.data,
        parsed.data.sports,
      );
      if (preferencesError) return failure(preferencesError);
    }

    return readCurrentProfile(configured.client, identity.data);
  }

  async function getActivityStatistics(): Promise<
    ProfileRepositoryResult<ProfileActivityStatistics>
  > {
    const configured = configuredClient(client);
    if (!configured.client) return failure(configured.error);

    const identity = await verifiedUserId(configured.client);
    if (identity.error) return identity;
    const userId = identity.data;

    const [
      favorites,
      draftListings,
      pendingListings,
      activeListings,
      draftPosts,
      activePosts,
      likes,
    ] = await Promise.all([
      configured.client
        .from('favorites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      configured.client
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'draft'),
      configured.client
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'pending_review'),
      configured.client
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'active'),
      configured.client
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', userId)
        .eq('status', 'draft'),
      configured.client
        .from('community_posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', userId)
        .eq('status', 'active'),
      configured.client
        .from('community_reactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const results = [
      favorites,
      draftListings,
      pendingListings,
      activeListings,
      draftPosts,
      activePosts,
      likes,
    ];
    const counts = results.map((result) => countValue(result.count));
    if (results.some((result) => result.error) || counts.some((count) => count === null)) {
      return failure({
        code: 'request_failed',
        message: 'Your activity counts could not be loaded. Try again shortly.',
      });
    }

    return success({
      asOf: new Date().toISOString(),
      source: 'owner_scoped_database_rows',
      favorites: { listingCount: counts[0]! },
      listings: {
        draftCount: counts[1]!,
        pendingReviewCount: counts[2]!,
        activeCount: counts[3]!,
      },
      community: {
        draftPostCount: counts[4]!,
        publishedPostCount: counts[5]!,
        likesGivenCount: counts[6]!,
      },
      impact: {
        status: 'unavailable',
        reason: 'no_audited_completed_records',
      },
    });
  }

  return { getCurrent, completeOnboarding, updateCurrent, getActivityStatistics };
}

export const profileRepository = createProfileRepository();
export const getCurrentProfile = profileRepository.getCurrent;
export const completeCurrentProfileOnboarding = profileRepository.completeOnboarding;
export const updateCurrentProfile = profileRepository.updateCurrent;
export const getCurrentProfileActivityStatistics = profileRepository.getActivityStatistics;
