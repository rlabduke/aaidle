import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignPieces, kendrewParts, bondsByDistance, HOLE_RADIUS, ARM_LENGTH, GROOVE } from '../web/kendrew_pieces.js';

const DIR = new URL('../web/data/', import.meta.url);
const CODES = ['gly', 'ala', 'val', 'leu', 'ile', 'pro', 'phe', 'trp', 'tyr', 'ser', 'thr', 'cys', 'met', 'asn', 'gln', 'asp', 'glu', 'lys', 'arg', 'his'];
const puzzles = Object.fromEntries(CODES.map(c => [c, JSON.parse(readFileSync(new URL(`density_${c}_rot0.json`, DIR), 'utf8'))]));

const idx = (p, name, residue_id = 'target') => p.atoms.findIndex(a => a.name === name && a.residue_id === residue_id);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const FLAT = {
  phe: ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'],
  tyr: ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ', 'OH'],
  his: ['CG', 'ND1', 'CD2', 'CE1', 'NE2'],
  trp: ['CG', 'CD1', 'CD2', 'NE1', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2'],
  asp: ['CG', 'OD1', 'OD2'],
  asn: ['CG', 'OD1', 'ND2'],
  glu: ['CD', 'OE1', 'OE2'],
  gln: ['CD', 'OE1', 'NE2'],
  arg: ['NE', 'CZ', 'NH1', 'NH2'],
};

test('flat groups are one piece', () => {
  for (const [code, names] of Object.entries(FLAT)) {
    const p = puzzles[code];
    const { piece, planar } = assignPieces(p.atoms, p.bonds);
    const ids = names.map(n => idx(p, n));
    assert.ok(ids.every(i => i >= 0), code);
    assert.equal(new Set(ids.map(i => piece[i])).size, 1, code);
    assert.ok(ids.every(i => planar[i]), code);
    const inGroup = piece[ids[0]];
    assert.equal(piece.filter(x => x === inGroup).length, names.length, code);
  }
});

test('flat groups are found by atom names per residue', () => {
  const p = puzzles.phe;
  const first = p.atoms.findIndex(a => a.residue_id === 'target');
  const atoms = p.atoms.map((a, i) => {
    const { residue, residue_id, ...rest } = a;
    return { ...rest, res: residue_id === 'target' ? 1 : i < first ? 0 : 2 };
  });
  const ref = assignPieces(p.atoms, p.bonds);
  const got = assignPieces(atoms, p.bonds);
  const ring = FLAT.phe.map(n => idx(p, n));
  assert.equal(new Set(ring.map(i => got.piece[i])).size, 1);
  assert.ok(ring.every(i => got.planar[i]));
  assert.equal(got.piece.filter(x => x === got.piece[ring[0]]).length, 6);
  assert.deepEqual(got.piece.map((x, i) => got.piece.indexOf(x) === i), ref.piece.map((x, i) => ref.piece.indexOf(x) === i));
});

test('each peptide bond is one unit with its O', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const { piece, nb } = assignPieces(p.atoms, p.bonds);
    let found = 0;
    for (const [i, j] of p.bonds) {
      const [c, n] = p.atoms[i].name === 'C' && p.atoms[j].name === 'N' ? [i, j]
        : p.atoms[j].name === 'C' && p.atoms[i].name === 'N' ? [j, i] : [-1, -1];
      if (c < 0) continue;
      found++;
      const o = nb[c].find(k => p.atoms[k].name === 'O');
      assert.equal(piece[c], piece[n], code);
      assert.equal(piece[o], piece[c], code);
      const members = piece.filter(x => x === piece[c]).length;
      assert.equal(members, 3, code);
    }
    assert.equal(found, 2, code);
  }
});

test('terminal heteroatoms join their neighbour', () => {
  const same = (code, tip, base) => {
    const p = puzzles[code];
    const { piece } = assignPieces(p.atoms, p.bonds);
    return piece[idx(p, tip)] === piece[idx(p, base)];
  };
  assert.ok(same('ser', 'OG', 'CB'));
  assert.ok(same('cys', 'SG', 'CB'));
  assert.ok(same('lys', 'NZ', 'CE'));
  assert.ok(same('thr', 'OG1', 'CB'));
  for (const [code, name] of [['ala', 'CB'], ['val', 'CG1']]) {
    const p = puzzles[code];
    const { piece } = assignPieces(p.atoms, p.bonds);
    const i = idx(p, name);
    assert.equal(piece.filter(x => x === piece[i]).length, 1, code);
  }
});

