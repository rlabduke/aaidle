"""Proline ring (CG, CD) built from chem_data/geostd ideals; shared with AA.ID.LE's Peptide Word generator."""
import functools
import math
import os


def geostd_restraints(resname):
    """Heavy-atom (bonds, angles) from chem_data/geostd as (a1, a2, ideal, esd) and (a1, a2, a3, ideal, esd)."""
    import iotbx.cif
    import libtbx.load_env  # noqa: F401  (sets libtbx.env)
    import libtbx
    geostd = libtbx.env.find_in_repositories(relative_path='chem_data/geostd', test=os.path.isdir)
    path = os.path.join(geostd, resname[0].lower(), 'data_%s.cif' % resname)
    block = iotbx.cif.reader(file_path=path).model()['comp_%s' % resname]
    heavy = lambda *names: not any(n.startswith('H') for n in names)
    b = block.get_loop('_chem_comp_bond')
    bonds = [(a1, a2, float(v), float(e)) for a1, a2, v, e in zip(
        b['_chem_comp_bond.atom_id_1'], b['_chem_comp_bond.atom_id_2'],
        b['_chem_comp_bond.value_dist'], b['_chem_comp_bond.value_dist_esd']) if heavy(a1, a2)]
    a = block.get_loop('_chem_comp_angle')
    angles = [(a1, a2, a3, float(v), float(e)) for a1, a2, a3, v, e in zip(
        a['_chem_comp_angle.atom_id_1'], a['_chem_comp_angle.atom_id_2'], a['_chem_comp_angle.atom_id_3'],
        a['_chem_comp_angle.value_angle'], a['_chem_comp_angle.value_angle_esd']) if heavy(a1, a2, a3)]
    return bonds, angles


def place_atom(a, b, c, bond, angle, torsion):
    """Atom d with |cd| = bond, angle b-c-d and torsion a-b-c-d in degrees."""
    bc = [c[i] - b[i] for i in range(3)]
    nbc = math.sqrt(sum(x * x for x in bc))
    bc = [x / nbc for x in bc]
    ab = [b[i] - a[i] for i in range(3)]
    n = [ab[1] * bc[2] - ab[2] * bc[1], ab[2] * bc[0] - ab[0] * bc[2], ab[0] * bc[1] - ab[1] * bc[0]]
    nn = math.sqrt(sum(x * x for x in n))
    n = [x / nn for x in n]
    m = [n[1] * bc[2] - n[2] * bc[1], n[2] * bc[0] - n[0] * bc[2], n[0] * bc[1] - n[1] * bc[0]]
    th, ph = math.radians(angle), math.radians(torsion)
    d2 = [-bond * math.cos(th), bond * math.sin(th) * math.cos(ph), bond * math.sin(th) * math.sin(ph)]
    return [c[i] + d2[0] * bc[i] + d2[1] * m[i] + d2[2] * n[i] for i in range(3)]


@functools.lru_cache(maxsize=None)
def pro_ring_ideals():
    """geostd ideals (value, esd) for the proline ring, keyed 'CB-CG', 'CA-CB-CG' and so on."""
    bonds, angles = geostd_restraints('PRO')
    ideals = {}
    for a1, a2, v, e in bonds:
        ideals['%s-%s' % (a1, a2)] = ideals['%s-%s' % (a2, a1)] = (v, e)
    for a1, a2, a3, v, e in angles:
        ideals['%s-%s-%s' % (a1, a2, a3)] = ideals['%s-%s-%s' % (a3, a2, a1)] = (v, e)
    return ideals


def place_pro_ring(n, ca, cb, chi1, ideals):
    """(CG, CD) at geostd bonds and angles with N-CA-CB-CG = chi1; chi2 is the one that best closes CD-N.

    chi2 is searched from 15 to 90 degrees on the pucker's side (opposite sign to chi1): each pucker also closes
    within about 2 degrees of chi2 = 0, with CD-N-CA about 103 degrees (geostd 112).
    """
    cg = place_atom(n, ca, cb, ideals['CB-CG'][0], ideals['CA-CB-CG'][0], chi1)
    d_cd_n = ideals['CD-N'][0]

    def cd_for(chi2):
        return place_atom(ca, cb, cg, ideals['CG-CD'][0], ideals['CB-CG-CD'][0], chi2)

    sign = -1 if chi1 > 0 else 1
    best = min((sign * k / 10.0 for k in range(150, 901)), key=lambda chi2: abs(math.dist(cd_for(chi2), n) - d_cd_n))
    return cg, cd_for(best)
