import assert from 'node:assert/strict';
import test from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  communityCommentsOptimisticReducer,
  communityReactionOptimisticReducer,
  createCommunityCommentsOptimisticState,
  createCommunityReactionOptimisticState,
} from './optimistic';
import { createSupabaseCommunityRepository } from './repository-core';
import type { CommunityCommentPreview, CommunityRepositoryError } from './types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const POST_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_POST_ID = '33333333-3333-4333-8333-333333333333';
const COMMENT_ID = '44444444-4444-4444-8444-444444444444';

interface ScriptedResponse {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

interface Operation {
  name: string;
  args: unknown[];
}

interface QueryCall {
  table: string;
  operations: Operation[];
}

class ScriptedQuery implements PromiseLike<ScriptedResponse> {
  constructor(
    private readonly response: ScriptedResponse,
    readonly call: QueryCall,
  ) {}

  private operation(name: string, ...args: unknown[]): this {
    this.call.operations.push({ name, args });
    return this;
  }

  select(...args: unknown[]) {
    return this.operation('select', ...args);
  }
  eq(...args: unknown[]) {
    return this.operation('eq', ...args);
  }
  in(...args: unknown[]) {
    return this.operation('in', ...args);
  }
  or(...args: unknown[]) {
    return this.operation('or', ...args);
  }
  order(...args: unknown[]) {
    return this.operation('order', ...args);
  }
  limit(...args: unknown[]) {
    return this.operation('limit', ...args);
  }
  is(...args: unknown[]) {
    return this.operation('is', ...args);
  }
  insert(...args: unknown[]) {
    return this.operation('insert', ...args);
  }
  update(...args: unknown[]) {
    return this.operation('update', ...args);
  }
  upsert(...args: unknown[]) {
    return this.operation('upsert', ...args);
  }
  delete(...args: unknown[]) {
    return this.operation('delete', ...args);
  }

  single(): Promise<ScriptedResponse> {
    this.operation('single');
    return Promise.resolve(this.response);
  }

  maybeSingle(): Promise<ScriptedResponse> {
    this.operation('maybeSingle');
    return Promise.resolve(this.response);
  }

