"""
Generate electron density puzzle data for the density guessing game.

Generates isosurface meshes at multiple resolutions from idealized amino acid conformers
using CCTBX, then writes JSON puzzle files + manifest for the frontend.

Usage (cctbx Python):
    python generator/generate_density_puzzles.py
    python generator/generate_density_puzzles.py --out /path/to/output
    python generator/generate_density_puzzles.py --amino-acids TRP PHE TYR
"""

import json
import math
import os
import sys

import numpy as np

from pro_ring import place_pro_ring, pro_ring_ideals
from top8000_rotamers import TOP8000_ROTAMERS

# Resolution steps from blurry to sharp
RESOLUTION_STEPS = [3.5, 2.5, 2.0, 1.5, 1.0]

# Uniform B-factor for clean density
UNIFORM_B = 20.0

# Contour level in sigma (higher at high resolution for cleaner mesh)
CONTOUR_SIGMA = {3.5: 2.0, 2.5: 2.0, 2.0: 2.5, 1.5: 4.0, 1.0: 6.0}

# P1 box size (Angstroms)
BOX_SIZE = 30.0

# All 20 standard amino acids with metadata
AMINO_ACIDS = {
    'GLY': {'one': 'G', 'name': 'Glycine',       'group': 'nonpolar'},
    'ALA': {'one': 'A', 'name': 'Alanine',       'group': 'nonpolar'},
    'VAL': {'one': 'V', 'name': 'Valine',        'group': 'nonpolar'},
    'LEU': {'one': 'L', 'name': 'Leucine',       'group': 'nonpolar'},
    'ILE': {'one': 'I', 'name': 'Isoleucine',    'group': 'nonpolar'},
    'PRO': {'one': 'P', 'name': 'Proline',       'group': 'nonpolar'},
    'PHE': {'one': 'F', 'name': 'Phenylalanine', 'group': 'aromatic'},
    'TRP': {'one': 'W', 'name': 'Tryptophan',    'group': 'aromatic'},
    'TYR': {'one': 'Y', 'name': 'Tyrosine',      'group': 'aromatic'},
    'SER': {'one': 'S', 'name': 'Serine',        'group': 'polar'},
    'THR': {'one': 'T', 'name': 'Threonine',     'group': 'polar'},
    'ASN': {'one': 'N', 'name': 'Asparagine',    'group': 'polar'},
    'GLN': {'one': 'Q', 'name': 'Glutamine',     'group': 'polar'},
    'CYS': {'one': 'C', 'name': 'Cysteine',      'group': 'polar'},
    'MET': {'one': 'M', 'name': 'Methionine',    'group': 'polar'},
    'ASP': {'one': 'D', 'name': 'Aspartate',     'group': 'charged'},
    'GLU': {'one': 'E', 'name': 'Glutamate',     'group': 'charged'},
    'LYS': {'one': 'K', 'name': 'Lysine',        'group': 'charged'},
    'ARG': {'one': 'R', 'name': 'Arginine',      'group': 'charged'},
    'HIS': {'one': 'H', 'name': 'Histidine',     'group': 'charged'},
}

# Chi angle atom definitions for each amino acid
# Each chi is defined by 4 atom names; atom names match CCTBX build_tripeptide() output
CHI_DEFINITIONS = {
    'VAL': [['N', 'CA', 'CB', 'CG1']],
    'LEU': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD1']],
    'ILE': [['N', 'CA', 'CB', 'CG1'], ['CA', 'CB', 'CG1', 'CD1']],
    'PHE': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD1']],
    'TRP': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD1']],
    'TYR': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD1']],
    'SER': [['N', 'CA', 'CB', 'OG']],
    'THR': [['N', 'CA', 'CB', 'OG1']],
    'CYS': [['N', 'CA', 'CB', 'SG']],
    'MET': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'SD'], ['CB', 'CG', 'SD', 'CE']],
    'ASN': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'OD1']],
    'ASP': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'OD1']],
    'GLN': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD'], ['CB', 'CG', 'CD', 'OE1']],
    'GLU': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD'], ['CB', 'CG', 'CD', 'OE1']],
    'LYS': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD'], ['CB', 'CG', 'CD', 'CE'], ['CG', 'CD', 'CE', 'NZ']],
    'ARG': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'CD'], ['CB', 'CG', 'CD', 'NE'], ['CG', 'CD', 'NE', 'CZ']],
    'HIS': [['N', 'CA', 'CB', 'CG'], ['CA', 'CB', 'CG', 'ND1']],
}

