'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};
const supabaseClientPath = require.resolve('../supabase/client.ts');
require.cache[supabaseClientPath] = {
  id: supabaseClientPath,
  filename: supabaseClientPath,
  loaded: true,
  exports: { supabase: null },
};

const LISTING_A = '00000000-0000-4000-8000-00000000000a';
const LISTING_B = '00000000-0000-4000-8000-00000000000b';
const LISTING_C = '00000000-0000-4000-8000-00000000000c';
const {
  createFavoriteOptimisticState,
  createFavoriteRepository,
  favoriteOptimisticReducer,
} = require('./repository.ts');

function createFakeClient({ userId = 'session-user', rows = [] } = {}) {
  const favorites = new Map(rows.map((row) => [row.listing_id, { ...row }]));
  const events = [];

  class Query {
    constructor(operation) {
      this.operation = operation;
      this.filters = {};
      this.limitValue = undefined;
      this.orFilter = undefined;
    }

    select() {
      return this;
    }

    eq(column, value) {
      this.filters[column] = value;
      return this;
    }

    order() {
      return this;
    }

    limit(value) {
      this.limitValue = value;
      return this;
    }

    or(value) {
      this.orFilter = value;
      return this;
    }

    maybeSingle() {
      return this.execute(true);
    }

    then(resolve, reject) {
      return this.execute(false).then(resolve, reject);
    }

    async execute(single) {
      events.push(this.operation);
      if (this.operation === 'delete') {
        favorites.delete(this.filters.listing_id);
        return { data: null, error: null };
      }

      let selected = [...favorites.values()]
        .filter((row) => !this.filters.user_id || row.user_id === this.filters.user_id)
        .filter((row) => !this.filters.listing_id || row.listing_id === this.filters.listing_id)
        .sort(
          (left, right) =>
            right.created_at.localeCompare(left.created_at) ||
            right.listing_id.localeCompare(left.listing_id),
        );

      if (this.orFilter) {
        const match = this.orFilter.match(
          /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),listing_id\.lt\.([^)]+)\)$/,
        );
        assert.ok(match, `unexpected cursor filter: ${this.orFilter}`);
        const [, beforeDate, equalDate, beforeId] = match;
        selected = selected.filter(
          (row) =>
            row.created_at < beforeDate ||
            (row.created_at === equalDate && row.listing_id < beforeId),
        );
      }

      if (this.limitValue !== undefined) selected = selected.slice(0, this.limitValue);
      const data = selected.map(({ listing_id, created_at }) => ({ listing_id, created_at }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    }
  }

  return {
    auth: {
      async getSession() {
        events.push('session');
        return {
          data: { session: userId ? { user: { id: userId } } : null },
          error: null,
        };
      },
    },
    from(table) {
      assert.equal(table, 'favorites');
      return {
        select() {
          return new Query('select');
        },
        delete() {
          return new Query('delete');
        },
        async upsert(row, options) {
          events.push('upsert');
          assert.deepEqual(options, {
            onConflict: 'user_id,listing_id',
            ignoreDuplicates: true,
          });
          if (!favorites.has(row.listing_id)) {
            favorites.set(row.listing_id, {
              ...row,
              created_at: `2026-08-14T00:00:0${favorites.size}.000Z`,
            });
          }
          return { data: null, error: null };
        },
      };
    },
    events,
    favorites,
  };
}

test('uses the active session owner and returns authentication-required results', async () => {
  const anonymous = createFavoriteRepository(createFakeClient({ userId: null }));
  const anonymousResult = await anonymous.add(LISTING_A);
  assert.equal(anonymousResult.error?.code, 'authentication_required');

  const client = createFakeClient({ userId: 'active-session-user' });
  const repository = createFavoriteRepository(client);
  assert.deepEqual(await repository.add(LISTING_A), {
    data: { listingId: LISTING_A, isFavorite: true },
    error: null,
  });
  assert.equal(client.favorites.get(LISTING_A).user_id, 'active-session-user');
});

test('paginates newest-first with a stable created-at and listing-id cursor', async () => {
  const client = createFakeClient({
    rows: [
      { user_id: 'session-user', listing_id: LISTING_C, created_at: '2026-08-14T03:00:00.000Z' },
      { user_id: 'session-user', listing_id: LISTING_B, created_at: '2026-08-14T02:00:00.000Z' },
      { user_id: 'session-user', listing_id: LISTING_A, created_at: '2026-08-14T01:00:00.000Z' },
    ],
  });
  const repository = createFavoriteRepository(client);

  const first = await repository.list({ limit: 2 });
  assert.deepEqual(
    first.data?.items.map((item) => item.listingId),
    [LISTING_C, LISTING_B],
  );
  assert.deepEqual(first.data?.nextCursor, {
    createdAt: '2026-08-14T02:00:00.000Z',
    listingId: LISTING_B,
  });

  const second = await repository.list({ limit: 2, cursor: first.data.nextCursor });
  assert.deepEqual(
    second.data?.items.map((item) => item.listingId),
    [LISTING_A],
  );
  assert.equal(second.data?.nextCursor, null);
});

test('serializes duplicate toggles and keeps add/remove idempotent', async () => {
  const client = createFakeClient();
  const repository = createFavoriteRepository(client);

  const [firstToggle, secondToggle] = await Promise.all([
    repository.toggle(LISTING_A),
    repository.toggle(LISTING_A),
  ]);
  assert.equal(firstToggle.data?.isFavorite, true);
  assert.equal(secondToggle.data?.isFavorite, false);
  assert.equal(client.favorites.size, 0);
  assert.deepEqual(client.events, ['session', 'select', 'upsert', 'session', 'select', 'delete']);

  await Promise.all([repository.add(LISTING_A), repository.add(LISTING_A)]);
  assert.equal(client.favorites.size, 1);
  await Promise.all([repository.remove(LISTING_A), repository.remove(LISTING_A)]);
  assert.equal(client.favorites.size, 0);
});

test('optimistic reducer rolls back deterministic failures and flags uncertain failures', () => {
  const initial = createFavoriteOptimisticState();
  const pending = favoriteOptimisticReducer(initial, {
    type: 'begin',
    listingId: LISTING_A,
    operationId: 'op-1',
    nextValue: true,
  });
  assert.equal(pending.values[LISTING_A], true);

  const rejected = favoriteOptimisticReducer(pending, {
    type: 'fail',
    listingId: LISTING_A,
    operationId: 'op-1',
    errorCode: 'authentication_required',
  });
  assert.equal(rejected.values[LISTING_A], false);
  assert.equal(rejected.refetchRequired, false);

  const retryPending = favoriteOptimisticReducer(rejected, {
    type: 'begin',
    listingId: LISTING_A,
    operationId: 'op-2',
    nextValue: true,
  });
  const uncertain = favoriteOptimisticReducer(retryPending, {
    type: 'fail',
    listingId: LISTING_A,
    operationId: 'op-2',
    errorCode: 'request_failed',
  });
  assert.equal(uncertain.values[LISTING_A], false);
  assert.equal(uncertain.refetchRequired, true);

  const refetched = favoriteOptimisticReducer(uncertain, {
    type: 'refetched',
    values: { [LISTING_A]: true },
  });
  assert.deepEqual(refetched.values, { [LISTING_A]: true });
  assert.equal(refetched.refetchRequired, false);
});