const expected = { gly: 2, ala: 3, val: 5, leu: 6, ile: 6, pro: 6, phe: 4, trp: 4, tyr: 4, ser: 3, thr: 4, cys: 3, met: 6, asn: 4, gln: 5, asp: 4, glu: 5, lys: 6, arg: 6, his: 4 };

test('sleeves sit only on joins', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const { piece } = assignPieces(p.atoms, p.bonds);
    const { sleeves } = kendrewParts(p.atoms, p.bonds, { ends: false });
    const joins = p.bonds.filter(([i, j]) => piece[i] !== piece[j]);
    assert.equal(sleeves.length, joins.length, code);
    assert.deepEqual(sleeves.map(s => s.atoms), joins, code);
    const target = sleeves.filter(s => s.atoms.every(k => p.atoms[k].residue_id === 'target'));
    assert.equal(target.length, expected[code], code);
  }
});

test('bond rods stop at the hole', () => {
  const p = puzzles.phe;
  const { piece } = assignPieces(p.atoms, p.bonds);
  const { rods, sleeves } = kendrewParts(p.atoms, p.bonds, { ends: false });
  assert.ok(sleeves.length > 0);
  for (const s of sleeves) {
    const [i, j] = s.atoms;
    assert.notEqual(piece[i], piece[j]);
    for (const k of [i, j]) {
      const r = rods.find(r => r.atom === k && dist(r.a, [p.atoms[k].x, p.atoms[k].y, p.atoms[k].z]) < 1e-9
        && dist(r.b, s.mid) < dist(r.a, s.mid) && Math.abs(dist(r.b, s.mid) - HOLE_RADIUS) < 1e-9);
      assert.ok(r, `rod of atom ${k} ends ${HOLE_RADIUS} short of the midpoint`);
    }
  }
});

test('sleeve side is a unit vector at right angles to the axis', () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = v => Math.hypot(...v);
  for (const dir of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const atoms = ['A', 'B', 'C', 'D'].map((name, k) => ({ name, element: 'C', residue_id: 'target', x: dir[0] * 1.5 * k, y: dir[1] * 1.5 * k, z: dir[2] * 1.5 * k }));
    const bonds = [[0, 1], [1, 2], [2, 3]];
    const { sleeves } = kendrewParts(atoms, bonds, { ends: false });
    assert.equal(sleeves.length, 3);
    for (const s of sleeves) {
      assert.ok(Math.abs(len(s.side) - 1) < 1e-9);
      assert.ok(Math.abs(dot(s.side, s.axis)) < 1e-9);
    }
    for (let k = 1; k < sleeves.length; k++) {
      assert.ok(sleeves[k].side.some((v, m) => Math.abs(v - sleeves[k - 1].side[m]) > 1e-3));
    }
  }
});

const pos = (p, i) => [p.atoms[i].x, p.atoms[i].y, p.atoms[i].z];
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const angle = (u, v) => Math.acos(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) * 180 / Math.PI;
const toward = (p, i, j) => unit(pos(p, j).map((x, m) => x - pos(p, i)[m]));
const isTerm = (p, i, nb) => p.atoms[i].element !== 'C' && nb[i].length === 1;
const armTips = (p, parts, i) => parts.tips.filter(t => t.atom === i && dist(t.end, pos(p, i)) > 1e-9);
const near = (x, y, tol = 3) => Math.abs(x - y) <= tol;

test('sp3 arms are tetrahedral', () => {
  let checked = 0;
  for (const [code, p] of Object.entries(puzzles)) {
    const { planar, nb } = assignPieces(p.atoms, p.bonds);
    const parts = kendrewParts(p.atoms, p.bonds, { ends: false });
    p.atoms.forEach((a, i) => {
      if (planar[i] || isTerm(p, i, nb) || a.element === 'O' || a.element === 'S') return;
      const arms = armTips(p, parts, i);
      assert.equal(arms.length, Math.max(0, 4 - nb[i].length), `${code} ${a.name}`);
      for (const t of arms) {
        for (const k of nb[i]) assert.ok(near(angle(t.dir, toward(p, i, k)), 109.5, 5), `${code} ${a.name} bond`);
        for (const t2 of arms) if (t2 !== t) assert.ok(near(angle(t.dir, t2.dir), 109.5, 5), `${code} ${a.name} arms`);
        checked++;
      }
    });
  }
  assert.ok(checked > 100);
});

