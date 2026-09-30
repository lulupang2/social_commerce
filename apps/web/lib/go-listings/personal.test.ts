import assert from 'node:assert/strict';
import test from 'node:test';
import { getMemberProfile, listPersonalListings, setGoFavorite, updateMemberProfile } from './personal';

const id = '11111111-1111-4111-8111-111111111111';
const session = { member: { id }, csrfToken: 'fixture-csrf' };

test('profile and favorites reject invalid response and failed writes rather than persisting success', async (t) => {
  const mocked = t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/session')) return Response.json(session);
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), 'fixture-csrf');
    return Response.json({ code: 'MEMBER_DATA_UNAVAILABLE', message: 'fixture failure' }, { status: 503 });
  });
  const save = await setGoFavorite(id, true, id);
  assert.deepEqual(save, { ok: false, status: 503, message: '회원 요청을 처리하지 못했어요.' });
  const update = await updateMemberProfile({ displayName: 'Buyer A', surfSkill: 'expert', tennisSkill: 'beginner', preferredSport: 'surf', maxBudgetKrw: 200000, preferredRegion: '양양' }, id);
  assert.equal(update.ok, false);
  mocked.mock.mockImplementation(async () => Response.json({ id, displayName: 'Buyer A', surfSkill: 'expert', tennisSkill: 'beginner', preferredSport: 'surf', maxBudgetKrw: 200000, preferredRegion: '양양', savedCount: 'one', transactionCount: 0 }));
  assert.equal((await getMemberProfile()).ok, false);
  mocked.mock.mockImplementation(async () => Response.json({ items: null }));
  assert.equal((await listPersonalListings('favorites')).ok, false);
});

test('signed-out member cannot write favorite without sending mutation', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    return Response.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  });
  assert.equal((await setGoFavorite(id, false, id)).ok, false);
  assert.deepEqual(requests, ['/api/v1/auth/session']);
});

test('account switch between click and write never mutates the new member', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    return Response.json({ ...session, member: { id: '22222222-2222-4222-8222-222222222222' } });
  });
  const result = await setGoFavorite(id, true, id);
  assert.deepEqual(result, { ok: false, status: 409, message: '계정이 변경됐어요. 다시 시도해 주세요.' });
  assert.deepEqual(requests, ['/api/v1/auth/session']);
});
