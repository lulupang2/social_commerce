import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

import {
  createSupabaseModerationRepository,
  filterBlockedContent,
  isValidUuid,
  normalizeReportReason,
  normalizeReportTargetType,
} from './repository';

const REPORTER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const BLOCKED_USER_ID = '33333333-3333-4333-8333-333333333333';

interface QueryCall {
  table: string;
  op: string;
  payload?: unknown;
  filters?: Array<{ field: string; op: string; val: unknown }>;
}

class ScriptedQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(
    private readonly response: { data: unknown; error: unknown },
    readonly call: QueryCall,
  ) {}

  select() {
    return this;
  }
  insert(payload: unknown) {
    this.call.op = 'insert';
    this.call.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.call.op = 'update';
    this.call.payload = payload;
    return this;
  }
  delete() {
    this.call.op = 'delete';
    return this;
  }
  eq(field: string, val: unknown) {
    this.call.filters = this.call.filters || [];
    this.call.filters.push({ field, op: 'eq', val });
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.response);
  }
  single() {
    return Promise.resolve(this.response);
  }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

class ScriptedClient {
  readonly calls: QueryCall[] = [];
  constructor(
    private readonly authUser: { id: string } | null,
    private readonly responses: Record<string, { data: unknown; error: unknown }>,
  ) {}

  auth = {
    getSession: async () => ({
      data: {
        session: this.authUser ? ({ user: { id: this.authUser.id } } as unknown as Session) : null,
      },
      error: null,
    }),
  };

  from(table: string) {
    const resp = this.responses[table] || { data: null, error: null };
    const call: QueryCall = { table, op: 'select' };
    this.calls.push(call);
    return new ScriptedQuery(resp, call);
  }
}

test('normalizes target type and report reasons correctly', () => {
  assert.equal(normalizeReportTargetType('post'), 'community_post');
  assert.equal(normalizeReportTargetType('listing'), 'listing');

  assert.equal(normalizeReportReason('scam'), 'fraud');
  assert.equal(normalizeReportReason('hate_speech'), 'harassment');
  assert.equal(normalizeReportReason('unsafe_meetup'), 'other');
  assert.equal(normalizeReportReason('spam'), 'spam');
});

test('validates UUID strings', () => {
  assert.equal(isValidUuid(TARGET_ID), true);
  assert.equal(isValidUuid('invalid-uuid'), false);
  assert.equal(isValidUuid(''), false);
});

test('submits report idempotently when existing report is found', async () => {
  const existingReport = {
    id: '99999999-9999-4999-8999-999999999999',
    reporter_id: REPORTER_ID,
    target_type: 'community_post',
    target_id: TARGET_ID,
    reason: 'spam',
    details: 'Spam post details',
    status: 'open',
    created_at: '2026-08-14T10:00:00.000Z',
    updated_at: '2026-08-14T10:00:00.000Z',
  };

  const client = new ScriptedClient(
    { id: REPORTER_ID },
    { reports: { data: existingReport, error: null } },
  );
  const repo = createSupabaseModerationRepository(client as unknown as SupabaseClient);

  const res = await repo.submitReport({
    targetType: 'post',
    targetId: TARGET_ID,
    reason: 'spam',
    details: 'Spam post details',
  });

  assert.equal(res.error, null);
  assert.equal(res.data?.id, existingReport.id);
  assert.equal(res.data?.targetType, 'community_post');
});

test('rejects self-blocking with self_block_forbidden code', async () => {
  const client = new ScriptedClient({ id: REPORTER_ID }, {});
  const repo = createSupabaseModerationRepository(client as unknown as SupabaseClient);

  const res = await repo.blockUser(REPORTER_ID);
  assert.equal(res.data, null);
  assert.equal(res.error?.code, 'self_block_forbidden');
});

test('blocks user idempotently and queries blocked list', async () => {
  const blockRow = {
    blocker_id: REPORTER_ID,
    blocked_id: BLOCKED_USER_ID,
    created_at: '2026-08-14T10:00:00.000Z',
  };

  const client = new ScriptedClient(
    { id: REPORTER_ID },
    { blocks: { data: [blockRow], error: null } },
  );
  const repo = createSupabaseModerationRepository(client as unknown as SupabaseClient);

  const listRes = await repo.getBlockedUserIds();
  assert.equal(listRes.error, null);
  assert.equal(listRes.data?.has(BLOCKED_USER_ID), true);

  const isBlockedRes = await repo.isUserBlocked(BLOCKED_USER_ID);
  assert.equal(isBlockedRes.error, null);
  assert.equal(isBlockedRes.data, true);
});

test('filters blocked content from author lists', () => {
  const items = [
    { id: '1', authorId: 'user-a', title: 'Post A' },
    { id: '2', authorId: BLOCKED_USER_ID, title: 'Post B' },
    { id: '3', authorId: 'user-c', title: 'Post C' },
  ];

  const blockedSet = new Set([BLOCKED_USER_ID]);
  const filtered = filterBlockedContent(items, (item) => item.authorId, blockedSet);

  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((f) => f.id),
    ['1', '3'],
  );
});

test('checks operator role and rejects general users from publication updates', async () => {
  const normalUserClient = new ScriptedClient(
    { id: REPORTER_ID },
    { profiles: { data: { role: 'user', is_banned: false }, error: null } },
  );
  const normalRepo = createSupabaseModerationRepository(
    normalUserClient as unknown as SupabaseClient,
  );

  const roleRes = await normalRepo.checkOperatorRole();
  assert.equal(roleRes.error, null);
  assert.equal(roleRes.data?.isOperator, false);

  const pubRes = await normalRepo.updatePublicationStatus({
    targetType: 'community_post',
    targetId: TARGET_ID,
    nextStatus: 'active',
  });
  assert.equal(pubRes.data, null);
  assert.equal(pubRes.error?.code, 'forbidden');
});