test('sp2 arms lie in the plane', () => {
  let checked = 0;
  for (const [code, p] of Object.entries(puzzles)) {
    const { planar, nb } = assignPieces(p.atoms, p.bonds);
    const parts = kendrewParts(p.atoms, p.bonds, { ends: false });
    p.atoms.forEach((a, i) => {
      if (!planar[i] || nb[i].length !== 2 || a.element === 'O' || a.element === 'S') return;
      const arms = armTips(p, parts, i);
      assert.equal(arms.length, 1, `${code} ${a.name}`);
      const u = nb[i].map(k => toward(p, i, k));
      const n = unit([u[0][1] * u[1][2] - u[0][2] * u[1][1], u[0][2] * u[1][0] - u[0][0] * u[1][2], u[0][0] * u[1][1] - u[0][1] * u[1][0]]);
      assert.ok(Math.abs(n[0] * arms[0].dir[0] + n[1] * arms[0].dir[1] + n[2] * arms[0].dir[2]) < 0.02, `${code} ${a.name} plane`);
      const [a0, a1] = u.map(v => angle(arms[0].dir, v));
      assert.ok(Math.abs(a0 - a1) < 1, `${code} ${a.name} equal`);
      assert.ok(a0 > 115 && a0 < 130, `${code} ${a.name} ${a0}`);
      checked++;
    });
  }
  assert.ok(checked > 20);
});

test('no arms on O or S, none on a terminal heteroatom', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const { nb } = assignPieces(p.atoms, p.bonds);
    const parts = kendrewParts(p.atoms, p.bonds, { ends: false });
    p.atoms.forEach((a, i) => {
      if (a.element === 'O' || a.element === 'S' || isTerm(p, i, nb)) {
        assert.equal(armTips(p, parts, i).length, 0, `${code} ${a.name}`);
        assert.ok(!parts.rods.some(r => r.kind === 'arm' && r.atom === i), `${code} ${a.name}`);
      }
    });
  }
});

test('arm tips keep clear of atoms', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const parts = kendrewParts(p.atoms, p.bonds, { ends: false });
    p.atoms.forEach((a, i) => {
      for (const t of armTips(p, parts, i)) {
        assert.ok(near(dist(t.end, pos(p, i)), ARM_LENGTH, 1e-9));
        const nearest = Math.min(...p.atoms.map((_, k) => k === i ? Infinity : dist(t.end, pos(p, k))));
        assert.ok(nearest >= 1, `${code} ${a.name} ${nearest}`);
      }
    });
  }
});

test('a lone atom gets four tetrahedral arms', () => {
  const parts = kendrewParts([{ name: 'CA', element: 'C', residue_id: 'target', x: 1, y: 2, z: 3 }], [], { ends: false });
  assert.equal(parts.tips.length, 4);
  assert.equal(parts.balls.length, 1);
  for (const t of parts.tips) for (const t2 of parts.tips) if (t !== t2) assert.ok(near(angle(t.dir, t2.dir), 109.5, 0.1));
});