# Difficulty tiers
DIFFICULTY_TIERS = {
    'easy': ['GLY', 'ALA', 'PRO', 'PHE', 'TRP', 'TYR'],
    'medium': ['GLY', 'ALA', 'PRO', 'PHE', 'TRP', 'TYR',
               'SER', 'THR', 'VAL', 'LEU', 'ILE', 'CYS', 'MET', 'HIS'],
    'hard': list(AMINO_ACIDS.keys()),
}

# Covalent bond distance thresholds by element pair
BOND_THRESHOLDS = {
    ('C', 'C'): 1.9, ('C', 'N'): 1.8, ('C', 'O'): 1.8, ('C', 'S'): 2.2,
    ('N', 'N'): 1.8, ('N', 'O'): 1.8, ('N', 'S'): 2.0,
    ('O', 'O'): 1.8, ('O', 'S'): 2.0, ('S', 'S'): 2.5,
}


def get_bond_threshold(e1, e2):
    key = tuple(sorted([e1.upper(), e2.upper()]))
    return BOND_THRESHOLDS.get(key, 1.9)


def build_tripeptide(resname):
    """Build ALA-X-ALA tripeptide in alpha-helix geometry using CCTBX.

    Uses mmtbx.secondary_structure.build.ss_idealization to generate a
    3-residue peptide with proper peptide bonds. The target residue (X)
    is flanked by alanines to provide realistic backbone context.

    Returns (atom_names, coords, elements, residue_ids) with hydrogens excluded.
    residue_ids marks which residue each atom belongs to: 'flank' or 'target'.
    """
    from mmtbx.secondary_structure.build.ss_idealization import (
        secondary_structure_from_sequence, alpha_helix_str
    )

    one_letter = AMINO_ACIDS[resname]['one']
    ph = secondary_structure_from_sequence(
        pdb_str=alpha_helix_str, sequence=f'A{one_letter}A'
    )

    atom_names = []
    coords = []
    elements = []
    residue_ids = []
    resnames = []

    for chain in ph.chains():
        for i, rg in enumerate(chain.residue_groups()):
            # Residue 0 and 2 are flanking ALAs, residue 1 is the target
            rid = 'target' if i == 1 else 'flank'
            for ag in rg.atom_groups():
                rn = ag.resname.strip()
                for atom in ag.atoms():
                    elem = atom.element.strip()
                    if elem in ('H', 'D'):
                        continue
                    atom_names.append(atom.name)
                    coords.append(tuple(atom.xyz))
                    elements.append(elem)
                    residue_ids.append(rid)
                    resnames.append(rn)

    if not coords:
        raise ValueError(f"No heavy atoms found for tripeptide with {resname}")

    return atom_names, coords, elements, residue_ids, resnames


def center_coordinates(coords, residue_ids=None):
    """Center coordinates on centroid and return centered coords + centroid.

    If residue_ids is provided, centers on the centroid of 'target' atoms only,
    so the camera and density crop focus on the sidechain of interest.
    """
    arr = np.array(coords)
    if residue_ids is not None:
        target_mask = np.array([rid == 'target' for rid in residue_ids])
        centroid = arr[target_mask].mean(axis=0)
    else:
        centroid = arr.mean(axis=0)
    centered = arr - centroid
    return centered.tolist(), centroid.tolist()


def build_xray_structure(atoms, coords, elements, resname):
    """Build a CCTBX xray_structure in a P1 box from atom data."""
    from cctbx import crystal, xray, eltbx
    from cctbx.array_family import flex

    # Create P1 crystal symmetry with a large box
    cs = crystal.symmetry(
        unit_cell=(BOX_SIZE, BOX_SIZE, BOX_SIZE, 90, 90, 90),
        space_group_symbol="P1"
    )

    # Build xray structure
    xs = xray.structure(crystal_symmetry=cs)

    for i, (name, coord, elem) in enumerate(zip(atoms, coords, elements)):
        # Convert Cartesian to fractional coordinates
        frac = cs.unit_cell().fractionalize(coord)
        scatterer = xray.scatterer(
            label=f"{name}_{i}",
            site=frac,
            u=UNIFORM_B / (8 * math.pi**2),  # Convert B to U
            occupancy=1.0,
            scattering_type=elem,
        )
        xs.add_scatterer(scatterer)

    return xs


