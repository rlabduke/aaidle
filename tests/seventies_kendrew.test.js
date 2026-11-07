import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildKendrewModel, buildKendrewHint } from '../web/seventies.js';
import { kendrewParts } from '../web/kendrew_pieces.js';

const DIR = new URL('../web/data/', import.meta.url);
const CODES = ['gly', 'ala', 'val', 'leu', 'ile', 'pro', 'phe', 'trp', 'tyr', 'ser', 'thr', 'cys', 'met', 'asn', 'gln', 'asp', 'glu', 'lys', 'arg', 'his'];
const puzzles = Object.fromEntries(CODES.map(c => [c, JSON.parse(readFileSync(new URL(`density_${c}_rot0.json`, DIR), 'utf8'))]));

const named = (p, names) => p.atoms.flatMap((a, i) => (names.includes(a.name) ? [i] : []));
const hints = p => [
  buildKendrewHint(p.atoms, named(p, ['CA']), p.bonds, true),
  buildKendrewHint(p.atoms, named(p, ['N', 'CA', 'C', 'O']), p.bonds, false),
];
const byName = (group, name) => group.children.filter(m => m.name === name);
const isTarget = (p, m) => (m.userData.atoms
  ? m.userData.atoms.every(i => p.atoms[i]?.residue_id === 'target')
  : p.atoms[m.userData.atom]?.residue_id === 'target');

test('model and hint children are all meshes', () => {
  for (const code of ['phe', 'gly', 'pro']) {
    const p = puzzles[code];
    for (const group of [buildKendrewModel(p.atoms, p.bonds), ...hints(p)]) {
      assert.ok(group.children.length > 0, code);
      for (const m of group.children) {
        assert.ok(m instanceof THREE.Mesh, code);
        assert.ok(m.geometry && m.material, code);
      }
    }
  }
});

test('the model has one sleeve per join', () => {
  for (const code of CODES) {
    const p = puzzles[code];
    const model = buildKendrewModel(p.atoms, p.bonds);
    assert.equal(byName(model, 'sleeve').length, kendrewParts(p.atoms, p.bonds).sleeves.length, code);
  }
});

test('each sleeve has a hole map and two screws', () => {
  for (const code of CODES) {
    const p = puzzles[code];
    const model = buildKendrewModel(p.atoms, p.bonds);
    const sleeves = byName(model, 'sleeve');
    assert.ok(sleeves.length > 0, code);
    for (const s of sleeves) assert.ok(s.material.alphaMap instanceof THREE.DataTexture, code);
    assert.equal(byName(model, 'screw').length, 2 * sleeves.length, code);
  }
});

test('sleeves sit at their joins with screws along the side', () => {
  const p = puzzles.phe;
  const parts = kendrewParts(p.atoms, p.bonds);
  const model = buildKendrewModel(p.atoms, p.bonds);
  const screws = byName(model, 'screw');
  assert.ok(parts.sleeves.length > 0);
  byName(model, 'sleeve').forEach((s, k) => {
    const { mid, axis, side } = parts.sleeves[k];
    assert.ok(s.position.distanceTo(new THREE.Vector3(...mid)) < 1e-6);
    const y = new THREE.Vector3(0, 1, 0).applyQuaternion(s.quaternion);
    assert.ok(y.distanceTo(new THREE.Vector3(...axis)) < 1e-6);
    for (const head of screws.slice(2 * k, 2 * k + 2)) {
      const off = head.position.clone().sub(s.position);
      assert.ok(off.dot(new THREE.Vector3(...side)) > 0.162);
    }
  });
});

test('hint fades flanks', () => {
  for (const code of ['phe', 'gly', 'pro', 'trp']) {
    const p = puzzles[code];
    for (const group of hints(p)) {
      const seen = new Set();
      for (const m of group.children) {
        assert.equal(m.renderOrder, 1, code);
        assert.equal(m.material.transparent, true, code);
        assert.equal(m.material.depthWrite, false, code);
        const want = isTarget(p, m) ? 0.55 : 0.25;
        assert.equal(m.material.opacity, want, code);
        seen.add(want);
      }
      assert.deepEqual([...seen].sort(), [0.25, 0.55], code);
    }
  }
});

test('hint sleeves keep their walls under the alpha test', () => {
  const p = puzzles.phe;
  const [, level2] = hints(p);
  const sleeves = byName(level2, 'sleeve');
  assert.ok(sleeves.length > 0);
  for (const s of sleeves) assert.ok(s.material.alphaTest < s.material.opacity);
});

test('model include draws a lone glycine', () => {
  const p = puzzles.gly;
  const glyCA = p.atoms.findIndex(a => a.name === 'CA' && a.residue_id === 'target');
  const group = buildKendrewModel(p.atoms, p.bonds, [glyCA]);
  assert.ok(group.children.length > 0);
  assert.ok(group.children.every(m => m instanceof THREE.Mesh));
  assert.equal(byName(group, 'sleeve').length, 0);
  assert.equal(byName(group, 'knob').length, 4);
  assert.ok(group.children.every(m => m.userData.atom === glyCA));
});
