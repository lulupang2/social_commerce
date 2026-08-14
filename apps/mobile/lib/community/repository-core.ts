import type { CommunityPostType } from '@icegear/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

import { formatTime } from '../format';
import {
  ascendingCursorFilter,
  decodeCommunityCursor,
  descendingCursorFilter,
  encodeCommunityCursor,
  normalizeCommunityPageSize,
} from './pagination';
import type {
  CommunityAuthorProjection,
  CommunityCommentMutation,
  CommunityCommentPageOptions,
  CommunityCommentPreview,
  CommunityLikeState,
  CommunityPage,
  CommunityPostPageOptions,
  CommunityPostPreview,
  CommunityRepository,
  CommunityRepositoryError,
  CommunityRepositoryResult,
  CreateCommunityCommentInput,
  CreateCommunityPostInput,
} from './types';

const POST_SELECT =
  'id,author_id,sport_id,post_type,title,body,status,published_at,created_at,updated_at,sports(slug),comments(count)';
const POST_SELECT_WITH_SPORT_FILTER =
  'id,author_id,sport_id,post_type,title,body,status,published_at,created_at,updated_at,sports:sports!inner(slug),comments(count)';
const COMMENT_SELECT = 'id,post_id,author_id,parent_comment_id,body,status,created_at,updated_at';
const PROFILE_SELECT = 'id,display_name,avatar_url';

type Relation<T> = T | T[] | null | undefined;

interface SportRow {
  slug?: string | null;
}

interface CountRow {
  count?: number | string | null;
}

interface PostRow {
  id: string;
  author_id: string;
  sport_id?: string | null;
  post_type?: string | null;
  title: string;
  body: string;
  status: string;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  sports?: Relation<SportRow>;
  comments?: Relation<CountRow>;
}

interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id?: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
}

interface ProfileRow {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface ReactionCountRow {
  post_id: string;
  like_count?: number | string | null;
}

interface Viewer {
  id: string;
}

interface PostSupplementalData {
  profiles: Map<string, ProfileRow>;
  likeCounts: Map<string, number>;
  likedPostIds: Set<string>;
}

function success<T>(data: T): CommunityRepositoryResult<T> {
  return { data, error: null };
}

function failure<T>(error: CommunityRepositoryError): CommunityRepositoryResult<T> {
  return { data: null, error };
}

function configurationError(): CommunityRepositoryError {
  return {
    code: 'not_configured',
    kind: 'configuration',
    message: 'Community data is unavailable until Supabase is configured.',
    retryable: false,
  };
}

function validationError(fieldErrors: Record<string, string>): CommunityRepositoryError {
  return {
    code: 'validation_error',
    kind: 'validation',
    message: 'Check the community content and try again.',
    retryable: false,
    fieldErrors,
  };
}

function unauthenticatedError(): CommunityRepositoryError {
  return {
    code: 'unauthenticated',
    kind: 'auth',
    message: 'Sign in to continue.',
    retryable: false,
  };
}

function forbiddenError(): CommunityRepositoryError {
  return {
    code: 'forbidden',
    kind: 'permission',
    message: 'You do not have permission to perform this action.',
    retryable: false,
  };
}

function notFoundError(resource: 'post' | 'comment' = 'post'): CommunityRepositoryError {
  return {
    code: 'not_found',
    kind: 'not-found',
    message: resource === 'post' ? 'Community post not found.' : 'Comment not found.',
    retryable: false,
  };
}

function mappingError(message: string): CommunityRepositoryError {
  return {
    code: 'mapping_error',
    kind: 'mapping',
    message,
    retryable: true,
  };
}

function readErrorField(error: unknown, field: 'code' | 'message' | 'name' | 'status'): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[field];
}