def calculate_density_map(xs, d_min, resolution_factor=0.25):
    """Calculate an electron density map at a given resolution.

    Returns a 3D numpy array (sigma-scaled).
    """
    # Calculate structure factors
    f_calc = xs.structure_factors(d_min=d_min).f_calc()

    # FFT to real-space map
    fft_map = f_calc.fft_map(resolution_factor=resolution_factor)
    fft_map.apply_sigma_scaling()

    # Get the real-space map as a 3D array
    map_data = fft_map.real_map_unpadded()

    return map_data, fft_map


def extract_isosurface(map_data, unit_cell, contour_level, center_cart, radius=12.0):
    """Extract isosurface mesh using CCTBX's built-in marching cubes.

    Uses scitbx.iso_surface.triangulation (no external dependencies needed).

    Args:
        map_data: 3D flex array from CCTBX
        unit_cell: CCTBX unit_cell object
        contour_level: Sigma level for contouring
        center_cart: Cartesian center of the residue [x, y, z]
        radius: Radius around center to extract (Angstroms)

    Returns:
        dict with 'v' (vertices), 'f' (faces), 'n' (normals) as flat lists
    """
    from scitbx.iso_surface import triangulation

    # Map extent in Cartesian (unit cell dimensions for orthorhombic P1)
    uc_params = unit_cell.parameters()
    map_extent = (uc_params[0], uc_params[1], uc_params[2])

    try:
        iso = triangulation(
            map=map_data,
            iso_level=contour_level,
            map_extent=map_extent,
            from_here=(0.0, 0.0, 0.0),
            to_there=map_extent,
            periodic=True,
            lazy_normals=False,
        )
    except Exception:
        return {'v': [], 'f': [], 'n': []}

    verts_raw = iso.vertices    # list of (x,y,z) tuples in Cartesian
    tris_raw = iso.triangles    # list of (i,j,k) index tuples
    normals_raw = iso.normals   # list of (nx,ny,nz) tuples

    if len(verts_raw) == 0:
        return {'v': [], 'f': [], 'n': []}

    # Convert to numpy for efficient manipulation
    verts = np.array([(v[0], v[1], v[2]) for v in verts_raw])
    faces = np.array([(t[0], t[1], t[2]) for t in tris_raw], dtype=int)
    normals = np.array([(n[0], n[1], n[2]) for n in normals_raw])

    # Recenter on residue center (so mesh origin = residue centroid)
    center = np.array(center_cart)
    verts_centered = verts - center

    # Distance-based crop: keep only triangles near the residue
    dists = np.linalg.norm(verts_centered, axis=1)
    face_mask = np.all(dists[faces] < radius, axis=1)
    kept_faces = faces[face_mask]

    if len(kept_faces) == 0:
        return {'v': [], 'f': [], 'n': []}

    # Re-index to only include used vertices
    used_verts = np.unique(kept_faces.flatten())
    vert_remap = np.full(len(verts_centered), -1, dtype=int)
    vert_remap[used_verts] = np.arange(len(used_verts))

    new_verts = verts_centered[used_verts]
    new_faces = vert_remap[kept_faces]
    new_normals = normals[used_verts]

    return {
        'v': np.round(new_verts.flatten(), 3).tolist(),
        'f': new_faces.flatten().tolist(),
        'n': np.round(new_normals.flatten(), 3).tolist(),
    }


def compute_bonds(atoms, coords, elements):
    """Compute covalent bonds from atom positions and elements."""
    bonds = []
    n = len(atoms)
    for i in range(n):
        for j in range(i + 1, n):
            dist = math.sqrt(sum((a - b)**2 for a, b in zip(coords[i], coords[j])))
            threshold = get_bond_threshold(elements[i], elements[j])
            if dist < threshold:
                bonds.append([i, j])
    return bonds


