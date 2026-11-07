import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSolveTimer, formatDuration, timeSummary, distributionRows, distributionHtml, historyHtml, timesLine,
} from '../web/play_stats.js';

function clock() {
  let t = 1000;
  return { now: () => t, advance: ms => { t += ms; } };
}

test('the timer counts only while started', () => {
  const c = clock();
  const timer = createSolveTimer(c.now);
  c.advance(500);
  timer.start();
  c.advance(2000);
  assert.equal(timer.elapsedMs(), 2000);
  timer.pause();
  c.advance(9000);
  timer.start();
  timer.start();
  c.advance(1000);
  assert.equal(timer.elapsedMs(), 3000);
  assert.equal(timer.running, true);
  timer.pause();
  timer.pause();
  assert.equal(timer.elapsedMs(), 3000);
  assert.equal(timer.running, false);
});

test('the timer resumes from a saved time', () => {
  const c = clock();
  const timer = createSolveTimer(c.now);
  timer.reset(65000);
  timer.start();
  c.advance(5000);
  assert.equal(timer.elapsedMs(), 70000);
});

test('durations read as m:ss or h:mm:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(42999), '0:42');
  assert.equal(formatDuration(61000), '1:01');
  assert.equal(formatDuration(3723000), '1:02:03');
  assert.equal(formatDuration(null), '-');
  assert.equal(formatDuration(NaN), '-');
  assert.equal(formatDuration(-5), '-');
});

test('time summary ignores missing times', () => {
  assert.deepEqual(timeSummary([30000, null, 10000, undefined, 20000]), { best: 10000, median: 20000 });
  assert.deepEqual(timeSummary([40000, 10000, 20000, 30000]), { best: 10000, median: 25000 });
  assert.equal(timeSummary([null, NaN]), null);
  assert.equal(timeSummary([]), null);
});

test('distribution rows label each score and losses', () => {
  const rows = distributionRows([3, 0, 1], 2, 1);
  assert.deepEqual(rows, [
    { label: '1', count: 3 }, { label: '2', count: 0 }, { label: '3', count: 1 }, { label: 'X', count: 2 },
  ]);
  assert.equal(distributionRows([5], 0, 0)[0].label, '0');
});

test('distribution bars scale to the largest count and highlight one row', () => {
  const html = distributionHtml(distributionRows([4, 2], 1, 1), 'X');
  assert.match(html, /width: 100%">4</);
  assert.match(html, /width: 50%">2</);
  assert.equal((html.match(/dist-bar-highlight/g) || []).length, 1);
  assert.match(html, /dist-bar dist-bar-highlight dist-bar-loss" style="width: 25%">1</);
  assert.match(distributionHtml(distributionRows([0, 0], 0, 1), null), /width: 8%">0</);
});

test('history lists the newest days first, up to a limit', () => {
  const rows = [
    { date: '2026-10-24', won: true, score: '3/5', ms: 95000 },
    { date: '2026-10-26', won: false, score: 'X/5', ms: null },
    { date: '2026-10-25', won: true, score: '1/5', ms: 30000 },
  ];
  const html = historyHtml(rows, 2);
  assert.ok(html.indexOf('Oct 26') < html.indexOf('Oct 25'));
  assert.ok(!html.includes('Oct 24'));
  assert.match(html, /history-lost/);
  assert.match(html, /1\/5/);
  assert.match(html, /0:30/);
  assert.equal(historyHtml([], 5), '');
});

test('times line shows today, best and median', () => {
  const html = timesLine(42000, { best: 30000, median: 60000 });
  assert.match(html, /0:42/);
  assert.match(html, /Best 0:30/);
  assert.match(html, /Median 1:00/);
  assert.equal(timesLine(null, null), '');
  assert.doesNotMatch(timesLine(null, { best: 1000, median: 1000 }), /Today/);
});
