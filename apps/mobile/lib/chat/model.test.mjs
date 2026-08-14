import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoChatTransport } from './demo-transport.ts';
import {
  createClientMessageId,
  isAfterMessageCursor,
  isBeforeMessageCursor,
  mergeMessages,
} from './model.ts';

function message(id, createdAt, delivery = 'confirmed', overrides = {}) {
  return {
    id,
    conversationId: 'conversation-1',
    senderId: 'sender-1',
    body: `body-${id}`,
    readAt: null,
    deletedAt: null,
    createdAt,
    timeLabel: createdAt,
    isMine: false,
    delivery,
    ...overrides,
  };
}

test('server confirmation replaces an optimistic id once and preserves total order', () => {
  const timestamp = '2026-08-14T10:00:00.000Z';
  const optimistic = message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', timestamp, 'sending');
  const confirmed = message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', timestamp, 'confirmed', {
    body: 'server-confirmed',
  });
  const earlier = message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', timestamp);

  const merged = mergeMessages([optimistic], [confirmed, confirmed, earlier]);

  assert.deepEqual(
    merged.map(({ id, body, delivery }) => ({ id, body, delivery })),
    [
      { id: earlier.id, body: earlier.body, delivery: 'confirmed' },
      { id: confirmed.id, body: 'server-confirmed', delivery: 'confirmed' },
    ],
  );
});

test('message cursor excludes the exact boundary and orders equal timestamps by id', () => {
  const timestamp = '2026-08-14T10:00:00.000Z';
  const cursor = { createdAt: timestamp, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

  assert.equal(
    isBeforeMessageCursor(message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', timestamp), cursor),
    true,
  );
  assert.equal(isBeforeMessageCursor(message(cursor.id, timestamp), cursor), false);
  assert.equal(isAfterMessageCursor(message(cursor.id, timestamp), cursor), false);
  assert.equal(
    isAfterMessageCursor(message('cccccccc-cccc-4ccc-8ccc-cccccccccccc', timestamp), cursor),
    true,
  );
});

test('demo read updates affect only unread incoming messages and are idempotent', async () => {
  const transport = createDemoChatTransport();
  const before = await transport.getUnreadSummary();
  assert.equal(before.error, null);
  assert.equal(before.data.total, 1);
  assert.equal(before.data.byConversation['demo-chat-1'], 1);

  const first = await transport.markConversationRead('demo-chat-1');
  assert.equal(first.error, null);
  assert.equal(first.data.updatedCount, 1);
  assert.equal(first.data.unread.total, 0);

  const second = await transport.markConversationRead('demo-chat-1');
  assert.equal(second.error, null);
  assert.equal(second.data.updatedCount, 0);
  assert.equal(second.data.unread.total, 0);
});

test('demo conversation creation and message confirmation are idempotent', async () => {
  const transport = createDemoChatTransport();
  const first = await transport.findOrCreateConversation('new-listing', 'new-seller');
  const second = await transport.findOrCreateConversation('new-listing', 'new-seller');
  assert.equal(first.error, null);
  assert.equal(second.error, null);
  assert.equal(first.data.id, second.data.id);

  const id = createClientMessageId(() => 0.25);
  const input = {
    id,
    conversationId: first.data.id,
    senderId: 'demo-current-user',
    body: '한 번만 저장돼요.',
  };
  const inserted = await transport.insertMessage(input);
  const retried = await transport.insertMessage(input);
  assert.equal(inserted.error, null);
  assert.equal(retried.error, null);
  assert.equal(inserted.data.id, retried.data.id);

  const page = await transport.listMessages(first.data.id, { pageSize: 20 });
  assert.equal(page.error, null);
  assert.equal(page.data.items.filter((item) => item.id === id).length, 1);
});
