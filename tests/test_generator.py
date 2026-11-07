"""Density game puzzles: the Top8000 rotamer table, proline puckers and generated data."""
import csv
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'generator'))

DATA_DIR = os.path.join(ROOT, 'generator', 'data', 'top8000_rotamers')

# Puzzle-ID order from docs/superpowers/specs/2026-11-06-top8000-rotamers-design.md (AA.ID.LE repo).
EXPECTED_ORDER = {
    'GLY': ['none'], 'ALA': ['none'],
    'VAL': ['t', 'm', 'p'],
    'LEU': ['mt', 'tp', 'mp', 'tt'],
    'ILE': ['mt', 'mm', 'pt', 'tt', 'tp'],
    'PRO': ['Cg_exo', 'Cg_endo'],
    'PHE': ['m-80', 't80', 'p90', 'm-10'],
    'TRP': ['m100', 't60', 't-100', 'm-10', 'p-90', 'p90', 'm-90'],
    'TYR': ['m-80', 't80', 'p90', 'm-10'],
    'SER': ['p', 'm', 't'],
    'THR': ['p', 'm', 't'],
    'ASN': ['m-40', 't0', 'p0', 'm110'],
    'GLN': ['mt0', 'tt0', 'mm-40', 'tp40', 'pt0', 'mm110', 'mp10', 'tm-30', 'tp-100', 'pm20'],
    'CYS': ['m', 't', 'p'],
    'MET': ['mmm', 'mtp', 'mtm', 'mtt', 'ttp', 'tpp', 'ttm',
            'mmt', 'ttt', 'mmp', 'ptp', 'tpt', 'ptm', 'tmm', 'ptt'],
    'ASP': ['m-30', 't0', 'p0', 't70'],
    'GLU': ['mt-10', 'tt0', 'mm-30', 'mp0', 'tp30', 'pt0', 'pm20', 'tm-30'],
    'LYS': ['mttt', 'tttt', 'mmtt', 'mtmt', 'mtpt', 'mttp', 'mttm', 'pttt', 'tttp',
            'tptt', 'tttm', 'ttpt', 'mmtm', 'ttmt', 'mmmt', 'mmtp', 'mtmm', 'tptp', 'mtpp'],
    'ARG': ['mtt180', 'mtm-85', 'mtt-85', 'mtp180', 'mtt90', 'mtm180', 'ttt180', 'ttt-90', 'ttm-80',
            'ttp80', 'mtp85', 'ttp-170', 'mmt-90', 'ttm170', 'mmt180', 'ttt90', 'mmm-85', 'mmm160',
            'tpt170', 'ptt180', 'ptt90', 'mtm110', 'ptt-90', 'ttm110', 'tpt90', 'ttp-110', 'mmt90',
            'ptm160', 'tpp-160', 'mtp-110'],
    'HIS': ['m-70', 't70', 'm90', 't-90', 'm170', 'p-80', 'p90', 't-170'],
}


def read_csv(res):
    with open(os.path.join(DATA_DIR, res + '.csv')) as f:
        return {row['rotamer']: row for row in csv.DictReader(f)}


def csv_residues():
    return sorted(name[:-4] for name in os.listdir(DATA_DIR) if name.endswith('.csv'))


class Top8000TableTests(unittest.TestCase):
    def setUp(self):
        from top8000_rotamers import TOP8000_ROTAMERS
        self.table = TOP8000_ROTAMERS

    def test_names_are_top8000_at_one_percent(self):
        for res in csv_residues():
            rows = read_csv(res)
            wanted = {n for n, r in rows.items() if float(r['frequency%']) >= 1.0}
            self.assertEqual({n for n, _, _ in self.table[res]}, wanted, res)

    def test_chis_and_frequencies_match_csv(self):
        for res in csv_residues():
            rows = read_csv(res)
            for name, chis, freq in self.table[res]:
                row = rows[name]
                expected = [round(float(row['chi%d_mean' % (i + 1)])) for i in range(len(chis))]
                self.assertEqual(chis, expected, '%s %s' % (res, name))
                self.assertAlmostEqual(freq, float(row['frequency%']), delta=0.005, msg='%s %s' % (res, name))

    def test_id_order_matches_spec(self):
        self.assertEqual(set(self.table), set(EXPECTED_ORDER))
        for res, names in EXPECTED_ORDER.items():
            self.assertEqual([n for n, _, _ in self.table[res]], names, res)
        self.assertEqual(sum(len(v) for v in self.table.values()), 138)