function mapRequestError(error: unknown): CommunityRepositoryError {
  const code = String(readErrorField(error, 'code') ?? '');
  const status = Number(readErrorField(error, 'status'));
  const message = String(readErrorField(error, 'message') ?? '');
  const name = String(readErrorField(error, 'name') ?? '');

  if (code === 'PGRST116' || status === 404) return notFoundError();
  if (code === '42501' || status === 403) return forbiddenError();
  if (
    code === 'PGRST301' ||
    status === 401 ||
    name === 'AuthSessionMissingError' ||
    /session\s+missing|invalid\s+jwt|jwt\s+expired/i.test(message)
  ) {
    return unauthenticatedError();
  }
  if (code === '23505' || status === 409) {
    return {
      code: 'conflict',
      kind: 'conflict',
      message: 'Community data changed before this request completed.',
      retryable: true,
    };
  }
  if (code === '23514' || code === '22001' || code === '22P02' || status === 400) {
    return validationError({ form: 'The submitted community data is invalid.' });
  }

  return {
    code: 'network_error',
    kind: 'network',
    message: 'The community service could not be reached. Try again shortly.',
    retryable: true,
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function parseCount(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    throw new Error('Count is missing');
  }
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Count is invalid');
  return count;
}

function relationFirst<T>(relation: Relation<T>): T | undefined {
  return Array.isArray(relation) ? relation[0] : (relation ?? undefined);
}

function embeddedCount(relation: Relation<CountRow>, status: string): number {
  const value = relationFirst(relation)?.count;
  if (value === null || value === undefined) {
    if (status === 'draft') return 0;
    throw new Error('Comment count is missing');
  }
  return parseCount(value);
}

function authorInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toUpperCase() || 'I';
}
function mapPostType(value: unknown): CommunityPostType {
  if (typeof value !== 'string') throw new Error('Post type is invalid');
  const type = value.trim();
  if (type === 'meetup') return 'event';
  if (['discussion', 'question', 'guide', 'review', 'event', 'announcement'].includes(type)) {
    return type as CommunityPostType;
  }
  throw new Error('Post type is invalid');
}

function mapPostTypeForDatabase(type: CommunityPostType | undefined): string {
  if (!type) return 'discussion';
  if (type === 'event') return 'meetup';
  return type;
}

