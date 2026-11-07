import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyAminoAcidIndex, dayNumber, COOLDOWN_DAYS, AMINO_ACID_COUNT } from '../web/daily_schedule.js';

function dates(start, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(new Date(Date.UTC(...start) + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

// Two years from the start, as the app will see them.
const DAYS = dates([2026, 0, 1], 731);
const PICKS = DAYS.map(dailyAminoAcidIndex);

test('day numbers count calendar days across DST changes', () => {
  assert.equal(dayNumber('2026-01-01'), 0);
  assert.equal(dayNumber('2026-03-09'), 67);
  assert.equal(dayNumber('2026-11-02'), 305);
});

test('same date gives the same answer', () => {
  assert.equal(dailyAminoAcidIndex('2026-11-15'), dailyAminoAcidIndex('2026-11-15'));
  assert.ok(PICKS.every(i => Number.isInteger(i) && i >= 0 && i < AMINO_ACID_COUNT));
});

test('no answer repeats within the cooldown', () => {
  for (let n = 1; n < PICKS.length; n++) {
    for (let back = 1; back <= COOLDOWN_DAYS && back <= n; back++) {
      assert.notEqual(PICKS[n], PICKS[n - back], `${DAYS[n]} repeats ${DAYS[n - back]}`);
    }
  }
});

test('every amino acid comes up at a similar rate', () => {
  const counts = new Array(AMINO_ACID_COUNT).fill(0);
  for (const i of PICKS) counts[i]++;
  // 731 days / 20 = 36.6 each on average.
  for (const c of counts) assert.ok(c >= 22 && c <= 52, `counts ${counts}`);
});

test('the answers do not follow a 20-day cycle', () => {
  let same = 0;
  for (let n = 20; n < PICKS.length; n++) if (PICKS[n] === PICKS[n - 20]) same++;
  assert.ok(same < 0.15 * (PICKS.length - 20), `${same} days match 20 days earlier`);
});