def _target_sites(atom_names, coords, residue_ids):
    return {n.strip(): coords[i] for i, n in enumerate(atom_names) if residue_ids[i] == 'target'}


def _angle(p, q, r):
    import math
    u = [p[i] - q[i] for i in range(3)]
    v = [r[i] - q[i] for i in range(3)]
    c = sum(a * b for a, b in zip(u, v)) / (math.hypot(*u) * math.hypot(*v))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


class ProlinePuckerTests(unittest.TestCase):
    # (chi1, chi2 mean, chi2 esd, chi3 mean, chi3 esd) from Top8000 PRO.csv
    PUCKERS = {'Cg_endo': (27, -34, 8.9, 28, 9.2), 'Cg_exo': (-25, 36, 7.8, -32, 7.1)}

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import generate_density_puzzles as g
        cls.g = g
        cls.names, cls.coords, _, cls.rids, _ = g.build_tripeptide('PRO')

    def puckered(self, chi1):
        coords = self.g.set_pro_pucker(self.names, [list(c) for c in self.coords], self.rids, chi1)
        return _target_sites(self.names, coords, self.rids)

    def test_place_pro_ring_hits_chi1_and_geostd(self):
        import math
        a = _target_sites(self.names, self.coords, self.rids)
        ideals = self.g.pro_ring_ideals()
        for chi1 in (27, -25):
            cg, cd = self.g.place_pro_ring(a['N'], a['CA'], a['CB'], chi1, ideals)
            self.assertAlmostEqual(self.g.dihedral_angle(a['N'], a['CA'], a['CB'], cg), chi1, delta=0.5)
            self.assertAlmostEqual(math.dist(a['CB'], cg), ideals['CB-CG'][0], delta=0.001)
            self.assertAlmostEqual(math.dist(cg, cd), ideals['CG-CD'][0], delta=0.001)
            self.assertAlmostEqual(_angle(a['CA'], a['CB'], cg), ideals['CA-CB-CG'][0], delta=0.01)
            self.assertAlmostEqual(_angle(a['CB'], cg, cd), ideals['CB-CG-CD'][0], delta=0.01)
            ideal, esd = ideals['CD-N']
            self.assertAlmostEqual(math.dist(cd, a['N']), ideal, delta=2 * esd)

    def test_place_pro_ring_stays_on_the_pucker_branch(self):
        a = _target_sites(self.names, self.coords, self.rids)
        ideals = dict(self.g.pro_ring_ideals())
        esd = ideals['CD-N'][1]
        for k in range(21):
            ideals['CD-N'] = ideals['N-CD'] = (1.468 + 0.0005 * k, esd)
            for chi1 in (27, -25):
                cg, cd = self.g.place_pro_ring(a['N'], a['CA'], a['CB'], chi1, ideals)
                chi2 = self.g.dihedral_angle(a['CA'], a['CB'], cg, cd)
                self.assertLess(chi1 * chi2, 0, (chi1, round(chi2, 1), ideals['CD-N'][0]))
                self.assertGreater(abs(chi2), 15, (chi1, round(chi2, 1), ideals['CD-N'][0]))

    def test_pro_puckers_match_top8000(self):
        d = self.g.dihedral_angle
        for name, (chi1, chi2, e2, chi3, e3) in self.PUCKERS.items():
            a = self.puckered(chi1)
            self.assertAlmostEqual(d(a['CA'], a['CB'], a['CG'], a['CD']), chi2, delta=e2, msg=name)
            self.assertAlmostEqual(d(a['CB'], a['CG'], a['CD'], a['N']), chi3, delta=e3, msg=name)

    def test_pro_pucker_angles_within_two_sigma(self):
        for name, (chi1, *_rest) in self.PUCKERS.items():
            a = self.puckered(chi1)
            self.assertAlmostEqual(_angle(a['CA'], a['CB'], a['CG']), 104.5, delta=3.8, msg=name)
            self.assertAlmostEqual(_angle(a['CB'], a['CG'], a['CD']), 106.1, delta=6.4, msg=name)
            self.assertAlmostEqual(_angle(a['CG'], a['CD'], a['N']), 103.2, delta=2 * 1.5, msg=name)

    def test_set_pro_pucker_rejects_impossible_chi1(self):
        with self.assertRaises(ValueError):
            self.puckered(120)