def dihedral_angle(p1, p2, p3, p4):
    """Compute dihedral angle (degrees) defined by 4 points."""
    b1 = [p2[i] - p1[i] for i in range(3)]
    b2 = [p3[i] - p2[i] for i in range(3)]
    b3 = [p4[i] - p3[i] for i in range(3)]

    # Cross products
    n1 = [b1[1]*b2[2] - b1[2]*b2[1],
           b1[2]*b2[0] - b1[0]*b2[2],
           b1[0]*b2[1] - b1[1]*b2[0]]
    n2 = [b2[1]*b3[2] - b2[2]*b3[1],
           b2[2]*b3[0] - b2[0]*b3[2],
           b2[0]*b3[1] - b2[1]*b3[0]]

    # Normalize
    len_n1 = math.sqrt(sum(x*x for x in n1))
    len_n2 = math.sqrt(sum(x*x for x in n2))
    if len_n1 < 1e-10 or len_n2 < 1e-10:
        return 0.0
    n1 = [x / len_n1 for x in n1]
    n2 = [x / len_n2 for x in n2]

    # Dot and cross for signed angle
    dot = sum(a*b for a, b in zip(n1, n2))
    dot = max(-1.0, min(1.0, dot))

    # Sign from cross(n1,n2) . b2
    cross = [n1[1]*n2[2] - n1[2]*n2[1],
             n1[2]*n2[0] - n1[0]*n2[2],
             n1[0]*n2[1] - n1[1]*n2[0]]
    len_b2 = math.sqrt(sum(x*x for x in b2))
    if len_b2 < 1e-10:
        return 0.0
    b2_hat = [x / len_b2 for x in b2]
    sign = sum(a*b for a, b in zip(cross, b2_hat))

    angle = math.degrees(math.acos(dot))
    if sign < 0:
        angle = -angle
    return angle


def rodrigues_rotation(v, axis, theta):
    """Rotate vector v around unit axis by theta radians (Rodrigues' formula)."""
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    dot = sum(a*b for a, b in zip(v, axis))
    cross = [axis[1]*v[2] - axis[2]*v[1],
             axis[2]*v[0] - axis[0]*v[2],
             axis[0]*v[1] - axis[1]*v[0]]
    return [v[i]*cos_t + cross[i]*sin_t + axis[i]*dot*(1 - cos_t)
            for i in range(3)]


def find_downstream(start, exclude, bonds):
    """BFS from start atom, not crossing exclude, returning all reachable indices."""
    visited = {start}
    queue = [start]
    while queue:
        current = queue.pop(0)
        for neighbor in bonds.get(current, []):
            if neighbor != exclude and neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return visited


def set_chi_angles(atom_names, coords, residue_ids, target_resname, chi_angles):
    """Apply chi angle rotations to sidechain atoms of the target residue.

    Modifies atomic coordinates in-place (returns new list) so that each chi
    angle matches the desired value.
    """
    chi_defs = CHI_DEFINITIONS.get(target_resname)
    if not chi_defs:
        return coords

    # Build index of target residue atoms: name -> index
    target_indices = []
    target_name_to_idx = {}
    for i, (name, rid) in enumerate(zip(atom_names, residue_ids)):
        if rid == 'target':
            target_indices.append(i)
            target_name_to_idx[name.strip()] = i

    # Build bond adjacency for target residue atoms only
    bond_adj = {i: [] for i in target_indices}
    for i in target_indices:
        for j in target_indices:
            if i >= j:
                continue
            dist = math.sqrt(sum((a - b)**2 for a, b in zip(coords[i], coords[j])))
            e1 = atom_names[i].strip()[0] if atom_names[i].strip()[0] in 'CNOS' else 'C'
            e2 = atom_names[j].strip()[0] if atom_names[j].strip()[0] in 'CNOS' else 'C'
            threshold = get_bond_threshold(e1, e2)
            if dist < threshold:
                bond_adj[i].append(j)
                bond_adj[j].append(i)

    coords = [list(c) for c in coords]  # Make mutable

    for chi_idx, desired_angle in enumerate(chi_angles):
        if chi_idx >= len(chi_defs):
            break

        a1_name, a2_name, a3_name, a4_name = chi_defs[chi_idx]
        a1 = target_name_to_idx.get(a1_name)
        a2 = target_name_to_idx.get(a2_name)
        a3 = target_name_to_idx.get(a3_name)
        a4 = target_name_to_idx.get(a4_name)

        if any(x is None for x in (a1, a2, a3, a4)):
            continue

        # Compute current dihedral
        current = dihedral_angle(coords[a1], coords[a2], coords[a3], coords[a4])
        delta = math.radians(desired_angle - current)

        if abs(delta) < 1e-6:
            continue

        # Find atoms downstream of a3 (not crossing back to a2)
        downstream = find_downstream(a3, a2, bond_adj)
        downstream.discard(a3)  # Pivot atom doesn't move

        # Rotation axis: a2 -> a3
        axis = [coords[a3][k] - coords[a2][k] for k in range(3)]
        axis_len = math.sqrt(sum(x*x for x in axis))
        if axis_len < 1e-10:
            continue
        axis = [x / axis_len for x in axis]

        # Rotate downstream atoms around a2->a3 axis
        pivot = coords[a3]
        for idx in downstream:
            v = [coords[idx][k] - pivot[k] for k in range(3)]
            rotated = rodrigues_rotation(v, axis, delta)
            coords[idx] = [rotated[k] + pivot[k] for k in range(3)]

    return [tuple(c) for c in coords]