function projectAuthor(
  authorId: string,
  profile: ProfileRow | undefined,
  viewerId: string | undefined,
): CommunityAuthorProjection {
  const isOwner = viewerId === authorId;
  // public_community_authors exposes active post authors without private profile fields.
  const displayName = profile?.display_name?.trim() || (isOwner ? '나' : '알 수 없는 작성자');
  const avatarUrl = optionalString(profile?.avatar_url);
  return {
    id: authorId,
    displayName,
    initial: authorInitial(displayName),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mapPostRow(
  row: PostRow,
  supplemental: PostSupplementalData,
  viewerId: string | undefined,
): CommunityPostPreview {
  const id = requiredString(row.id, 'Post id');
  const authorId = requiredString(row.author_id, 'Post author');
  const createdAt = requiredString(row.created_at, 'Post creation time');
  const updatedAt = requiredString(row.updated_at, 'Post update time');
  if (Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('Post timestamps are invalid');
  }

  if (!['draft', 'active', 'hidden', 'deleted'].includes(row.status)) {
    throw new Error('Post status is invalid');
  }

  const sportSlug = relationFirst(row.sports)?.slug;
  const sport = sportSlug === 'ski' || sportSlug === 'hockey' ? sportSlug : undefined;
  const commentCount = embeddedCount(row.comments, row.status);
  const likeCountValue = supplemental.likeCounts.get(id);
  if (row.status === 'active' && likeCountValue === undefined) {
    throw new Error('Like count is missing');
  }
  const likeCount = likeCountValue ?? 0;
  const likedByMe = viewerId ? supplemental.likedPostIds.has(id) : undefined;
  const author = projectAuthor(authorId, supplemental.profiles.get(authorId), viewerId);
  const publishedAt = optionalString(row.published_at);

  return {
    id,
    authorId,
    author,
    authorName: author.displayName,
    authorInitial: author.initial,
    ...(sport ? { sport } : {}),
    type: mapPostType(row.post_type),
    status: row.status as CommunityPostPreview['status'],
    title: requiredString(row.title, 'Post title'),
    body: requiredString(row.body, 'Post body'),
    counts: {
      commentCount,
      likeCount,
      ...(likedByMe === undefined ? {} : { likedByMe }),
    },
    commentCount,
    reactionCount: likeCount,
    ...(likedByMe === undefined ? {} : { likedByMe }),
    createdAt,
    updatedAt,
    ...(publishedAt ? { publishedAt } : {}),
    timeLabel: formatTime(createdAt),
    isOwner: viewerId === authorId,
  };
}

function mapCommentRow(
  row: CommentRow,
  profiles: Map<string, ProfileRow>,
  viewerId: string | undefined,
): CommunityCommentPreview {
  const id = requiredString(row.id, 'Comment id');
  const postId = requiredString(row.post_id, 'Comment post');
  const authorId = requiredString(row.author_id, 'Comment author');
  const createdAt = requiredString(row.created_at, 'Comment creation time');
  if (Number.isNaN(Date.parse(createdAt))) throw new Error('Comment timestamp is invalid');

  const updatedAt = optionalString(row.updated_at);
  const parentCommentId = optionalString(row.parent_comment_id);
  const author = projectAuthor(authorId, profiles.get(authorId), viewerId);
  return {
    id,
    postId,
    authorId,
    author,
    authorName: author.displayName,
    authorInitial: author.initial,
    body: requiredString(row.body, 'Comment body'),
    ...(parentCommentId ? { parentCommentId } : {}),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
    timeLabel: formatTime(createdAt),
    isMine: viewerId === authorId,
  };
}

function normalizeResourceId(id: string): string | null {
  const value = id.trim();
  return value.length > 0 && value.length <= 128 ? value : null;
}

function validatePostInput(input: CreateCommunityPostInput): CommunityRepositoryError | null {
  const fieldErrors: Record<string, string> = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!title) fieldErrors.title = 'Enter a title.';
  else if (title.length > 160) fieldErrors.title = 'Use 160 characters or fewer.';
  if (!body) fieldErrors.body = 'Enter post content.';
  else if (body.length > 10_000) fieldErrors.body = 'Use 10,000 characters or fewer.';
  if (input.sport !== undefined && input.sport !== 'ski' && input.sport !== 'hockey') {
    fieldErrors.sport = 'Choose a supported sport.';
  }
  if (
    input.type !== undefined &&
    !['discussion', 'question', 'guide', 'review', 'event', 'announcement'].includes(input.type)
  ) {
    fieldErrors.type = 'Choose a supported post type.';
  }
  return Object.keys(fieldErrors).length ? validationError(fieldErrors) : null;
}

function validateCommentInput(input: CreateCommunityCommentInput): CommunityRepositoryError | null {
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) return validationError({ body: 'Enter a comment.' });
  if (body.length > 5_000) {
    return validationError({ body: 'Use 5,000 characters or fewer.' });
  }
  return null;
}

async function optionalViewerId(client: SupabaseClient): Promise<string | undefined> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return undefined;
    return optionalString(data.session?.user.id);
  } catch {
    return undefined;
  }
}

async function requireViewer(client: SupabaseClient): Promise<CommunityRepositoryResult<Viewer>> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return failure(mapRequestError(error));
    const id = optionalString(data.user?.id);
    return id ? success({ id }) : failure(unauthenticatedError());
  } catch (error) {
    return failure(mapRequestError(error));
  }
}

async function loadProfiles(
  client: SupabaseClient,
  authorIds: string[],
): Promise<CommunityRepositoryResult<Map<string, ProfileRow>>> {
  const uniqueIds = [...new Set(authorIds)];
  if (!uniqueIds.length) return success(new Map());

  const { data, error } = await client
    .from('public_community_authors')
    .select(PROFILE_SELECT)
    .in('id', uniqueIds);
  if (error) return failure(mapRequestError(error));

  const profiles = new Map<string, ProfileRow>();
  for (const value of (data ?? []) as ProfileRow[]) {
    if (typeof value.id === 'string') profiles.set(value.id, value);
  }
  return success(profiles);
}

