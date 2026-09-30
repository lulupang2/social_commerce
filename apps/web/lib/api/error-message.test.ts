import assert from 'node:assert/strict';
import test from 'node:test';
import { apiErrorMessage } from './error-message';

test('API errors use Korean copy without exposing raw server diagnostics', () => {
  assert.match(
    apiErrorMessage(401, { message: 'A valid service session is required' }, '실패'),
    /로그인이 필요/,
  );
  assert.match(
    apiErrorMessage(
      403,
      { code: 'CSRF_INVALID', message: 'The request could not be verified' },
      '실패',
    ),
    /새로고침/,
  );
  assert.match(apiErrorMessage(403, { message: 'Forbidden' }, '실패'), /권한/);
  assert.match(apiErrorMessage(429, null, '실패'), /잠시 후/);
  for (const body of [
    null,
    { message: 'database diagnostic' },
    { code: 'constructor' },
    '<html>Bad Gateway</html>',
  ]) {
    assert.equal(
      apiErrorMessage(503, body, '서버에 연결하지 못했어요.'),
      '서버에 연결하지 못했어요.',
    );
  }
});