test('paint marks heteroatoms', () => {
  const len = r => dist(r.a, r.b);
  for (const [code, p] of Object.entries(puzzles)) {
    const { nb } = assignPieces(p.atoms, p.bonds);
    const { rods } = kendrewParts(p.atoms, p.bonds, { ends: false });
    const paintOf = i => ({ N: 'N', O: 'O', S: 'S' })[p.atoms[i].element] ?? 'brass';
    p.atoms.forEach((a, i) => {
      const mine = rods.filter(r => r.atom === i);
      const m = `${code} ${a.name}`;
      if (isTerm(p, i, nb)) {
        const base = nb[i][0];
        const L = dist(pos(p, i), pos(p, base));
        const band = mine.filter(r => r.kind === 'bond');
        assert.equal(band.length, 1, m);
        assert.equal(band[0].paint, paintOf(i), m);
        assert.ok(near(len(band[0]), 0.55 * L - GROOVE.from, 1e-9), m);
        const baseRod = rods.find(r => r.atom === base && r.kind === 'bond' && dist(r.b, band[0].a) < 1e-9);
        assert.ok(baseRod, m);
        assert.equal(baseRod.paint, paintOf(base), m);
        assert.ok(near(len(baseRod), 0.45 * L, 1e-9), m);
        return;
      }
      for (const r of mine.filter(r => r.kind === 'bond')) {
        if (!rods.some(o => o.atom !== i && o.kind === 'bond' && dist(o.a, r.b) < 1e-9 && o.paint !== undefined && isTerm(p, o.atom, nb))) {
          assert.equal(r.paint, paintOf(i), m);
        }
      }
      const arms = mine.filter(r => r.kind === 'arm');
      if (paintOf(i) === 'brass') assert.ok(arms.every(r => r.paint === 'brass'), m);
      else {
        const painted = arms.filter(r => r.paint === paintOf(i));
        assert.equal(painted.length, arms.length / 2, m);
        for (const r of painted) assert.ok(near(len(r), 0.7 * ARM_LENGTH, 1e-9), m);
        assert.ok(arms.filter(r => r.paint !== paintOf(i)).every(r => r.paint === 'brass'), m);
      }
    });
  }
});

test('every arm and terminal bond ends in a tip', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const { nb } = assignPieces(p.atoms, p.bonds);
    const { rods, tips } = kendrewParts(p.atoms, p.bonds, { ends: false });
    const terms = p.atoms.map((_, i) => i).filter(i => isTerm(p, i, nb));
    const armEnds = rods.filter(r => r.kind === 'arm' && r.paint === 'brass');
    const armCount = rods.filter(r => r.kind === 'arm').length;
    assert.ok(armEnds.length > 0 && armCount >= armEnds.length);
    const arms = tips.filter(t => !terms.includes(t.atom));
    assert.equal(tips.length, arms.length + terms.length, code);
    const { planar } = assignPieces(p.atoms, p.bonds);
    const expected = p.atoms.reduce((sum, a, i) => {
      if (a.element === 'O' || a.element === 'S' || isTerm(p, i, nb)) return sum;
      const n = nb[i].length;
      return sum + (planar[i] ? (n === 2 ? 1 : 0) : Math.max(0, 4 - n));
    }, 0);
    assert.equal(tips.filter(t => !terms.includes(t.atom)).length, expected, code);
    for (const i of terms) {
      const t = tips.filter(t => t.atom === i);
      assert.equal(t.length, 1, code);
      assert.ok(dist(t[0].end, pos(p, i)) < 1e-9, code);
      const groove = t[0].end.map((x, m) => x - GROOVE.from * t[0].dir[m]);
      assert.ok(rods.some(r => r.atom === i && dist(r.b, groove) < 1e-9), code);
    }
    for (const t of arms) {
      const groove = t.end.map((x, m) => x - GROOVE.from * t.dir[m]);
      assert.ok(rods.some(r => r.kind === 'arm' && r.atom === t.atom && dist(r.b, groove) < 1e-9), code);
      assert.ok(Math.abs(Math.hypot(...t.dir) - 1) < 1e-9);
    }
  }
});

test('balls sit on junctions only', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const { nb } = assignPieces(p.atoms, p.bonds);
    const { balls } = kendrewParts(p.atoms, p.bonds, { ends: false });
    const want = p.atoms.map((_, i) => i).filter(i => !isTerm(p, i, nb));
    assert.deepEqual(balls.map(b => b.atom), want, code);
    for (const b of balls) {
      assert.ok(dist(b.at, pos(p, b.atom)) < 1e-9);
      assert.equal(b.paint, ({ N: 'N', O: 'O', S: 'S' })[p.atoms[b.atom].element] ?? 'brass');
    }
  }
});

test('every emitted point is its own array', () => {
  const p = puzzles.phe;
  const { rods, balls, tips, sleeves } = kendrewParts(p.atoms, p.bonds, { ends: false });
  const pts = [...rods.flatMap(r => [r.a, r.b]), ...balls.map(b => b.at), ...tips.flatMap(t => [t.end, t.dir]), ...sleeves.map(s => s.mid)];
  assert.equal(new Set(pts).size, pts.length);
});