async function loadPostSupplementalData(
  client: SupabaseClient,
  rows: PostRow[],
  viewerId: string | undefined,
): Promise<CommunityRepositoryResult<PostSupplementalData>> {
  const postIds = [...new Set(rows.map((row) => row.id))];
  const profileRequest = loadProfiles(
    client,
    rows.map((row) => row.author_id),
  );
  const reactionCountRequest = postIds.length
    ? client
        .from('community_post_reaction_counts')
        .select('post_id,like_count')
        .in('post_id', postIds)
    : Promise.resolve({ data: [], error: null });
  const likedRequest =
    viewerId && postIds.length
      ? client
          .from('community_reactions')
          .select('post_id')
          .eq('user_id', viewerId)
          .in('post_id', postIds)
      : Promise.resolve({ data: [], error: null });

  const [profileResult, reactionCountResult, likedResult] = await Promise.all([
    profileRequest,
    reactionCountRequest,
    likedRequest,
  ]);
  if (profileResult.error) return failure(profileResult.error);
  if (reactionCountResult.error) return failure(mapRequestError(reactionCountResult.error));
  if (likedResult.error) return failure(mapRequestError(likedResult.error));

  try {
    const likeCounts = new Map<string, number>();
    for (const row of (reactionCountResult.data ?? []) as ReactionCountRow[]) {
      likeCounts.set(requiredString(row.post_id, 'Reaction post'), parseCount(row.like_count));
    }
    const likedPostIds = new Set<string>();
    for (const row of (likedResult.data ?? []) as Array<{ post_id?: unknown }>) {
      likedPostIds.add(requiredString(row.post_id, 'Liked post'));
    }
    return success({
      profiles: profileResult.data,
      likeCounts,
      likedPostIds,
    });
  } catch {
    return failure(mappingError('Community counts could not be displayed.'));
  }
}