STATIC_DATA = os.path.join(ROOT, 'web', 'data')


class GeneratorOutputTests(unittest.TestCase):
    def test_stale_puzzle_files(self):
        import tempfile
        from generate_density_puzzles import stale_puzzle_files
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('density_leu_rot4.json', 'density_leu_rot0.json', 'manifest.json', 'notes.txt'):
                open(os.path.join(tmp, name), 'w').close()
            self.assertEqual(stale_puzzle_files(tmp, {'density_leu_rot0'}), ['density_leu_rot4.json'])

    def test_partial_run_keeps_other_residues(self):
        import json
        import tempfile
        from generate_density_puzzles import run
        with tempfile.TemporaryDirectory() as tmp:
            entries = [{'id': 'density_ala_rot0', 'file': 'density_ala_rot0.json', 'amino_acid': 'ALA'},
                       {'id': 'density_gly_rot0', 'file': 'density_gly_rot0.json', 'amino_acid': 'GLY'}]
            for e in entries:
                with open(os.path.join(tmp, e['file']), 'w') as f:
                    f.write('{}')
            with open(os.path.join(tmp, 'manifest.json'), 'w') as f:
                json.dump({'puzzles': entries}, f)
            run(tmp, amino_acids=['GLY'], log=lambda *a: None)
            self.assertTrue(os.path.exists(os.path.join(tmp, 'density_ala_rot0.json')))
            with open(os.path.join(tmp, 'manifest.json')) as f:
                ids = [p['id'] for p in json.load(f)['puzzles']]
            self.assertEqual(ids, ['density_ala_rot0', 'density_gly_rot0'])

    def test_failed_puzzle_stops_run_and_keeps_data(self):
        import json
        import tempfile
        from unittest import mock
        from generate_density_puzzles import run
        from generate_density_puzzles import GenerationError
        import generate_density_puzzles as g
        real = g.generate_puzzle

        def fail_ala(resname, *args):
            if resname == 'ALA':
                raise ValueError('ALA: no Ramachandran-favoured backbone change clears the clashes')
            return real(resname, *args)

        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, 'density_ala_rot0.json'), 'w') as f:
                f.write('{"old": true}')
            manifest = {'puzzles': [{'id': 'density_ala_rot0', 'file': 'density_ala_rot0.json', 'amino_acid': 'ALA'}]}
            with open(os.path.join(tmp, 'manifest.json'), 'w') as f:
                json.dump(manifest, f)
            with mock.patch.object(g, 'generate_puzzle', fail_ala), self.assertRaises(GenerationError):
                run(tmp, amino_acids=['GLY', 'ALA'], log=lambda *a: None)
            with open(os.path.join(tmp, 'density_ala_rot0.json')) as f:
                self.assertEqual(f.read(), '{"old": true}')
            with open(os.path.join(tmp, 'manifest.json')) as f:
                self.assertEqual(json.load(f), manifest)

    def test_manifest_matches_table(self):
        import json
        from top8000_rotamers import TOP8000_ROTAMERS
        with open(os.path.join(STATIC_DATA, 'manifest.json')) as f:
            puzzles = json.load(f)['puzzles']
        expected = [('density_%s_rot%d' % (res.lower(), i), name, freq)
                    for res, rows in TOP8000_ROTAMERS.items() for i, (name, _, freq) in enumerate(rows)]
        self.assertEqual(len(puzzles), 138)
        self.assertEqual(sorted((p['id'], p['rotamer'], p.get('frequency')) for p in puzzles), sorted(expected))

    def test_every_puzzle_within_two_sigma_of_geostd(self):
        import glob
        import json
        import math
        from pro_ring import geostd_restraints
        cache, problems = {}, []
        for path in sorted(glob.glob(os.path.join(STATIC_DATA, 'density_*_rot*.json'))):
            with open(path) as f:
                atoms = json.load(f)['atoms']
            residues = []
            for a in atoms:
                if a['name'] == 'N' or not residues:
                    residues.append({'_res': a['residue']})
                residues[-1][a['name']] = (a['x'], a['y'], a['z'])
            label = os.path.basename(path)
            for r in residues:
                res = r['_res']
                if res not in cache:
                    cache[res] = geostd_restraints(res)
                bonds, angles = cache[res]
                for a1, a2, ideal, esd in bonds:
                    if a1 in r and a2 in r and abs(math.dist(r[a1], r[a2]) - ideal) > 2 * esd:
                        problems.append('%s %s %s-%s %.3f vs %.3f' % (label, res, a1, a2, math.dist(r[a1], r[a2]), ideal))
                for a1, a2, a3, ideal, esd in angles:
                    if a1 in r and a2 in r and a3 in r:
                        value = _angle(r[a1], r[a2], r[a3])
                        if abs(value - ideal) > 2 * esd:
                            problems.append('%s %s %s-%s-%s %.1f vs %.1f' % (label, res, a1, a2, a3, value, ideal))
            for r1, r2 in zip(residues, residues[1:]):
                if abs(math.dist(r1['C'], r2['N']) - 1.329) > 2 * 0.014:
                    problems.append('%s peptide C-N %.3f vs 1.329' % (label, math.dist(r1['C'], r2['N'])))
        self.assertEqual(problems, [])