const bondKey = ([i, j]) => (i < j ? `${i}-${j}` : `${j}-${i}`);
const torsion = (a, b, c, d) => {
  const sub = (x, y) => x.map((v, m) => v - y[m]);
  const cr = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const dt = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const b1 = sub(b, a), b2 = sub(c, b), b3 = sub(d, c);
  const n1 = cr(b1, b2), n2 = cr(b2, b3);
  return Math.atan2(dt(cr(n1, n2), unit(b2)), dt(n1, n2)) * 180 / Math.PI;
};
const xyz = a => [a.x, a.y, a.z];

test('the C-terminal end is a trans peptide', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const n0 = p.atoms.length;
    const { atoms, bonds } = kendrewParts(p.atoms, p.bonds);
    const { nb } = assignPieces(p.atoms, p.bonds);
    const c = p.atoms.findIndex((a, i) => a.name === 'C' && !nb[i].some(k => p.atoms[k].name === 'N'));
    const n = atoms.findIndex((a, i) => i >= n0 && a.name === 'N');
    assert.ok(c >= 0 && n >= 0, code);
    assert.ok(Math.abs(dist(xyz(atoms[c]), xyz(atoms[n])) - 1.33) < 0.01, code);
    const ca = p.atoms.findIndex((a, i) => nb[c].includes(i) && a.name === 'CA');
    const vca = atoms.findIndex((a, i) => i >= n0 && a.name === 'CA' && bonds.some(b => bondKey(b) === bondKey([n, i])));
    assert.ok(atoms[vca].virtual, code);
    const w = Math.abs(torsion(xyz(atoms[ca]), xyz(atoms[c]), xyz(atoms[n]), xyz(atoms[vca])));
    assert.ok(Math.abs(w - 180) < 2, `${code} ${w}`);
  }
});

test('the N-terminal end keeps clear', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const n0 = p.atoms.length;
    const { atoms, bonds } = kendrewParts(p.atoms, p.bonds);
    const nb = atoms.map(() => []);
    for (const [i, j] of bonds) { nb[i].push(j); nb[j].push(i); }
    for (let a = n0; a < atoms.length; a++) {
      const hops = new Map([[a, 0]]);
      for (const q = [a]; q.length;) {
        const x = q.shift();
        for (const y of nb[x]) if (!hops.has(y)) { hops.set(y, hops.get(x) + 1); q.push(y); }
      }
      for (let k = 0; k < n0; k++) {
        if ((hops.get(k) ?? 9) <= 2) continue;
        assert.ok(dist(xyz(atoms[a]), xyz(atoms[k])) >= 2.5, `${code} ${atoms[a].name} to ${atoms[k].name}`);
      }
    }
  }
});

test('ends add whole units with empty sleeves', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const n0 = p.atoms.length;
    const full = kendrewParts(p.atoms, p.bonds);
    assert.equal(full.sleeves.length, expected[code] + 8, code);
    assert.equal(full.atoms.length, n0 + 5, code);
    assert.ok(full.atoms.slice(n0).every(a => a.residue_id === 'cap'), code);
    const virtual = full.atoms.map((a, i) => (a.virtual ? i : -1)).filter(i => i >= 0);
    assert.equal(virtual.length, 2, code);
    for (const v of virtual) {
      assert.ok(!full.balls.some(b => b.atom === v), code);
      assert.equal(full.rods.filter(r => r.atom === v).length, 0, code);
      assert.equal(full.tips.filter(t => t.atom === v).length, 0, code);
      const s = full.sleeves.filter(s => s.atoms.includes(v));
      assert.equal(s.length, 1, code);
      const other = s[0].atoms.find(k => k !== v);
      assert.equal(full.rods.filter(r => r.atom === other && dist(r.b, s[0].mid) < dist(r.a, s[0].mid) && dist(r.a, xyz(full.atoms[other])) < 1e-9 && Math.abs(dist(r.b, s[0].mid) - HOLE_RADIUS) < 1e-9).length, 1, code);
    }
  }
});

test('bondsByDistance matches the puzzle bonds', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const got = bondsByDistance(p.atoms);
    assert.ok(got.every(([i, j]) => i < j), code);
    assert.deepEqual(got.map(bondKey).sort(), p.bonds.map(bondKey).sort(), code);
  }
});