def _wrap(angle):
    return (angle + 180.0) % 360.0 - 180.0


def _angle_deg(p, q, r):
    u = [p[i] - q[i] for i in range(3)]
    v = [r[i] - q[i] for i in range(3)]
    c = sum(a * b for a, b in zip(u, v)) / (math.sqrt(sum(x * x for x in u)) * math.sqrt(sum(x * x for x in v)))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


# Top8000 PRO.csv chi2 and chi3 (mean, esd) for each pucker.
PRO_RING_CHIS = {'Cg_endo': ((-34, 8.9), (28, 9.2)), 'Cg_exo': ((36, 7.8), (-32, 7.1))}


def set_pro_pucker(atom_names, coords, residue_ids, chi1):
    """Rebuild the target proline's CG and CD for a ring pucker; ValueError if it misses Top8000 or geostd."""
    idx = {atom_names[i].strip(): i for i in range(len(atom_names)) if residue_ids[i] == 'target'}
    ideals = pro_ring_ideals()
    coords = [list(c) for c in coords]
    site = lambda name: coords[idx[name]]
    coords[idx['CG']], coords[idx['CD']] = place_pro_ring(site('N'), site('CA'), site('CB'), chi1, ideals)

    pucker = 'Cg_endo' if chi1 > 0 else 'Cg_exo'
    (chi2, esd2), (chi3, esd3) = PRO_RING_CHIS[pucker]
    checks = [
        ('chi1', dihedral_angle(site('N'), site('CA'), site('CB'), site('CG')), chi1, 0.5),
        ('chi2', dihedral_angle(site('CA'), site('CB'), site('CG'), site('CD')), chi2, esd2),
        ('chi3', dihedral_angle(site('CB'), site('CG'), site('CD'), site('N')), chi3, esd3),
    ]
    for key in ('CD-N', 'CG-CD-N'):
        names = key.split('-')
        value = math.dist(site(names[0]), site(names[1])) if len(names) == 2 else _angle_deg(*map(site, names))
        ideal, esd = ideals[key]
        checks.append((key, value, ideal, 2 * esd))
    for label, value, target, tol in checks:
        if abs(_wrap(value - target)) > tol:
            raise ValueError('PRO %s: %s %.3f, expected %.3f +/- %.3f' % (pucker, label, value, target, tol))
    return [tuple(c) for c in coords]