async function activePostExists(
  client: SupabaseClient,
  postId: string,
): Promise<CommunityRepositoryResult<true>> {
  const { data, error } = await client
    .from('community_posts')
    .select('id')
    .eq('id', postId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return failure(mapRequestError(error));
  return data ? success(true) : failure(notFoundError());
}

async function activePostAllowsWrite(
  client: SupabaseClient,
  postId: string,
): Promise<CommunityRepositoryResult<true>> {
  const { data, error } = await client
    .from('community_posts')
    .select('id,status')
    .eq('id', postId)
    .maybeSingle();
  if (error) return failure(mapRequestError(error));
  if (!data) return failure(notFoundError());
  return (data as { status?: unknown }).status === 'active'
    ? success(true)
    : failure(forbiddenError());
}

async function activeCommentCount(
  client: SupabaseClient,
  postId: string,
): Promise<CommunityRepositoryResult<number>> {
  const { count, error } = await client
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('status', 'active');
  if (error) return failure(mapRequestError(error));
  try {
    return success(parseCount(count));
  } catch {
    return failure(mappingError('The authoritative comment count is unavailable.'));
  }
}

async function loadLikeState(
  client: SupabaseClient,
  postId: string,
  viewerId: string,
): Promise<CommunityRepositoryResult<CommunityLikeState>> {
  const [countResult, ownResult] = await Promise.all([
    client
      .from('community_post_reaction_counts')
      .select('post_id,like_count')
      .eq('post_id', postId)
      .maybeSingle(),
    client
      .from('community_reactions')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', viewerId)
      .maybeSingle(),
  ]);
  if (countResult.error) return failure(mapRequestError(countResult.error));
  if (ownResult.error) return failure(mapRequestError(ownResult.error));
  if (!countResult.data) return failure(notFoundError());

  try {
    const likeCount = parseCount((countResult.data as ReactionCountRow).like_count);
    return success({
      postId,
      likeCount,
      reactionCount: likeCount,
      likedByMe: Boolean(ownResult.data),
    });
  } catch {
    return failure(mappingError('The authoritative like count is unavailable.'));
  }
}

function createUnavailableRepository(): CommunityRepository {
  const unavailable = async <T>(): Promise<CommunityRepositoryResult<T>> =>
    failure(configurationError());
  return {
    listPosts: unavailable,
    getPost: unavailable,
    createPost: unavailable,
    listComments: unavailable,
    createComment: unavailable,
    addLike: unavailable,
    removeLike: unavailable,
    publishDraft: unavailable,
  };
}

export function createSupabaseCommunityRepository(
  clientInput: SupabaseClient | null,
): CommunityRepository {
  if (!clientInput) return createUnavailableRepository();
  const client = clientInput;

  async function listPosts(
    options: CommunityPostPageOptions = {},
  ): Promise<CommunityRepositoryResult<CommunityPage<CommunityPostPreview>>> {
    const limit = normalizeCommunityPageSize(options.limit);
    if (!limit) return failure(validationError({ limit: 'Choose a page size from 1 to 50.' }));
    if (
      options.type !== undefined &&
      !['discussion', 'question', 'guide', 'review', 'event', 'announcement'].includes(options.type)
    ) {
      return failure(validationError({ type: 'Choose a supported post type.' }));
    }
    const cursor = decodeCommunityCursor(options.cursor);
    if (options.cursor && !cursor) {
      return failure(validationError({ cursor: 'The page cursor is invalid.' }));
    }

    let viewerId = await optionalViewerId(client);
    if (options.includeOwnDrafts) {
      const viewerResult = await requireViewer(client);
      if (viewerResult.error) return failure(viewerResult.error);
      viewerId = viewerResult.data.id;
    }

    let query = client
      .from('community_posts')
      .select(options.sport ? POST_SELECT_WITH_SPORT_FILTER : POST_SELECT)
      .eq('comments.status', 'active')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    query =
      options.includeOwnDrafts && viewerId
        ? query.or(`status.eq.active,and(status.eq.draft,author_id.eq.${viewerId})`)
        : query.eq('status', 'active');
    if (options.sport) query = query.eq('sports.slug', options.sport);
    if (options.type) {
      const dbType = options.type === 'event' ? 'meetup' : options.type;
      query = query.eq('post_type', dbType);
    }
    if (cursor) query = query.or(descendingCursorFilter(cursor));

    const { data, error } = await query;
    if (error) return failure(mapRequestError(error));

    const rows = ((data ?? []) as unknown as PostRow[]).slice();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const supplementalResult = await loadPostSupplementalData(client, pageRows, viewerId);
    if (supplementalResult.error) return failure(supplementalResult.error);

    try {
      const items = pageRows.map((row) => mapPostRow(row, supplementalResult.data, viewerId));
      const last = pageRows.at(-1);
      return success({
        items,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCommunityCursor({ createdAt: last.created_at, id: last.id })
            : null,
      });
    } catch {
      return failure(mappingError('Some community posts could not be displayed.'));
    }
  }

  async function getPost(id: string): Promise<CommunityRepositoryResult<CommunityPostPreview>> {
    const postId = normalizeResourceId(id);
    if (!postId) return failure(notFoundError());
    const viewerId = await optionalViewerId(client);

    let query = client
      .from('community_posts')
      .select(POST_SELECT)
      .eq('comments.status', 'active')
      .eq('id', postId);
    query = viewerId
      ? query.or(`status.eq.active,and(status.eq.draft,author_id.eq.${viewerId})`)
      : query.eq('status', 'active');

    const { data, error } = await query.maybeSingle();
    if (error) return failure(mapRequestError(error));
    if (!data) return failure(notFoundError());

    const row = data as unknown as PostRow;
    const supplementalResult = await loadPostSupplementalData(client, [row], viewerId);
    if (supplementalResult.error) return failure(supplementalResult.error);
    try {
      return success(mapPostRow(row, supplementalResult.data, viewerId));
    } catch {
      return failure(mappingError('This community post could not be displayed.'));
    }
  }

  async function createPost(
    input: CreateCommunityPostInput,
  ): Promise<CommunityRepositoryResult<CommunityPostPreview>> {
    const inputError = validatePostInput(input);
    if (inputError) return failure(inputError);
    const viewerResult = await requireViewer(client);
    if (viewerResult.error) return failure(viewerResult.error);
    const viewerId = viewerResult.data.id;

    let sportId: string | null = null;
    if (input.sport) {
      const { data: sport, error: sportError } = await client
        .from('sports')
        .select('id')
        .eq('slug', input.sport)
        .eq('is_active', true)
        .maybeSingle();
      if (sportError) return failure(mapRequestError(sportError));
      if (!sport) return failure(notFoundError());
      try {
        sportId = requiredString((sport as { id?: unknown }).id, 'Sport id');
      } catch {
        return failure(mappingError('The selected sport could not be read.'));
      }
    }

    const { data, error } = await client
      .from('community_posts')
      .insert({
        author_id: viewerId,
        sport_id: sportId,
        post_type: mapPostTypeForDatabase(input.type),
        title: input.title.trim(),
        body: input.body.trim(),
        status: 'draft',
        published_at: null,
      })
      .select(POST_SELECT)
      .eq('comments.status', 'active')
      .single();
    if (error) return failure(mapRequestError(error));
    if (!data) return failure({ ...mapRequestError(null), operationMayHaveSucceeded: true });

    const row = data as unknown as PostRow;
    const supplementalResult = await loadPostSupplementalData(client, [row], viewerId);
    if (supplementalResult.error) {
      return failure({ ...supplementalResult.error, operationMayHaveSucceeded: true });
    }
    try {
      return success(mapPostRow(row, supplementalResult.data, viewerId));
    } catch {
      return failure({
        ...mappingError('The draft was saved but could not be displayed.'),
        operationMayHaveSucceeded: true,
      });
    }
  }

  async function listComments(
    postIdInput: string,
    options: CommunityCommentPageOptions = {},
  ): Promise<CommunityRepositoryResult<CommunityPage<CommunityCommentPreview>>> {
    const postId = normalizeResourceId(postIdInput);
    if (!postId) return failure(notFoundError());
    const limit = normalizeCommunityPageSize(options.limit);
    if (!limit) return failure(validationError({ limit: 'Choose a page size from 1 to 50.' }));
    const cursor = decodeCommunityCursor(options.cursor);
    if (options.cursor && !cursor) {
      return failure(validationError({ cursor: 'The page cursor is invalid.' }));
    }

    const visiblePost = await activePostExists(client, postId);
    if (visiblePost.error) return failure(visiblePost.error);
    const viewerId = await optionalViewerId(client);

    let query = client
      .from('comments')
      .select(COMMENT_SELECT, { count: 'exact' })
      .eq('post_id', postId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit + 1);
    if (cursor) query = query.or(ascendingCursorFilter(cursor));

    const { data, count, error } = await query;
    if (error) return failure(mapRequestError(error));
    const rows = ((data ?? []) as unknown as CommentRow[]).slice();
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const profilesResult = await loadProfiles(
      client,
      pageRows.map((row) => row.author_id),
    );
    if (profilesResult.error) return failure(profilesResult.error);

    try {
      const totalCount = parseCount(count);
      const items = pageRows.map((row) => mapCommentRow(row, profilesResult.data, viewerId));
      const last = pageRows.at(-1);
      return success({
        items,
        totalCount,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCommunityCursor({ createdAt: last.created_at, id: last.id })
            : null,
      });
    } catch {
      return failure(mappingError('Some comments could not be displayed.'));
    }
  }

  async function createComment(
    postIdInput: string,
    input: CreateCommunityCommentInput,
  ): Promise<CommunityRepositoryResult<CommunityCommentMutation>> {
    const postId = normalizeResourceId(postIdInput);
    if (!postId) return failure(notFoundError());
    const inputError = validateCommentInput(input);
    if (inputError) return failure(inputError);
    const viewerResult = await requireViewer(client);
    if (viewerResult.error) return failure(viewerResult.error);
    const viewerId = viewerResult.data.id;
    const visiblePost = await activePostAllowsWrite(client, postId);
    if (visiblePost.error) return failure(visiblePost.error);

    const { data, error } = await client
      .from('comments')
      .insert({
        post_id: postId,
        author_id: viewerId,
        parent_comment_id: null,
        body: input.body.trim(),
        status: 'active',
      })
      .select(COMMENT_SELECT)
      .single();
    if (error) return failure(mapRequestError(error));
    if (!data) return failure({ ...mapRequestError(null), operationMayHaveSucceeded: true });

    const row = data as unknown as CommentRow;
    const [profilesResult, countResult] = await Promise.all([
      loadProfiles(client, [viewerId]),
      activeCommentCount(client, postId),
    ]);
    if (profilesResult.error) {
      return failure({ ...profilesResult.error, operationMayHaveSucceeded: true });
    }
    if (countResult.error) {
      return failure({ ...countResult.error, operationMayHaveSucceeded: true });
    }

    try {
      return success({
        comment: mapCommentRow(row, profilesResult.data, viewerId),
        commentCount: countResult.data,
      });
    } catch {
      return failure({
        ...mappingError('The comment was saved but could not be displayed.'),
        operationMayHaveSucceeded: true,
      });
    }
  }

  async function mutateLike(
    postIdInput: string,
    liked: boolean,
  ): Promise<CommunityRepositoryResult<CommunityLikeState>> {
    const postId = normalizeResourceId(postIdInput);
    if (!postId) return failure(notFoundError());
    const viewerResult = await requireViewer(client);
    if (viewerResult.error) return failure(viewerResult.error);
    const viewerId = viewerResult.data.id;
    const visiblePost = await activePostAllowsWrite(client, postId);
    if (visiblePost.error) return failure(visiblePost.error);

    let writeError: unknown = null;
    if (liked) {
      const result = await client
        .from('community_reactions')
        .upsert(
          { post_id: postId, user_id: viewerId },
          { onConflict: 'post_id,user_id', ignoreDuplicates: true },
        );
      writeError = result.error;
      // ON CONFLICT DO NOTHING is the intended path. Treat a duplicate from an
      // older PostgREST deployment as the same idempotent success.
      if (String(readErrorField(writeError, 'code') ?? '') === '23505') writeError = null;
    } else {
      const result = await client
        .from('community_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', viewerId);
      writeError = result.error;
    }
    if (writeError) return failure(mapRequestError(writeError));

    const stateResult = await loadLikeState(client, postId, viewerId);
    if (stateResult.error) {
      return failure({ ...stateResult.error, operationMayHaveSucceeded: true });
    }
    return stateResult;
  }

  async function publishDraft(
    postIdInput: string,
  ): Promise<CommunityRepositoryResult<CommunityPostPreview>> {
    const postId = normalizeResourceId(postIdInput);
    if (!postId) return failure(notFoundError());
    const viewerResult = await requireViewer(client);
    if (viewerResult.error) return failure(viewerResult.error);
    const viewerId = viewerResult.data.id;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role,is_banned')
      .eq('id', viewerId)
      .maybeSingle();
    if (profileError) return failure(mapRequestError(profileError));
    const role = (profile as { role?: unknown } | null)?.role;
    const isBanned = (profile as { is_banned?: unknown } | null)?.is_banned;
    if ((role !== 'moderator' && role !== 'admin') || isBanned !== false) {
      return failure(forbiddenError());
    }

    const { data, error } = await client
      .from('community_posts')
      // published_at is deliberately absent: the database transition trigger
      // owns it and records the operator audit event.
      .update({ status: 'active' })
      .eq('id', postId)
      .eq('status', 'draft')
      .select(POST_SELECT)
      .eq('comments.status', 'active')
      .maybeSingle();
    if (error) return failure(mapRequestError(error));
    if (!data) {
      const current = await client
        .from('community_posts')
        .select('id,status')
        .eq('id', postId)
        .maybeSingle();
      if (current.error) return failure(mapRequestError(current.error));
      if (!current.data) return failure(notFoundError());
      return failure({
        code: 'conflict',
        kind: 'conflict',
        message: 'Only a draft can be published.',
        retryable: false,
      });
    }

    const row = data as unknown as PostRow;
    const supplementalResult = await loadPostSupplementalData(client, [row], viewerId);
    if (supplementalResult.error) {
      return failure({ ...supplementalResult.error, operationMayHaveSucceeded: true });
    }
    try {
      return success(mapPostRow(row, supplementalResult.data, viewerId));
    } catch {
      return failure({
        ...mappingError('The post was published but could not be displayed.'),
        operationMayHaveSucceeded: true,
      });
    }
  }

  return {
    listPosts,
    getPost,
    createPost,
    listComments,
    createComment,
    addLike: (postId) => mutateLike(postId, true),
    removeLike: (postId) => mutateLike(postId, false),
    publishDraft,
  };
}
