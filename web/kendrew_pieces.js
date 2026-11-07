// Kendrew brass model layout: which atoms share a soldered piece, and the
// rods and sleeves that follow. Pure geometry, no imports.

export const ROD_RADIUS = 0.066;
export const BALL_RADIUS = 1.18 * ROD_RADIUS;
export const SLEEVE_RADIUS = 0.162;
export const SLEEVE_LENGTH = 0.564;
export const HOLE_RADIUS = 0.3 * SLEEVE_RADIUS;
export const ARM_LENGTH = 0.75;
export const GROOVE = { from: 0.13, to: 0.09, radius: 0.62 * ROD_RADIUS };
export const KNOB_RADIUS = 1.08 * ROD_RADIUS;

const PHE_RING = ['CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'];
const TRP_RING = ['CG', 'CD1', 'CD2', 'NE1', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2'];
const HIS_RING = ['CG', 'ND1', 'CD2', 'CE1', 'NE2'];

// Checked in order; the first marker atom present in the residue picks the group.
const FLAT_GROUPS = [
    ['NH1', ['NE', 'CZ', 'NH1', 'NH2']],
    ['OH', [...PHE_RING, 'OH']],
    ['NE1', TRP_RING],
    ['ND1', HIS_RING],
    ['CZ', PHE_RING],
    ['OD2', ['CG', 'OD1', 'OD2']],
    ['ND2', ['CG', 'OD1', 'ND2']],
    ['OE2', ['CD', 'OE1', 'OE2']],
    ['OE1', ['CD', 'OE1', 'NE2']],
];

const PAINT = { N: 'N', O: 'O', S: 'S' };
const GOLDEN = 2.39996;

export function assignPieces(atoms, bonds) {
    const nb = atoms.map(() => []);
    for (const [i, j] of bonds) { nb[i].push(j); nb[j].push(i); }
    const piece = atoms.map(() => -1);
    const planar = atoms.map(() => false);
    let next = 0;

    const residues = new Map();
    atoms.forEach((a, i) => {
        const key = a.res !== undefined ? a.res : a.residue_id;
        if (!residues.has(key)) residues.set(key, new Map());
        residues.get(key).set(a.name, i);
    });
    for (const byName of residues.values()) {
        const group = FLAT_GROUPS.find(([marker]) => byName.has(marker));
        if (!group) continue;
        const id = next++;
        for (const name of group[1]) {
            const i = byName.get(name);
            if (i !== undefined) { piece[i] = id; planar[i] = true; }
        }
    }

    for (const [i, j] of bonds) {
        const [c, n] = atoms[i].name === 'C' && atoms[j].name === 'N' ? [i, j]
            : atoms[j].name === 'C' && atoms[i].name === 'N' ? [j, i] : [-1, -1];
        if (c < 0) continue;
        const id = next++;
        piece[c] = piece[n] = id;
        planar[c] = planar[n] = true;
        for (const k of nb[c]) if (atoms[k].name === 'O') piece[k] = id;
    }

    const isTip = i => atoms[i].element !== 'C' && nb[i].length === 1;
    atoms.forEach((a, i) => {
        if (piece[i] >= 0 || isTip(i)) return;
        if (a.name === 'C') planar[i] = true;
        piece[i] = next++;
    });
    atoms.forEach((a, i) => { if (piece[i] < 0) piece[i] = piece[nb[i][0]]; });
    return { piece, planar, nb };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const along = (p, u, t) => [p[0] + u[0] * t, p[1] + u[1] * t, p[2] + u[2] * t];

function sleeveSide(axis, k) {
    let s = cross(axis, [0, 0, 1]);
    if (dot(s, s) < 1e-4) s = cross(axis, [1, 0, 0]);
    s = norm(s);
    const th = (k * GOLDEN) % (2 * Math.PI);
    const w = cross(axis, s);
    const c = Math.cos(th), sn = Math.sin(th);
    return [0, 1, 2].map(m => s[m] * c + w[m] * sn);
}

// Directions of an atom's open arms: where a missing bond (usually an H) would point.
function openDirs(i, pos, nb, planar, element) {
    if (element === 'O' || element === 'S') return [];
    const u = nb[i].map(k => norm(sub(pos[k], pos[i])));
    if (planar[i]) return u.length === 2 ? [norm(scale(add(u[0], u[1]), -1))] : [];
    const s3 = Math.sqrt(8 / 9);
    if (u.length === 0) {
        return [[0, 0, 1], ...[0, 120, 240].map(d => {
            const f = d * Math.PI / 180;
            return [s3 * Math.cos(f), s3 * Math.sin(f), -1 / 3];
        })];
    }
    if (u.length === 1) {
        const k = nb[i][0];
        const m = nb[k].find(x => x !== i);
        const ref = m !== undefined ? sub(pos[m], pos[k]) : [0, 0, 1];
        let e1 = sub(ref, scale(u[0], dot(ref, u[0])));
        e1 = dot(e1, e1) < 1e-6 ? norm(cross(u[0], [1, 0, 0])) : norm(e1);
        const e2 = cross(u[0], e1);
        return [180, 60, -60].map(d => {
            const f = d * Math.PI / 180;
            return add(add(scale(u[0], -1 / 3), scale(e1, s3 * Math.cos(f))), scale(e2, s3 * Math.sin(f)));
        });
    }
    if (u.length === 2) {
        const b = norm(scale(add(u[0], u[1]), -1));
        const n = norm(cross(u[0], u[1]));
        const t = 54.75 * Math.PI / 180;
        return [1, -1].map(sg => add(scale(b, Math.cos(t)), scale(n, sg * Math.sin(t))));
    }
    if (u.length === 3) return [norm(scale(add(add(u[0], u[1]), u[2]), -1))];
    return [];
}

// Place D with |CD| = bond, angle BCD = angle and torsion ABCD = torsion (degrees).
function place(A, B, C, bond, angle, torsion) {
    const bc = norm(sub(C, B));
    const n = norm(cross(sub(B, A), bc));
    const m = cross(n, bc);
    const a = angle * Math.PI / 180, t = torsion * Math.PI / 180;
    return add(C, add(add(scale(bc, -bond * Math.cos(a)), scale(m, bond * Math.sin(a) * Math.cos(t))),
        scale(n, bond * Math.sin(a) * Math.sin(t))));
}

const PHIS = [-60, -90, -120, -150, 180, 150, 120, 90, 60];

// Complete a trans peptide unit at each chain end whose N or C is drawn. The far
// CA of each is virtual: its bond gets a sleeve and a rod, nothing is drawn at it.
function extendEnds(atoms, bonds, drawn) {
    atoms = atoms.map(a => ({ ...a }));
    bonds = bonds.map(b => [...b]);
    const nb = atoms.map(() => []);
    for (const [i, j] of bonds) { nb[i].push(j); nb[j].push(i); }
    const P = i => [atoms[i].x, atoms[i].y, atoms[i].z];
    const named = (i, n) => nb[i].find(k => atoms[k].name === n);
    const n0 = atoms.length;
    const addAtom = (p, name, element, extra = {}) => {
        atoms.push({ name, element, residue: 'CAP', residue_id: 'cap', x: p[0], y: p[1], z: p[2], ...extra });
        return atoms.length - 1;
    };
    for (let i = 0; i < n0; i++) {
        if (!drawn.has(i)) continue;
        if (atoms[i].name === 'C' && named(i, 'N') === undefined) {
            const ca = named(i, 'CA'), o = named(i, 'O');
            if (ca === undefined || o === undefined) continue;
            const pN = place(P(o), P(ca), P(i), 1.33, 116.2, 180);
            const pCA = place(P(ca), P(i), pN, 1.46, 121.7, 180);
            const n = addAtom(pN, 'N', 'N');
            const c2 = addAtom(pCA, 'CA', 'C', { virtual: true });
            bonds.push([i, n], [n, c2]);
        }
        if (atoms[i].name === 'N' && named(i, 'C') === undefined) {
            const ca = named(i, 'CA');
            const c = ca === undefined ? undefined : named(ca, 'C');
            if (c === undefined) continue;
            let best = null;
            for (const phi of PHIS) {
                const pC = place(P(c), P(ca), P(i), 1.33, 121.7, phi);
                const pO = place(P(ca), P(i), pC, 1.23, 123, 0);
                const pCA = place(P(ca), P(i), pC, 1.52, 116.2, 180);
                let clear = Infinity;
                for (let k = 0; k < n0; k++) {
                    if (k === i || k === ca) continue;
                    for (const p of [pC, pO, pCA]) clear = Math.min(clear, Math.hypot(...sub(p, P(k))));
                }
                if (!best || clear > best.clear) best = { clear, pC, pO, pCA };
            }
            const c0 = addAtom(best.pC, 'C', 'C');
            const o0 = addAtom(best.pO, 'O', 'O');
            const ca0 = addAtom(best.pCA, 'CA', 'C', { virtual: true });
            bonds.push([c0, i], [c0, o0], [c0, ca0]);
        }
    }
    return { atoms, bonds };
}

export function bondsByDistance(atoms, maxLength = 1.9) {
    const out = [];
    for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
            if (Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z) <= maxLength) out.push([i, j]);
        }
    }
    return out;
}

