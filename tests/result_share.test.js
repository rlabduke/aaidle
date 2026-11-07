import test from 'node:test';
import assert from 'node:assert/strict';
import { shareResult } from '../web/result_share.js';

function setup({ coarse, share }) {
  const log = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      share,
      clipboard: { writeText: async t => { log.push(['copy', t]); } },
    },
  });
  globalThis.window = { matchMedia: () => ({ matches: coarse }) };
  return log;
}

test('touch devices get the share sheet and no copy', async () => {
  const shared = [];
  const log = setup({ coarse: true, share: async d => { shared.push(d.text); } });
  let copied = 0;
  await shareResult('AA.ID.LE', () => copied++);
  assert.deepEqual(shared, ['AA.ID.LE']);
  assert.deepEqual(log, []);
  assert.equal(copied, 0);
});

test('dismissing the share sheet does nothing', async () => {
  const log = setup({ coarse: true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } });
  let copied = 0;
  await shareResult('AA.ID.LE', () => copied++);
  assert.deepEqual(log, []);
  assert.equal(copied, 0);
});

test('a failed share sheet falls back to the clipboard', async () => {
  const log = setup({ coarse: true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } });
  let copied = 0;
  await shareResult('AA.ID.LE', () => copied++);
  assert.deepEqual(log, [['copy', 'AA.ID.LE']]);
  assert.equal(copied, 1);
});

test('desktop pointers copy even when a share sheet exists', async () => {
  const shared = [];
  const log = setup({ coarse: false, share: async d => { shared.push(d.text); } });
  let copied = 0;
  await shareResult('AA.ID.LE', () => copied++);
  assert.deepEqual(shared, []);
  assert.deepEqual(log, [['copy', 'AA.ID.LE']]);
  assert.equal(copied, 1);
});