def generate_puzzle(resname, rotamer_name, chi_angles, puzzle_index):
    """Generate a single puzzle: density meshes at all resolutions + atom data."""
    info = AMINO_ACIDS[resname]
    puzzle_id = f"density_{resname.lower()}_rot{puzzle_index}"

    # Build ALA-X-ALA tripeptide for realistic backbone context
    atom_names, coords, elements, residue_ids, resnames = build_tripeptide(resname)

    if resname == 'PRO':
        coords = set_pro_pucker(atom_names, coords, residue_ids, chi_angles[0])
        coords = set_backbone_torsion(atom_names, coords, elements, 0, 'psi', PRE_PRO_PSI)
    elif chi_angles:
        coords = set_chi_angles(atom_names, coords, residue_ids, resname, chi_angles)
    coords, _, _ = relieve_clashes(atom_names, coords, elements, resnames, resname)

    # Center on target residue centroid (camera + density crop focus on sidechain)
    centered_coords, centroid = center_coordinates(coords, residue_ids)

    # Place in box center
    box_center = [BOX_SIZE / 2.0] * 3
    placed_coords = [
        [c + box_center[k] for k, c in enumerate(coord)]
        for coord in centered_coords
    ]

    # Build xray structure (all 3 residues contribute to density)
    xs = build_xray_structure(atom_names, placed_coords, elements, resname)

    # Generate meshes at each resolution
    meshes = {}
    for d_min in RESOLUTION_STEPS:
        map_data, fft_map = calculate_density_map(xs, d_min)
        sigma = CONTOUR_SIGMA.get(d_min, 2.0)
        mesh = extract_isosurface(
            map_data,
            xs.unit_cell(),
            sigma,
            center_cart=box_center,
        )
        meshes[str(d_min)] = mesh

    # Compute bonds from centered coordinates (for display)
    bonds = compute_bonds(atom_names, centered_coords, elements)

    # Build atom list (centered coordinates for display)
    atom_list = []
    for i, (name, coord, elem, rid, rn) in enumerate(
        zip(atom_names, centered_coords, elements, residue_ids, resnames)
    ):
        atom_list.append({
            'id': i,
            'name': name.strip(),
            'element': elem,
            'residue': rn,
            'residue_id': rid,
            'x': round(coord[0], 3),
            'y': round(coord[1], 3),
            'z': round(coord[2], 3),
        })

    # Determine difficulty
    if resname in DIFFICULTY_TIERS['easy']:
        difficulty = 'easy'
    elif resname in DIFFICULTY_TIERS['medium']:
        difficulty = 'medium'
    else:
        difficulty = 'hard'

    return {
        'id': puzzle_id,
        'amino_acid': resname,
        'amino_acid_1': info['one'],
        'amino_acid_name': info['name'],
        'group': info['group'],
        'rotamer': rotamer_name,
        'difficulty': difficulty,
        'meshes': meshes,
        'atoms': atom_list,
        'bonds': bonds,
    }


# Residue before proline: no helical psi clears its N against the Pro CD; 120-150 clear both puckers.
PRE_PRO_PSI = 140.0
CLASH_OVERLAP = 0.4


def _residue_index(atom_names):
    """Residue number (0, 1, 2) of each atom; a new residue starts at each N."""
    index, r = [], -1
    for name in atom_names:
        if name.strip() == 'N':
            r += 1
        index.append(max(r, 0))
    return index


def set_backbone_torsion(atom_names, coords, elements, residue_index, kind, value):
    """Set phi or psi (degrees) of one residue by rotating everything on its C-terminal side."""
    res = _residue_index(atom_names)
    site = {(res[i], atom_names[i].strip()): i for i in range(len(atom_names))}
    r = residue_index
    if kind == 'phi':
        a1, a2, a3, a4 = site[(r - 1, 'C')], site[(r, 'N')], site[(r, 'CA')], site[(r, 'C')]
    else:
        a1, a2, a3, a4 = site[(r, 'N')], site[(r, 'CA')], site[(r, 'C')], site[(r + 1, 'N')]
    adj = {}
    for i, j in compute_bonds(atom_names, coords, elements):
        adj.setdefault(i, []).append(j)
        adj.setdefault(j, []).append(i)
    moving = find_downstream(a3, a2, adj) - {a3}
    current = dihedral_angle(coords[a1], coords[a2], coords[a3], coords[a4])
    pivot = coords[a3]
    axis = [coords[a3][k] - coords[a2][k] for k in range(3)]
    norm = math.sqrt(sum(x * x for x in axis))
    axis = [x / norm for x in axis]
    theta = math.radians(value - current)
    out = [list(c) for c in coords]
    for i in moving:
        v = [coords[i][k] - pivot[k] for k in range(3)]
        rotated = rodrigues_rotation(v, axis, theta)
        out[i] = [rotated[k] + pivot[k] for k in range(3)]
    return [tuple(c) for c in out]


