import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { truncateForCursorDeeplink } from '../chat/promptTruncate';

test('truncateForCursorDeeplink leaves short text unchanged', () => {
  const s = 'hello world';
  assert.equal(truncateForCursorDeeplink(s, 1000), s);
});

test('truncateForCursorDeeplink fits encoded length budget', () => {
  const long = 'ä'.repeat(5000);
  const max = 400;
  const out = truncateForCursorDeeplink(long, max);
  assert.ok(out.length < long.length);
  assert.ok(encodeURIComponent(out).length <= max);
});
