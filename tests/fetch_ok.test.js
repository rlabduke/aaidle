import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoaded } from '../web/fetch_ok.js';

test('an ok response is loaded', () => {
  assert.equal(isLoaded({ ok: true, status: 200 }), true);
});

test('status 0 counts as loaded (file:// and app-scheme fetches)', () => {
  assert.equal(isLoaded({ ok: false, status: 0 }), true);
});

test('an HTTP error is not loaded', () => {
  assert.equal(isLoaded({ ok: false, status: 404 }), false);
});