// `bonds` is the full topology; `include` (default all) are the atoms drawn. A bond
// to an undrawn atom becomes an open arm along it.
export function kendrewParts(atoms, bonds, { include, ends = true } = {}) {
    const drawn = new Set(include ?? atoms.map((_, i) => i));
    if (ends) {
        ({ atoms, bonds } = extendEnds(atoms, bonds, drawn));
        atoms.forEach((a, i) => { if (a.residue_id === 'cap') drawn.add(i); });
    }
    const { piece, planar, nb } = assignPieces(atoms, bonds);
    const pos = atoms.map(a => [a.x, a.y, a.z]);
    const paintOf = i => PAINT[atoms[i].element] ?? 'brass';
    const isTip = i => atoms[i].element !== 'C' && nb[i].length === 1;
    const rods = [], balls = [], tips = [], sleeves = [];
    const rod = (a, b, paint, kind, atom) => { if (!atoms[atom].virtual) rods.push({ a: [...a], b: [...b], paint, kind, atom }); };

    for (const [i, j] of bonds) {
        if (!drawn.has(i) || !drawn.has(j)) continue;
        const [t, base] = isTip(j) && !isTip(i) ? [j, i] : isTip(i) && !isTip(j) ? [i, j] : [-1, -1];
        if (t >= 0) {
            const d = sub(pos[t], pos[base]);
            const u = norm(d);
            const band = along(pos[base], d, 0.45);
            rod(pos[base], band, paintOf(base), 'bond', base);
            rod(band, along(pos[t], u, -GROOVE.from), paintOf(t), 'bond', t);
            tips.push({ end: [...pos[t]], dir: u, atom: t });
            continue;
        }
        const d = sub(pos[j], pos[i]);
        const u = norm(d);
        const mid = along(pos[i], d, 0.5);
        const joined = piece[i] !== piece[j];
        const ei = joined ? along(mid, u, -HOLE_RADIUS) : mid;
        const ej = joined ? along(mid, u, HOLE_RADIUS) : mid;
        rod(pos[i], ei, paintOf(i), 'bond', i);
        rod(pos[j], ej, paintOf(j), 'bond', j);
        if (joined) {
            sleeves.push({ mid, axis: u, side: sleeveSide(u, Math.min(i, j) * 7 + Math.max(i, j)), atoms: [i, j] });
        }
    }

    const arm = (i, dir) => {
        const end = along(pos[i], dir, ARM_LENGTH);
        const groove = along(end, dir, -GROOVE.from);
        if (paintOf(i) === 'brass') rod(pos[i], groove, 'brass', 'arm', i);
        else {
            const cut = along(pos[i], dir, 0.7 * ARM_LENGTH);
            rod(pos[i], cut, paintOf(i), 'arm', i);
            rod(cut, groove, 'brass', 'arm', i);
        }
        tips.push({ end, dir: [...dir], atom: i });
    };
    atoms.forEach((a, i) => {
        if (!drawn.has(i) || isTip(i) || a.virtual) return;
        balls.push({ at: [...pos[i]], paint: paintOf(i), atom: i });
        for (const k of nb[i]) if (!drawn.has(k)) arm(i, norm(sub(pos[k], pos[i])));
        for (const dir of openDirs(i, pos, nb, planar, a.element)) arm(i, dir);
    });
    return { rods, balls, tips, sleeves, atoms, bonds };
}
