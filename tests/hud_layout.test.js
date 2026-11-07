import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HUD_QUERY, hudQuery, switchLayout, installHudLayout, setHudForced, hudInsets } from '../web/hud_layout.js';

const HOST_QUERY = '(max-width: 599.98px)';

// Enough of a media-query evaluator for the queries these pages use.
function matches(query, s) {
  return query.split(',').some(part => part.split(' and ').every(cond => {
    const m = cond.trim().match(/^\((.+?):\s*(.+?)\)$/);
    const [, feature, value] = m;
    const px = parseFloat(value);
    switch (feature) {
      case 'max-width': return s.width <= px;
      case 'max-height': return s.height <= px;
      case 'min-width': return s.width >= px;
      case 'orientation': return value === (s.height >= s.width ? 'portrait' : 'landscape');
      case 'prefers-reduced-motion': return value === 'reduce' && s.reduceMotion;
      default: throw new Error(`unknown feature ${feature}`);
    }
  }));
}

function fakeWindow({ width, height, hudQueryAttr, reduceMotion = false, transitions = true }) {
  const screen = { width, height, reduceMotion };
  const classes = new Set();
  const listeners = [];
  const doc = {
    documentElement: {
      dataset: hudQueryAttr ? { hudQuery: hudQueryAttr } : {},
      classList: {
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        contains: c => classes.has(c),
      },
    },
    transitionsStarted: 0,
  };
  if (transitions) doc.startViewTransition = cb => { doc.transitionsStarted++; cb(); };
  const win = {
    document: doc,
    matchMedia: q => ({
      get matches() { return matches(q, screen); },
      addEventListener: (type, fn) => listeners.push(fn),
    }),
    resize(w, h) { screen.width = w; screen.height = h; listeners.forEach(fn => fn()); },
  };
  return { win, classes };
}

test('hudQuery reads data-hud-query and falls back to the website rule', () => {
  assert.equal(hudQuery(fakeWindow({ width: 1, height: 1, hudQueryAttr: HOST_QUERY }).win.document), HOST_QUERY);
  assert.equal(hudQuery(fakeWindow({ width: 1, height: 1 }).win.document), DEFAULT_HUD_QUERY);
});

test('the default rule keeps the bottom panel on phones and the Duo inner screen', () => {
  const hud = (width, height) => matches(DEFAULT_HUD_QUERY, { width, height });
  assert.equal(hud(867, 587), true);
  assert.equal(hud(956, 440), true);
  assert.equal(hud(382, 596), true);
  assert.equal(hud(1376, 1032), false);
});

test('installHudLayout sets the class at once and follows changes', () => {
  const { win, classes } = fakeWindow({ width: 382, height: 596 });
  let switched = 0;
  installHudLayout(win, () => { switched++; });
  assert.equal(classes.has('hud-layout'), true);
  assert.equal(win.document.transitionsStarted, 0);
  win.resize(1376, 1032);
  assert.equal(switched, 1);
  assert.equal(classes.has('hud-layout'), false);
});

test('switchLayout uses a view transition unless motion is reduced or unsupported', () => {
  for (const [opts, expected] of [[{}, 1], [{ reduceMotion: true }, 0], [{ transitions: false }, 0]]) {
    const { win } = fakeWindow({ width: 800, height: 600, ...opts });
    let applied = 0;
    switchLayout(win, () => { applied++; });
    assert.equal(applied, 1);
    assert.equal(win.document.transitionsStarted ?? 0, expected);
  }
});

function plainWin(matches) {
  const classes = new Set();
  return {
    classes,
    matchMedia: () => ({ matches, addEventListener() {} }),
    document: {
      documentElement: { dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    },
  };
}

test('a force set before install is honoured', () => {
  const win = plainWin(false);
  setHudForced(win, true);
  const layout = installHudLayout(win, () => {});
  assert.equal(layout.matches, true);
  assert.ok(win.classes.has('hud-layout'));
});

test('forcing after install switches and calls back', () => {
  const win = plainWin(false);
  let switches = 0;
  const layout = installHudLayout(win, () => { switches += 1; });
  setHudForced(win, true);
  assert.equal(layout.matches, true);
  assert.equal(switches, 1);
  setHudForced(win, false);
  assert.equal(layout.matches, false);
  assert.equal(switches, 2);
});

const rect = (left, right, top, bottom) => ({ left, right, top, bottom });
const canvasRect = rect(0, 400, 0, 800);

test('hudInsets measures panels over the canvas', () => {
  assert.deepEqual(hudInsets(canvasRect, rect(0, 400, 0, 56), rect(0, 400, 600, 800)), { top: 56, bottom: 200 });
});

test('hudInsets ignores panels beside the canvas', () => {
  assert.deepEqual(hudInsets(canvasRect, rect(400, 700, 0, 56), rect(400, 700, 600, 800)), { top: 0, bottom: 0 });
});

test('hudInsets treats missing rects as zero', () => {
  assert.deepEqual(hudInsets(canvasRect, null, null), { top: 0, bottom: 0 });
});