def _pdb_string(atom_names, coords, elements, resnames):
    lines = []
    for i, (name, xyz, el, rn, r) in enumerate(zip(atom_names, coords, elements, resnames, _residue_index(atom_names))):
        name = name.strip()
        label = name if len(name) == 4 else ' ' + name.ljust(3)
        lines.append('ATOM  %5d %4s %3s A%4d    %8.3f%8.3f%8.3f  1.00 20.00          %2s'
                     % (i + 1, label, rn, r + 1, xyz[0], xyz[1], xyz[2], el))
    return '\n'.join(lines) + '\nEND\n'


def max_clash_overlap(atom_names, coords, elements, resnames):
    """Largest clashscore2 overlap (A, hydrogens added by clashscore2), 0 if none."""
    import iotbx.phil
    from iotbx.data_manager import DataManager
    from libtbx.utils import null_out
    from mmtbx.programs import clashscore2 as clashscore2_program
    from mmtbx.validation.clashscore2 import clashscore2
    params = iotbx.phil.parse(clashscore2_program.Program.master_phil_str, process_includes=True).extract().probe
    dm = DataManager(['model'])
    dm.process_model_str('tripeptide', _pdb_string(atom_names, coords, elements, resnames))
    result = clashscore2(params, data_manager=dm, keep_hydrogens=False, out=null_out())
    return max([abs(c.overlap) for c in result.results] or [0.0])


def _rama_favoured(resname, phi, psi):
    from mmtbx.rotamer import ramachandran_eval
    from mmtbx.validation import ramalyze
    category = {'GLY': 'glycine', 'PRO': 'trans-proline', 'ILE': 'isoleucine or valine',
                'VAL': 'isoleucine or valine'}.get(resname, 'general')
    value = ramachandran_eval.RamachandranEval().evaluate(category, [phi, psi])
    return ramalyze.ramalyze.evalScore(ramalyze.res_types.index(category), value) == ramalyze.RAMALYZE_FAVORED


def relieve_clashes(atom_names, coords, elements, resnames, resname):
    """Smallest Rama-favoured change to the target's psi, then phi (5 deg steps), that clears clashes.

    Returns (coords, dphi, dpsi); raises ValueError if nothing within +/-30 psi and +/-10 phi works.
    """
    if max_clash_overlap(atom_names, coords, elements, resnames) < CLASH_OVERLAP:
        return coords, 0, 0
    res = _residue_index(atom_names)
    site = {(res[i], atom_names[i].strip()): coords[i] for i in range(len(atom_names))}
    phi0 = dihedral_angle(site[(0, 'C')], site[(1, 'N')], site[(1, 'CA')], site[(1, 'C')])
    psi0 = dihedral_angle(site[(1, 'N')], site[(1, 'CA')], site[(1, 'C')], site[(2, 'N')])
    steps = [(dphi, dpsi) for dphi in (0, -5, 5, -10, 10) for dpsi in range(-30, 35, 5) if (dphi, dpsi) != (0, 0)]
    steps.sort(key=lambda d: (abs(d[0]) + abs(d[1]), abs(d[0]), -d[1]))
    for dphi, dpsi in steps:
        if resname == 'PRO' and dphi:
            continue
        if not _rama_favoured(resname, phi0 + dphi, psi0 + dpsi):
            continue
        trial = set_backbone_torsion(atom_names, coords, elements, 1, 'psi', psi0 + dpsi)
        if dphi:
            trial = set_backbone_torsion(atom_names, trial, elements, 1, 'phi', phi0 + dphi)
        if max_clash_overlap(atom_names, trial, elements, resnames) < CLASH_OVERLAP:
            return trial, dphi, dpsi
    raise ValueError('%s: no Ramachandran-favoured backbone change clears the clashes' % resname)


def stale_puzzle_files(output_dir, generated_ids):
    """Puzzle files in output_dir that this run did not generate."""
    return sorted(name for name in os.listdir(output_dir)
                  if name.startswith('density_') and '_rot' in name and name.endswith('.json')
                  and name[:-5] not in generated_ids)


def merge_manifest(existing, new_entries, processed):
    """Existing entries with each processed residue's entries replaced in place (appended if new)."""
    by_res = {}
    for e in new_entries:
        by_res.setdefault(e['amino_acid'], []).append(e)
    merged, placed = [], set()
    for e in existing:
        res = e['amino_acid']
        if res not in processed:
            merged.append(e)
        elif res not in placed:
            merged.extend(by_res.get(res, []))
            placed.add(res)
    for res in processed:
        if res not in placed:
            merged.extend(by_res.get(res, []))
    return merged


