import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { requestJson } from './json-request';
import { decideReview, resubmitListing } from '../go-listings/reviews';
import { changeLike, communityRequest, resubmitPost } from '../community/client';
import { setGoFavorite } from '../go-listings/personal';
import { connectRealtimeConversation } from '../chat/realtime';
import { getSellerStatus } from '../go-listings/seller';

const id = '11111111-1111-4111-8111-111111111111';
const session = { member: { id }, csrfToken: 'fixture-csrf' };
const messages = { http: 'HTTP failure', invalid: 'Invalid response', network: 'Network failure' };
const schema = z.object({ value: z.string() }).strict();

test('bodyless POST and DELETE preserve their methods, CSRF, cookie and cache policy', async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.cache, 'no-store');
    if (path.endsWith('/auth/session')) return Response.json(session);
    calls.push(init!);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-CSRF-Token'), session.csrfToken);
    assert.equal(headers.get('Content-Type'), null);
    assert.equal(headers.get('Accept'), 'application/json');
    assert.equal(init?.body, undefined);
    return Response.json({ value: 'saved' });
  });
  for (const method of ['POST', 'DELETE']) {
    assert.deepEqual(await requestJson('/resource', schema, { method, messages }), { ok: true, status: 200, data: { value: 'saved' } });
  }
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'DELETE']);
});

test('chat read accepts 204 and a switched account cannot send or acknowledge messages', async (t) => {
  let memberId = id;
  let mutations = 0;
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (path.endsWith('/auth/session')) return Response.json({ ...session, member: { id: memberId } });
    if (init?.method === 'GET') return Response.json({
      id, currentUserId: id, otherUserName: 'Fixture', listing: null, messages: [],
      beforeCursor: null, afterCursor: null, hasMore: false,
    });
    mutations++;
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), session.csrfToken);
    assert.deepEqual(JSON.parse(String(init?.body)), { throughMessageId: id });
    return new Response(null, { status: 204 });
  });
  const connection = await connectRealtimeConversation(id);
  assert.ok(connection.ok);
  await connection.session.markRead(id);
  memberId = '22222222-2222-4222-8222-222222222222';
  await assert.rejects(connection.session.markRead(id), /로그인 계정이 변경됐어요/);
  await assert.rejects(connection.session.send('Hello'), /로그인 계정이 변경됐어요/);
  assert.equal(mutations, 1);
});

test('seller adapter preserves success status and feature-specific invalid response message', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ seller: null, application: null, reviewer: false }));
  const result = await getSellerStatus();
  assert.ok(result.ok);
  assert.equal(result.status, 200);
  fetchMock.mock.mockImplementation(async () => Response.json({ seller: 'invalid' }));
  assert.deepEqual(await getSellerStatus(), { ok: false, status: 200, message: '서버 응답을 확인할 수 없어요.' });
});

test('GET skips session lookup while a JSON mutation serializes its body', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    calls.push(path);
    if (path.endsWith('/auth/session')) return Response.json(session);
    const headers = new Headers(init?.headers);
    if (init?.method === 'GET') assert.equal(headers.get('X-CSRF-Token'), null);
    else {
      assert.equal(headers.get('Content-Type'), 'application/json');
      assert.equal(init?.body, '{"value":"new"}');
    }
    return Response.json({ value: 'saved' }, { status: 202 });
  });
  await requestJson('/resource', schema, { messages });
  const result = await requestJson('/resource', schema, { method: 'PATCH', body: { value: 'new' }, messages });
  assert.deepEqual(calls, ['/resource', '/api/v1/auth/session', '/resource']);
  assert.ok(result.ok);
  assert.equal(result.status, 202);
});

test('failed session and switched identity stop mutations before the resource request', async (t) => {
  let requests = 0;
  const mocked = t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ message: 'Login required' }, { status: 401 });
  });
  assert.deepEqual(await requestJson('/resource', schema, { method: 'POST', messages }), { ok: false, status: 401, message: 'Login required' });
  mocked.mock.mockImplementation(async () => { requests++; return Response.json(session); });
  assert.deepEqual(await requestJson('/resource', schema, {
    method: 'DELETE', messages, identity: { memberId: 'other', changedMessage: 'Account changed' },
  }), { ok: false, status: 409, message: 'Account changed' });
  assert.equal(requests, 2);
});

test('204 is accepted only with an explicit no-content policy and bypasses JSON parsing', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.deepEqual(await requestJson('/resource', schema, { messages }), { ok: false, status: 204, message: messages.invalid });
  assert.deepEqual(await requestJson('/resource', z.unknown(), { messages, allowNoContent: true }), { ok: true, status: 204, data: undefined });
  assert.deepEqual(await communityRequest('/resource', z.unknown()), { ok: true, data: undefined });
});

test('HTTP, malformed JSON, schema and network failures retain separate outcomes without retry', async (t) => {
  let requests = 0;
  const responses = [
    Response.json({ message: 'Forbidden' }, { status: 403 }),
    new Response('not json', { status: 503 }),
    new Response('not json'),
    Response.json({ value: 12 }),
  ];
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    const response = responses.shift();
    if (!response) throw new Error('Lost response');
    return response;
  });
  for (const [status, message] of [[403, 'Forbidden'], [503, messages.http], [200, messages.invalid], [200, messages.invalid], [0, messages.network]]) {
    assert.deepEqual(await requestJson('/resource', schema, { messages }), { ok: false, status, message });
  }
  assert.equal(requests, 5);
});

test('feature adapters keep bodyless review, community and favorite mutations intact', async (t) => {
  const calls: { path: string; method?: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (path.endsWith('/auth/session')) return Response.json(session);
    assert.equal(new Headers(init?.headers).get('X-CSRF-Token'), session.csrfToken);
    assert.equal(init?.body, undefined);
    calls.push({ path, method: init?.method });
    return Response.json({ message: 'Fixture conflict' }, { status: 409 });
  });
  const results = await Promise.all([
    decideReview(id, 'approve'), resubmitListing(id), resubmitPost(id), changeLike(id, false), setGoFavorite(id, false, id),
  ]);
  for (const result of results) assert.deepEqual(result, { ok: false, status: 409, message: 'Fixture conflict' });
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'POST', 'POST', 'DELETE', 'DELETE']);
});
