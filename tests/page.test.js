import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameElementIds } from './element_ids.js';

const web = new URL('../web/', import.meta.url);
const START = '<!-- aaidle:game-body:start -->';
const END = '<!-- aaidle:game-body:end -->';
const html = readFileSync(new URL('index.html', web), 'utf8');

test('index.html has one start marker before one end marker', () => {
  assert.equal(html.split(START).length, 2);
  assert.equal(html.split(END).length, 2);
  assert.ok(html.indexOf(START) < html.indexOf(END));
});

test('markup between markers has no Django syntax', () => {
  const body = html.slice(html.indexOf(START), html.indexOf(END));
  for (const bad of ['{%', '{{', '{#']) assert.ok(!body.includes(bad), bad);
});

// Progress bar ids belong to the site-only analysis block; the overlay select is built by the script.
const NOT_IN_PAGE = new Set(['miniProgressBar', 'progressLabel', 'progressLink', 'analysisProgress', 'overlayDifficultySelect']);

test('every id the game script looks up is in index.html', () => {
  const ids = gameElementIds(readFileSync(new URL('density_game.js', web), 'utf8'));
  assert.ok(ids.length > 30);
  const missing = ids.filter((id) => !NOT_IN_PAGE.has(id) && !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);
});