  then<TResult1 = ScriptedResponse, TResult2 = never>(
    onfulfilled?: ((value: ScriptedResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

class ScriptedClient {
  readonly calls: QueryCall[] = [];
  readonly auth: {
    getSession: () => Promise<ScriptedResponse>;
    getUser: () => Promise<ScriptedResponse>;
  };

  constructor(
    private readonly scripts: Record<string, ScriptedResponse[]>,
    userId?: string,
  ) {
    this.auth = {
      getSession: async () => ({
        data: { session: userId ? { user: { id: userId } } : null },
        error: null,
      }),
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    };
  }

  from(table: string): ScriptedQuery {
    const response = this.scripts[table]?.shift();
    if (!response) throw new Error(`No scripted response for ${table}`);
    const call = { table, operations: [] } satisfies QueryCall;
    this.calls.push(call);
    return new ScriptedQuery({ error: null, ...response }, call);
  }

  asSupabase(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

function postRow(
  id = POST_ID,
  status = 'active',
  createdAt = '2026-08-14T10:00:00.000Z',
  postType = 'discussion',
) {
  return {
    id,
    author_id: USER_ID,
    sport_id: null,
    post_type: postType,
    title: 'Community title',
    body: 'Community body',
    status,
    published_at: status === 'active' ? createdAt : null,
    created_at: createdAt,
    updated_at: createdAt,
    sports: null,
    comments: [{ count: status === 'active' ? 3 : 0 }],
  };
}

function commentRow() {
  return {
    id: COMMENT_ID,
    post_id: POST_ID,
    author_id: USER_ID,
    parent_comment_id: null,
    body: 'A useful comment',
    status: 'active',
    created_at: '2026-08-14T10:10:00.000Z',
    updated_at: '2026-08-14T10:10:00.000Z',
  };
}

function findCall(client: ScriptedClient, table: string, operation: string): QueryCall {
  const call = client.calls.find(
    (candidate) =>
      candidate.table === table && candidate.operations.some((item) => item.name === operation),
  );
  assert.ok(call, `Expected ${operation} call on ${table}`);
  return call;
}

test('active feed uses stable keyset pagination and authoritative aggregates', async () => {
  const client = new ScriptedClient({
    community_posts: [
      { data: [postRow(), postRow(SECOND_POST_ID, 'active', '2026-08-13T10:00:00.000Z')] },
    ],
    public_community_authors: [{ data: [] }],
    community_post_reaction_counts: [{ data: [{ post_id: POST_ID, like_count: '8' }] }],
  });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listPosts({ limit: 1 });

  assert.equal(result.error, null);
  assert.equal(result.data?.items.length, 1);
  assert.equal(result.data?.items[0]?.commentCount, 3);
  assert.equal(result.data?.items[0]?.reactionCount, 8);
  assert.equal(result.data?.hasMore, true);
  assert.ok(result.data?.nextCursor);
  const call = findCall(client, 'community_posts', 'limit');
  assert.deepEqual(
    call.operations.filter((item) => item.name === 'order').map((item) => item.args[0]),
    ['created_at', 'id'],
  );
  assert.ok(
    call.operations.some(
      (item) => item.name === 'eq' && item.args[0] === 'status' && item.args[1] === 'active',
    ),
  );
  assert.ok(call.operations.some((item) => item.name === 'limit' && item.args[0] === 2));
});

test('public read failures are typed as network errors instead of demo fallback', async () => {
  const client = new ScriptedClient({
    community_posts: [{ data: null, error: { message: 'Failed to fetch' } }],
  });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listPosts();

  assert.equal(result.data, null);
  assert.equal(result.error?.code, 'network_error');
  assert.equal(result.error?.kind, 'network');
});

test('inaccessible detail rows have a typed not-found result', async () => {
  const client = new ScriptedClient({ community_posts: [{ data: null }] });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.getPost(POST_ID);

  assert.equal(result.error?.code, 'not_found');
});

test('owner draft visibility is explicitly authenticated and scoped to the author', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [{ data: [postRow(POST_ID, 'draft')] }],
      public_community_authors: [
        { data: [{ id: USER_ID, display_name: 'Owner', avatar_url: null }] },
      ],
      community_post_reaction_counts: [{ data: [] }],
      community_reactions: [{ data: [] }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listPosts({ includeOwnDrafts: true });

  assert.equal(result.data?.items[0]?.status, 'draft');
  assert.equal(result.data?.items[0]?.isOwner, true);
  const call = findCall(client, 'community_posts', 'or');
  const visibility = call.operations.find((item) => item.name === 'or')?.args[0];
  assert.equal(visibility, `status.eq.active,and(status.eq.draft,author_id.eq.${USER_ID})`);
});

test('post creation derives the author and can only request a draft with post_type', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [{ data: postRow(POST_ID, 'draft') }],
      public_community_authors: [
        { data: [{ id: USER_ID, display_name: 'Owner', avatar_url: null }] },
      ],
      community_post_reaction_counts: [{ data: [] }],
      community_reactions: [{ data: [] }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.createPost({ title: '  Draft title  ', body: ' Draft body ' });

  assert.equal(result.data?.status, 'draft');
  const call = findCall(client, 'community_posts', 'insert');
  const payload = call.operations.find((item) => item.name === 'insert')?.args[0] as Record<
    string,
    unknown
  >;
  assert.deepEqual(payload, {
    author_id: USER_ID,
    sport_id: null,
    post_type: 'discussion',
    title: 'Draft title',
    body: 'Draft body',
    status: 'draft',
    published_at: null,
  });
});

test('post creation returns a typed auth error before any write', async () => {
  const client = new ScriptedClient({});
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.createPost({ title: 'Draft title', body: 'Draft body' });

  assert.equal(result.error?.code, 'unauthenticated');
  assert.equal(client.calls.length, 0);
});

test('comment pages are active-post-only and return the exact total', async () => {
  const client = new ScriptedClient({
    community_posts: [{ data: { id: POST_ID } }],
    comments: [{ data: [commentRow()], count: 1 }],
    public_community_authors: [{ data: [] }],
  });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listComments(POST_ID, { limit: 10 });

  assert.equal(result.data?.totalCount, 1);
  assert.equal(result.data?.items[0]?.id, COMMENT_ID);
  const call = findCall(client, 'comments', 'select');
  const select = call.operations.find((item) => item.name === 'select');
  assert.deepEqual(select?.args[1], { count: 'exact' });
  assert.ok(
    call.operations.some(
      (item) => item.name === 'eq' && item.args[0] === 'status' && item.args[1] === 'active',
    ),
  );
});

test('comment creation writes the session author and reconciles an exact count', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [{ data: { id: POST_ID, status: 'active' } }],
      comments: [{ data: commentRow() }, { data: null, count: 4 }],
      public_community_authors: [
        { data: [{ id: USER_ID, display_name: 'Owner', avatar_url: null }] },
      ],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.createComment(POST_ID, { body: '  A useful comment  ' });

  assert.equal(result.data?.commentCount, 4);
  const insertCall = findCall(client, 'comments', 'insert');
  assert.deepEqual(insertCall.operations.find((item) => item.name === 'insert')?.args[0], {
    post_id: POST_ID,
    author_id: USER_ID,
    parent_comment_id: null,
    body: 'A useful comment',
    status: 'active',
  });
  const countCall = client.calls.find(
    (call) =>
      call.table === 'comments' &&
      call.operations.some(
        (item) => item.name === 'select' && (item.args[1] as { head?: boolean })?.head,
      ),
  );
  assert.ok(countCall);
});

test('like add is idempotent and reconciles from aggregate and owner-only rows', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [{ data: { id: POST_ID, status: 'active' } }],
      community_reactions: [{ data: null }, { data: { post_id: POST_ID } }],
      community_post_reaction_counts: [{ data: { post_id: POST_ID, like_count: 9 } }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.addLike(POST_ID);

  assert.deepEqual(result.data, {
    postId: POST_ID,
    likeCount: 9,
    reactionCount: 9,
    likedByMe: true,
  });
  const call = findCall(client, 'community_reactions', 'upsert');
  const upsert = call.operations.find((item) => item.name === 'upsert');
  assert.deepEqual(upsert?.args[0], { post_id: POST_ID, user_id: USER_ID });
  assert.deepEqual(upsert?.args[1], {
    onConflict: 'post_id,user_id',
    ignoreDuplicates: true,
  });
});

test('like removal is idempotent and scoped to the current user', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [{ data: { id: POST_ID, status: 'active' } }],
      community_reactions: [{ data: null }, { data: null }],
      community_post_reaction_counts: [{ data: { post_id: POST_ID, like_count: 8 } }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.removeLike(POST_ID);

  assert.equal(result.data?.likedByMe, false);
  assert.equal(result.data?.likeCount, 8);
  const call = findCall(client, 'community_reactions', 'delete');
  assert.ok(
    call.operations.some(
      (item) => item.name === 'eq' && item.args[0] === 'post_id' && item.args[1] === POST_ID,
    ),
  );
  assert.ok(
    call.operations.some(
      (item) => item.name === 'eq' && item.args[0] === 'user_id' && item.args[1] === USER_ID,
    ),
  );
});

test('authenticated writes to a visible draft return a typed permission error', async () => {
  const client = new ScriptedClient(
    { community_posts: [{ data: { id: POST_ID, status: 'draft' } }] },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.addLike(POST_ID);

  assert.equal(result.error?.code, 'forbidden');
  assert.equal(result.error?.kind, 'permission');
  assert.equal(
    client.calls.some((call) => call.table === 'community_reactions'),
    false,
  );
});

test('ordinary users cannot invoke the operator publication write', async () => {
  const client = new ScriptedClient(
    {
      profiles: [{ data: { role: 'user', is_banned: false } }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.publishDraft(POST_ID);

  assert.equal(result.error?.code, 'forbidden');
  assert.equal(
    client.calls.some((call) => call.table === 'community_posts'),
    false,
  );
});

test('operator publication changes status only and leaves timestamps/audit to the database', async () => {
  const client = new ScriptedClient(
    {
      profiles: [{ data: { role: 'moderator', is_banned: false } }],
      public_community_authors: [
        { data: [{ id: USER_ID, display_name: 'Moderator', avatar_url: null }] },
      ],
      community_posts: [{ data: postRow(POST_ID, 'active') }],
      community_post_reaction_counts: [{ data: [{ post_id: POST_ID, like_count: 0 }] }],
      community_reactions: [{ data: [] }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.publishDraft(POST_ID);

  assert.equal(result.data?.status, 'active');
  const call = findCall(client, 'community_posts', 'update');
  assert.deepEqual(call.operations.find((item) => item.name === 'update')?.args[0], {
    status: 'active',
  });
});

const rollbackError: CommunityRepositoryError = {
  code: 'network_error',
  kind: 'network',
  message: 'offline',
  retryable: true,
};

test('reaction optimistic reducer ignores duplicate taps and rolls back the matching request', () => {
  const initial = createCommunityReactionOptimisticState({ likeCount: 4, likedByMe: false });
  const pending = communityReactionOptimisticReducer(initial, {
    type: 'begin',
    mutationId: 'like-1',
  });
  const duplicate = communityReactionOptimisticReducer(pending, {
    type: 'begin',
    mutationId: 'like-2',
  });
  const staleRollback = communityReactionOptimisticReducer(duplicate, {
    type: 'rollback',
    mutationId: 'like-2',
    error: rollbackError,
  });
  const rolledBack = communityReactionOptimisticReducer(staleRollback, {
    type: 'rollback',
    mutationId: 'like-1',
    error: rollbackError,
  });

  assert.equal(pending.likeCount, 5);
  assert.equal(duplicate, pending);
  assert.equal(staleRollback, pending);
  assert.equal(rolledBack.likeCount, 4);
  assert.equal(rolledBack.likedByMe, false);
});

test('comment optimistic reducer removes the temporary row on rollback', () => {
  const comment: CommunityCommentPreview = {
    id: 'temp-comment-1',
    postId: POST_ID,
    authorId: USER_ID,
    author: { id: USER_ID, displayName: 'Me', initial: 'M' },
    authorName: 'Me',
    authorInitial: 'M',
    body: 'Pending',
    createdAt: '2026-08-14T10:00:00.000Z',
    timeLabel: '방금 전',
    isMine: true,
  };
  const initial = createCommunityCommentsOptimisticState([], 2);
  const pending = communityCommentsOptimisticReducer(initial, {
    type: 'begin',
    mutationId: 'comment-1',
    comment,
  });
  const rolledBack = communityCommentsOptimisticReducer(pending, {
    type: 'rollback',
    mutationId: 'comment-1',
    error: rollbackError,
  });

  assert.equal(pending.comments.length, 1);
  assert.equal(pending.commentCount, 3);
  assert.equal(rolledBack.comments.length, 0);
  assert.equal(rolledBack.commentCount, 2);
});
test('listPosts filters by post_type and maps event to meetup in queries', async () => {
  const client = new ScriptedClient({
    community_posts: [{ data: [postRow(POST_ID, 'active', '2026-08-14T10:00:00.000Z', 'meetup')] }],
    public_community_authors: [{ data: [] }],
    community_post_reaction_counts: [{ data: [{ post_id: POST_ID, like_count: 2 }] }],
  });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listPosts({ type: 'event' });

  assert.equal(result.error, null);
  assert.equal(result.data?.items[0]?.type, 'event');
  const call = findCall(client, 'community_posts', 'eq');
  assert.ok(
    call.operations.some(
      (item) => item.name === 'eq' && item.args[0] === 'post_type' && item.args[1] === 'meetup',
    ),
  );
});

test('createPost accepts optional type and maps event to meetup for database insertion', async () => {
  const client = new ScriptedClient(
    {
      community_posts: [
        { data: postRow(POST_ID, 'draft', '2026-08-14T10:00:00.000Z', 'question') },
      ],
      public_community_authors: [
        { data: [{ id: USER_ID, display_name: 'Owner', avatar_url: null }] },
      ],
      community_post_reaction_counts: [{ data: [] }],
      community_reactions: [{ data: [] }],
    },
    USER_ID,
  );
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.createPost({
    title: 'Question title',
    body: 'Question body',
    type: 'question',
  });

  assert.equal(result.data?.type, 'question');
  const call = findCall(client, 'community_posts', 'insert');
  const payload = call.operations.find((item) => item.name === 'insert')?.args[0] as Record<
    string,
    unknown
  >;
  assert.equal(payload.post_type, 'question');
});

test('authors are loaded from public_community_authors view with safe missing-author fallback', async () => {
  const client = new ScriptedClient({
    community_posts: [
      { data: [postRow(POST_ID), postRow(SECOND_POST_ID, 'active', '2026-08-13T10:00:00.000Z')] },
    ],
    public_community_authors: [
      {
        data: [
          { id: USER_ID, display_name: 'Known Author', avatar_url: 'https://example.com/a.png' },
        ],
      },
    ],
    community_post_reaction_counts: [
      {
        data: [
          { post_id: POST_ID, like_count: 1 },
          { post_id: SECOND_POST_ID, like_count: 0 },
        ],
      },
    ],
  });
  const repository = createSupabaseCommunityRepository(client.asSupabase());

  const result = await repository.listPosts();

  assert.equal(result.error, null);
  assert.equal(result.data?.items[0]?.author.displayName, 'Known Author');
  assert.equal(result.data?.items[0]?.author.avatarUrl, 'https://example.com/a.png');
  const authorCall = findCall(client, 'public_community_authors', 'in');
  assert.equal(authorCall.table, 'public_community_authors');
});