class GenerationError(Exception):
    pass


def run(output_dir, amino_acids=None, max_rotamers=0, log=print):
    os.makedirs(output_dir, exist_ok=True)
    log(f"Output directory: {output_dir}")

    # Determine which amino acids to process
    if amino_acids:
        aa_list = [aa.upper() for aa in amino_acids]
        for aa in aa_list:
            if aa not in AMINO_ACIDS:
                raise GenerationError(f"Unknown amino acid: {aa}")
    else:
        aa_list = list(AMINO_ACIDS.keys())

    manifest = []
    total_generated = 0
    errors = []

    for resname in aa_list:
        rotamers = TOP8000_ROTAMERS[resname]
        if max_rotamers > 0:
            rotamers = rotamers[:max_rotamers]

        for idx, (rot_name, chi_angles, frequency) in enumerate(rotamers):
            log(f"  Generating {resname} rotamer {rot_name} ({idx + 1}/{len(rotamers)})...")

            try:
                puzzle = generate_puzzle(resname, rot_name, chi_angles, idx)

                # Check that we got actual mesh data
                has_mesh = any(
                    len(puzzle['meshes'][str(res)]['v']) > 0
                    for res in RESOLUTION_STEPS
                )
                if not has_mesh:
                    log(f"    Warning: no mesh data for {resname} {rot_name}")

                # Write individual puzzle file
                filename = f"{puzzle['id']}.json"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, 'w') as f:
                    json.dump(puzzle, f, separators=(',', ':'))

                # Add to manifest
                manifest.append({
                    'id': puzzle['id'],
                    'file': filename,
                    'amino_acid': resname,
                    'amino_acid_1': puzzle['amino_acid_1'],
                    'amino_acid_name': puzzle['amino_acid_name'],
                    'group': puzzle['group'],
                    'rotamer': rot_name,
                    'frequency': frequency,
                    'difficulty': puzzle['difficulty'],
                })

                total_generated += 1
                log(f"    OK: {filename}")

            except Exception as e:
                errors.append(f"{resname} {rot_name}: {e}")
                log(f"    ERROR: {e}")

    # A failed puzzle stops here, before any file is deleted or the manifest rewritten.
    if errors:
        raise GenerationError('%d puzzle(s) failed; manifest and existing files left as they were:\n  %s'
                              % (len(errors), '\n  '.join(errors)))

    # A partial run merges into the existing manifest; only a full run removes files it didn't write.
    manifest_path = os.path.join(output_dir, 'manifest.json')
    full_run = not amino_acids and max_rotamers == 0
    if full_run:
        for name in stale_puzzle_files(output_dir, {e['id'] for e in manifest}):
            os.remove(os.path.join(output_dir, name))
            log(f"  Removed stale {name}")
    elif os.path.exists(manifest_path):
        with open(manifest_path) as f:
            existing = json.load(f).get('puzzles', [])
        manifest = merge_manifest(existing, manifest, aa_list)

    with open(manifest_path, 'w') as f:
        json.dump({
            'puzzles': manifest,
            'difficulty_tiers': DIFFICULTY_TIERS,
            'resolution_steps': RESOLUTION_STEPS,
        }, f, indent=2)

    log(f"\nGenerated {total_generated} puzzles in {output_dir}")
    log(f"Manifest: {manifest_path}")
    return total_generated


def main(argv=None):
    import argparse
    default_out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'data')
    parser = argparse.ArgumentParser(description='Generate electron density puzzle data for the density guessing game')
    parser.add_argument('--out', default=default_out,
                        help='Output directory for puzzle JSON files (default: web/data/)')
    parser.add_argument('--amino-acids', nargs='+', default=None,
                        help='Only generate puzzles for these amino acids (e.g., TRP PHE TYR)')
    parser.add_argument('--max-rotamers', type=int, default=0,
                        help='Maximum rotamers per amino acid (0 = use all in library)')
    args = parser.parse_args(argv)
    try:
        run(args.out, args.amino_acids, args.max_rotamers)
    except GenerationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