def _residue_sites(atom_names, coords):
    """List of {name: xyz} per residue, splitting at each N."""
    residues = []
    for name, xyz in zip(atom_names, coords):
        if name.strip() == 'N' or not residues:
            residues.append({})
        residues[-1][name.strip()] = xyz
    return residues


class BackboneClashTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import generate_density_puzzles as g
        cls.g = g

    def test_set_backbone_torsion_keeps_bonds(self):
        import math
        names, coords, elements, _, _ = self.g.build_tripeptide('ASN')
        moved = self.g.set_backbone_torsion(names, coords, elements, 1, 'psi', -30.0)
        r = _residue_sites(names, moved)
        self.assertAlmostEqual(self.g.dihedral_angle(r[1]['N'], r[1]['CA'], r[1]['C'], r[2]['N']), -30.0, delta=0.01)
        for i, j in self.g.compute_bonds(names, coords, elements):
            self.assertAlmostEqual(math.dist(moved[i], moved[j]), math.dist(coords[i], coords[j]), delta=1e-6)

    def test_relieve_clashes_fixes_asn_p0(self):
        from top8000_rotamers import TOP8000_ROTAMERS
        names, coords, elements, rids, resnames = self.g.build_tripeptide('ASN')
        chis = dict((n, c) for n, c, _ in TOP8000_ROTAMERS['ASN'])['p0']
        coords = self.g.set_chi_angles(names, coords, rids, 'ASN', chis)
        self.assertGreaterEqual(self.g.max_clash_overlap(names, coords, elements, resnames), 0.4)
        fixed, dphi, dpsi = self.g.relieve_clashes(names, coords, elements, resnames, 'ASN')
        self.assertLess(self.g.max_clash_overlap(names, fixed, elements, resnames), 0.4)
        self.assertEqual(dphi, 0)
        self.assertLessEqual(abs(dpsi), 5)

    def test_pro_puzzles_have_pre_pro_psi(self):
        import json
        for name in ('density_pro_rot0.json', 'density_pro_rot1.json'):
            with open(os.path.join(STATIC_DATA, name)) as f:
                atoms = json.load(f)['atoms']
            r = _residue_sites([a['name'] for a in atoms], [(a['x'], a['y'], a['z']) for a in atoms])
            psi = self.g.dihedral_angle(r[0]['N'], r[0]['CA'], r[0]['C'], r[1]['N'])
            self.assertAlmostEqual(psi, 140.0, delta=0.5, msg=name)


if __name__ == '__main__':
    unittest.main()