const cosine = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const armDirs = (p, parts, i) => armTips(p, parts, i).map(t => t.dir);

test('include draws arms toward undrawn neighbours and adds no ends', () => {
  const p = puzzles.phe;
  const { nb } = assignPieces(p.atoms, p.bonds);
  const cut = ['N', 'C', 'O'].map(n => idx(p, n));
  const include = p.atoms.map((a, i) => i).filter(i => p.atoms[i].residue_id === 'target' && !cut.includes(i));
  const parts = kendrewParts(p.atoms, p.bonds, { include });
  assert.equal(parts.atoms.length, p.atoms.length);
  for (const k of cut) {
    assert.ok(!parts.rods.some(r => r.atom === k));
    assert.ok(!parts.balls.some(b => b.atom === k));
  }
  assert.ok(parts.balls.every(b => include.includes(b.atom)));
  const ca = idx(p, 'CA');
  const dirs = armDirs(p, parts, ca);
  assert.equal(dirs.length, 3);
  for (const k of [idx(p, 'N'), idx(p, 'C')]) {
    assert.equal(dirs.filter(d => cosine(d, toward(p, ca, k)) > 0.999).length, 1);
  }
  assert.equal(nb[ca].length, 3);
  const h = dirs.filter(d => nb[ca].every(k => cosine(d, toward(p, ca, k)) < 0.9));
  assert.equal(h.length, 1);
});

test('backbone only', () => {
  const backbone = ['N', 'CA', 'C', 'O'];
  for (const code of ['phe', 'gly']) {
    const p = puzzles[code];
    const include = p.atoms.map((a, i) => i).filter(i => backbone.includes(p.atoms[i].name));
    const parts = kendrewParts(p.atoms, bondsByDistance(p.atoms), { include });
    assert.equal(parts.sleeves.length, 8, code);
    const cas = include.filter(i => p.atoms[i].name === 'CA');
    assert.equal(cas.length, 3, code);
    for (const ca of cas) {
      const dirs = armDirs(p, parts, ca);
      assert.equal(dirs.length, 2, code);
      const cb = p.bonds.map(([i, j]) => (i === ca ? j : j === ca ? i : -1)).find(k => k >= 0 && p.atoms[k].name === 'CB');
      const real = p.bonds.flatMap(([i, j]) => (i === ca ? [j] : j === ca ? [i] : []));
      const alongReal = dirs.filter(d => real.some(k => cosine(d, toward(p, ca, k)) > 0.999)).length;
      assert.equal(alongReal, cb === undefined ? 0 : 1, code);
    }
  }
});

test('Calpha only', () => {
  for (const [code, p] of Object.entries(puzzles)) {
    const include = p.atoms.map((a, i) => i).filter(i => p.atoms[i].name === 'CA');
    const parts = kendrewParts(p.atoms, p.bonds, { include });
    assert.equal(parts.atoms.length, p.atoms.length, code);
    assert.equal(parts.sleeves.length, 0, code);
    for (const ca of include) {
      const dirs = armDirs(p, parts, ca);
      assert.equal(dirs.length, 4, code);
      const real = p.bonds.flatMap(([i, j]) => (i === ca ? [j] : j === ca ? [i] : []));
      for (const k of real) assert.equal(dirs.filter(d => cosine(d, toward(p, ca, k)) > 0.999).length, 1, code);
    }
  }
});

test('a bond keeps the same sleeve side in the hint and in the reveal', () => {
  const p = puzzles.phe;
  const include = p.atoms.map((a, i) => i).filter(i => ['N', 'CA', 'C', 'O'].includes(p.atoms[i].name));
  const hint = kendrewParts(p.atoms, bondsByDistance(p.atoms), { include });
  const full = kendrewParts(p.atoms, p.bonds);
  const key = s => [...s.atoms].sort((a, b) => a - b).join('-');
  const byPair = new Map(full.sleeves.map(s => [key(s), s]));
  let shared = 0;
  for (const s of hint.sleeves) {
    const f = byPair.get(key(s));
    if (!f) continue;
    shared++;
    s.side.forEach((v, m) => assert.ok(Math.abs(v - f.side[m]) < 1e-9, key(s)));
  }
  assert.ok(shared > 0);
});
