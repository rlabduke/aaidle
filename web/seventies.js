// 1970s-mode renderers: stacked contour sheets and Kendrew brass models.
// Builders read only their arguments and the hole-map cache, so other viewers can reuse them.
import * as THREE from 'three';
import {
    kendrewParts, assignPieces, bondsByDistance, ROD_RADIUS, BALL_RADIUS, SLEEVE_RADIUS, SLEEVE_LENGTH, HOLE_RADIUS, GROOVE, KNOB_RADIUS,
} from './kendrew_pieces.js';

const SEVENTIES_NUM_PLANES = 20;
const SEVENTIES_TEXTURE_SIZE = 512;
// Black ink only: the target stands out by weight, which survives the haze and greyscale.
export const SEVENTIES_LINE_COLOR = '#0F0A04';       // near-black ink for target contour lines
export const SEVENTIES_FLANK_COLOR = '#857760';      // warm grey for flanking residue contours
const SEVENTIES_LINE_WIDTH = 5;                      // texture px, of SEVENTIES_TEXTURE_SIZE
const SEVENTIES_FLANK_WIDTH = 2.5;
const SEVENTIES_BLEND_STEPS = 6;                     // stroke batches per sheet across the blend
// Each sheet's tint covers every sheet behind it, so the back line keeps 0.96^19 = 46% of its contrast.
const SEVENTIES_SHEET_TINT = 'rgba(245, 240, 224, 0.04)';
export const SEVENTIES_BG_COLOR = 0xF5F0E0;          // warm cream for scene background
export const SEVENTIES_BOX_COLOR = 0xC8B88A;         // warm tan for wireframe box

function sliceIsosurface(vertices, indices, zPlanes) {
    // For each z-plane, find line segments where triangles cross the plane
    const slices = zPlanes.map(z => ({ z, segments: [] }));
    const numTris = indices.length / 3;
    for (let si = 0; si < zPlanes.length; si++) {
        const zk = zPlanes[si];
        const segs = slices[si].segments;
        for (let t = 0; t < numTris; t++) {
            const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
            const z0 = vertices[i0 * 3 + 2], z1 = vertices[i1 * 3 + 2], z2 = vertices[i2 * 3 + 2];
            const a0 = z0 >= zk, a1 = z1 >= zk, a2 = z2 >= zk;
            // Skip if all on same side
            if (a0 === a1 && a1 === a2) continue;
            const pts = [];
            // Check each edge for crossing
            const edges = [[i0, i1, z0, z1, a0, a1], [i1, i2, z1, z2, a1, a2], [i2, i0, z2, z0, a2, a0]];
            for (const [ia, ib, za, zb, aa, ab] of edges) {
                if (aa === ab) continue;
                const t_val = (zk - za) / (zb - za);
                pts.push([
                    vertices[ia * 3]     + t_val * (vertices[ib * 3]     - vertices[ia * 3]),
                    vertices[ia * 3 + 1] + t_val * (vertices[ib * 3 + 1] - vertices[ia * 3 + 1]),
                ]);
                if (pts.length === 2) break;
            }
            if (pts.length === 2) {
                segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
            }
        }
    }
    return slices;
}

// 1 near target atoms, 0 near flank atoms, blended over the same ±1 Å zone as the modern view's colours.
export function targetWeight(x, y, z, atomPos, atomIsTarget) {
    let minTarget = Infinity, minFlank = Infinity;
    for (let j = 0; j < atomPos.length; j++) {
        const dx = x - atomPos[j][0], dy = y - atomPos[j][1], dz = z - atomPos[j][2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (atomIsTarget[j]) {
            if (d2 < minTarget) minTarget = d2;
        } else if (d2 < minFlank) {
            minFlank = d2;
        }
    }
    const diff = Math.sqrt(minTarget) - Math.sqrt(minFlank);
    return 1 - Math.min(1, Math.max(0, diff * 0.5 + 0.5));
}

function mixHex(a, b, t) {
    const ca = parseInt(a.slice(1), 16), cb = parseInt(b.slice(1), 16);
    const ch = shift => Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t);
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function buildSliceTexture(segments, z, bounds, textureSize, atomPos, atomIsTarget) {
    const canvas = document.createElement('canvas');
    canvas.width = textureSize;
    canvas.height = textureSize;
    const ctx = canvas.getContext('2d');

    // Semi-transparent warm cream background (the "plastic" sheet)
    ctx.fillStyle = SEVENTIES_SHEET_TINT;
    ctx.fillRect(0, 0, textureSize, textureSize);

    const xRange = bounds.maxX - bounds.minX;
    const yRange = bounds.maxY - bounds.minY;
    const range = Math.max(xRange, yRange) * 1.1; // 10% margin
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    function toPixel(wx, wy) {
        return [
            ((wx - cx) / range + 0.5) * textureSize,
            (1 - ((wy - cy) / range + 0.5)) * textureSize, // flip Y
        ];
    }

    ctx.lineCap = 'round';
    const steps = Array.from({ length: SEVENTIES_BLEND_STEPS + 1 }, () => []);
    for (const seg of segments) {
        const w = targetWeight((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2, z, atomPos, atomIsTarget);
        steps[Math.round(w * SEVENTIES_BLEND_STEPS)].push(seg);
    }
    // Lightest first, so the target's heavier line wins where lines cross.
    steps.forEach((segs, k) => {
        if (segs.length === 0) return;
        const t = k / SEVENTIES_BLEND_STEPS;
        ctx.strokeStyle = mixHex(SEVENTIES_FLANK_COLOR, SEVENTIES_LINE_COLOR, t);
        ctx.lineWidth = SEVENTIES_FLANK_WIDTH + t * (SEVENTIES_LINE_WIDTH - SEVENTIES_FLANK_WIDTH);
        ctx.beginPath();
        for (const seg of segs) {
            const [px0, py0] = toPixel(seg[0], seg[1]);
            const [px1, py1] = toPixel(seg[2], seg[3]);
            ctx.moveTo(px0, py0);
            ctx.lineTo(px1, py1);
        }
        ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// meshes: resKey -> {v, f}; isTarget: boolean array parallel to atoms.
// Returns a Group of `seventies_<resKey>` sub-groups, all hidden.
export function buildContourSheets(meshes, atoms, isTarget, resKeys) {
    const atomPos = atoms.map(a => [a.x, a.y, a.z]);
    const root = new THREE.Group();
    root.name = 'seventies_root';

    for (const resKey of resKeys) {
        const meshData = meshes[resKey];
        if (!meshData || meshData.v.length === 0) continue;

        const vertices = meshData.v;
        const indices = meshData.f;

        // Compute bounding box from vertices
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        const bounds = { minX, maxX, minY, maxY };
        const zMargin = (maxZ - minZ) * 0.05;
        const zPlanes = [];
        for (let i = 0; i < SEVENTIES_NUM_PLANES; i++) {
            zPlanes.push(minZ + zMargin + (i / (SEVENTIES_NUM_PLANES - 1)) * (maxZ - minZ - 2 * zMargin));
        }

        const slices = sliceIsosurface(vertices, indices, zPlanes);

        const subGroup = new THREE.Group();
        subGroup.name = `seventies_${resKey}`;

        // Quad size covers XY extent with margin
        const xyRange = Math.max(maxX - minX, maxY - minY) * 1.1;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        for (const slice of slices) {
            if (slice.segments.length === 0) continue;
            const texture = buildSliceTexture(slice.segments, slice.z, bounds, SEVENTIES_TEXTURE_SIZE, atomPos, isTarget);
            const planeGeom = new THREE.PlaneGeometry(xyRange, xyRange);
            const planeMat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const quad = new THREE.Mesh(planeGeom, planeMat);
            quad.position.set(centerX, centerY, slice.z);
            subGroup.add(quad);
        }

        // Wireframe enclosure box
        const boxW = maxX - minX, boxH = maxY - minY, boxD = maxZ - minZ;
        const boxGeom = new THREE.BoxGeometry(boxW * 1.05, boxH * 1.05, boxD * 1.05);
        const edgesGeom = new THREE.EdgesGeometry(boxGeom);
        const edgesMat = new THREE.LineBasicMaterial({ color: SEVENTIES_BOX_COLOR });
        const wireBox = new THREE.LineSegments(edgesGeom, edgesMat);
        wireBox.position.set(centerX, centerY, (minZ + maxZ) / 2);
        subGroup.add(wireBox);

        subGroup.visible = false;
        root.add(subGroup);
    }

    return root;
}

export function disposeGroup(group) {
    group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    });
}

// Kendrew brass models: soldered pieces of brass rod, joined by aluminium sleeves.
const KENDREW_PAINT = { brass: 0xD4AA44, N: 0x4488DD, O: 0xEE4444, S: 0xEEDD44 };
const SLEEVE_COLORS = { outer: 0xB4B8BC, bore: 0x80848A, wall: 0x6C7076, end: 0xA4A8AC };
const BORE_RADIUS = 1.15 * ROD_RADIUS;
const WALL_LENGTH = SLEEVE_RADIUS - 0.8 * BORE_RADIUS;
const SCREW_HEIGHT = 0.55 * SLEEVE_RADIUS;
const HINT_TARGET_OPACITY = 0.55;
const HINT_FLANK_OPACITY = 0.25;
const UP = new THREE.Vector3(0, 1, 0);

// Alpha map for a sleeve wall of radius r: cross-holes at u = 0 and 0.5, which
// CylinderGeometry puts on local +z and -z.
const holeMaps = new Map();
function holeMap(r) {
    if (holeMaps.has(r)) return holeMaps.get(r);
    const W = 512, H = 128, C = 2 * Math.PI * r, data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const z = ((y + 0.5) / H - 0.5) * SLEEVE_LENGTH;
        const s = ((x + 0.5) / W) * C;
        const ds = Math.min(s, Math.abs(s - C / 2), C - s);
        const v = ds * ds + z * z < HOLE_RADIUS * HOLE_RADIUS ? 0 : 255;
        const k = (y * W + x) * 4;
        data[k] = data[k + 1] = data[k + 2] = v;
        data[k + 3] = 255;
    }
    const t = new THREE.DataTexture(data, W, H);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    holeMaps.set(r, t);
    return t;
}

function kendrewMaterials(opacity) {
    const fade = opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {};
    // The alpha test runs on opacity times the hole map, so it must sit below a faded opacity.
    const holes = r => ({ alphaMap: holeMap(r), alphaTest: 0.5 * opacity, side: THREE.DoubleSide });
    const phong = (color, shininess, emissive, extra = {}) => new THREE.MeshPhongMaterial({
        color, specular: 0xCCAA66, shininess, emissive: color, emissiveIntensity: emissive, ...fade, ...extra,
    });
    const metal = (color, emissive, extra) => phong(color, 25, emissive, { specular: 0x666666, ...extra });
    const rod = Object.fromEntries(Object.entries(KENDREW_PAINT)
        .map(([k, c]) => [k, k === 'brass' ? phong(c, 120, 0.45) : phong(c, 60, 0.45)]));
    return {
        rod,
        outer: metal(SLEEVE_COLORS.outer, 0.3, holes(SLEEVE_RADIUS)),
        bore: metal(SLEEVE_COLORS.bore, 0.15, holes(BORE_RADIUS)),
        wall: metal(SLEEVE_COLORS.wall, 0.1, { side: THREE.DoubleSide }),
        end: metal(SLEEVE_COLORS.end, 0.25, { side: THREE.DoubleSide }),
        screw: new THREE.MeshPhongMaterial({ color: 0x1E1E22, specular: 0x555555, shininess: 40, ...fade }),
        socket: new THREE.MeshBasicMaterial({ color: 0x141414, ...fade }),
    };
}

function kendrewGeometries() {
    return {
        cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
        sph: new THREE.SphereGeometry(1, 12, 8),
        outer: new THREE.CylinderGeometry(SLEEVE_RADIUS, SLEEVE_RADIUS, SLEEVE_LENGTH, 48, 1, true),
        bore: new THREE.CylinderGeometry(BORE_RADIUS, BORE_RADIUS, SLEEVE_LENGTH, 24, 1, true),
        end: new THREE.RingGeometry(BORE_RADIUS, SLEEVE_RADIUS, 48),
        wall: new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, WALL_LENGTH, 20, 1, true),
        head: new THREE.CylinderGeometry(0.36 * SLEEVE_RADIUS, 0.36 * SLEEVE_RADIUS, SCREW_HEIGHT, 6),
        socket: new THREE.CircleGeometry(0.15 * SLEEVE_RADIUS, 6),
    };
}

// Draws a kendrewParts() list as a flat Group of Meshes. `materialsFor(atoms)`
// gives the material set for a part from the atom indices it belongs to.
function drawParts(parts, materialsFor) {
    const wearOf = paint => (paint === 'brass' ? 'brass' : 'paint');
    const group = new THREE.Group();
    const geo = kendrewGeometries();
    const v3 = p => new THREE.Vector3(p[0], p[1], p[2]);

    const add = (mesh, userData) => { Object.assign(mesh.userData, userData); group.add(mesh); return mesh; };
    function rod(a, b, radius, mat, userData) {
        const d = new THREE.Vector3().subVectors(b, a);
        const len = d.length();
        if (len < 1e-6) return;
        const m = new THREE.Mesh(geo.cyl, mat);
        m.scale.set(radius, len, radius);
        m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
        add(m, userData);
    }
    function ball(at, radius, mat, userData, name = '') {
        const m = new THREE.Mesh(geo.sph, mat);
        m.scale.setScalar(radius);
        m.position.copy(at);
        m.name = name;
        add(m, userData);
    }

    for (const r of parts.rods) {
        rod(v3(r.a), v3(r.b), ROD_RADIUS, materialsFor([r.atom]).rod[r.paint], { atom: r.atom, kind: r.kind, wear: wearOf(r.paint) });
    }
    for (const b of parts.balls) {
        ball(v3(b.at), BALL_RADIUS, materialsFor([b.atom]).rod[b.paint], { atom: b.atom, wear: wearOf(b.paint) });
    }
    // A rod end that fits a sleeve: a groove, then a rounded knob.
    for (const t of parts.tips) {
        const brass = materialsFor([t.atom]).rod.brass;
        const end = v3(t.end), dir = v3(t.dir);
        const at = back => end.clone().addScaledVector(dir, -back);
        const userData = { atom: t.atom, wear: 'brass' };
        rod(at(GROOVE.from), at(GROOVE.to), GROOVE.radius, brass, userData);
        rod(at(GROOVE.to), at(0.5 * ROD_RADIUS), KNOB_RADIUS, brass, userData);
        ball(at(0.5 * ROD_RADIUS), KNOB_RADIUS, brass, userData, 'knob');
    }

    // Each sleeve is built in its local frame (axis y, cross-hole along z, set
    // screws along +x) and then attached to the group with its world transform.
    const frame = new THREE.Group();
    const basis = new THREE.Matrix4();
    for (const s of parts.sleeves) {
        const mats = materialsFor(s.atoms);
        const local = [];
        const part = (geometry, mat, name = '', wear) => {
            const m = new THREE.Mesh(geometry, mat);
            m.name = name;
            if (wear) m.userData.wear = wear;
            local.push(m);
            return m;
        };
        part(geo.outer, mats.outer, 'sleeve', 'sleeve');
        part(geo.bore, mats.bore, '', 'sleeve');
        for (const e of [-1, 1]) {
            const cap = part(geo.end, mats.end, '', 'sleeve');
            cap.rotation.x = -Math.PI / 2;
            cap.position.y = e * SLEEVE_LENGTH / 2;
            const wall = part(geo.wall, mats.wall, '', 'sleeve');
            wall.rotation.x = Math.PI / 2;
            wall.position.z = e * (0.8 * BORE_RADIUS + WALL_LENGTH / 2);
        }
        for (const e of [-1, 1]) {
            const head = part(geo.head, mats.screw, 'screw');
            head.rotation.z = -Math.PI / 2;
            head.position.set(SLEEVE_RADIUS + SCREW_HEIGHT / 2 - 0.01, e * SLEEVE_LENGTH / 4, 0);
            const socket = part(geo.socket, mats.socket);
            socket.rotation.y = Math.PI / 2;
            socket.position.set(SLEEVE_RADIUS + SCREW_HEIGHT + 0.002, e * SLEEVE_LENGTH / 4, 0);
        }
        const x = v3(s.side), y = v3(s.axis);
        frame.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
        frame.position.copy(v3(s.mid));
        frame.add(...local);
        frame.updateMatrixWorld(true);
        for (const m of local) {
            group.attach(m);
            m.userData.atoms = [...s.atoms];
        }
    }
    return group;
}

// One material set per opacity, so meshes of a build share their materials.
function materialCache(opacityOf) {
    const sets = new Map();
    return atoms => {
        const opacity = opacityOf(atoms);
        if (!sets.has(opacity)) sets.set(opacity, kendrewMaterials(opacity));
        return sets.get(opacity);
    };
}

// The 1970 reveal model of `include` (default all atoms), with `bonds` as the topology.
export function buildKendrewModel(atoms, bonds, include) {
    const parts = kendrewParts(atoms, bonds, { include });
    const group = drawParts(parts, materialCache(() => 1));
    group.userData.piece = assignPieces(parts.atoms, parts.bonds).piece;
    return group;
}

// Faded Kendrew hint of atomIndices; target parts fade less than flanks and added end atoms.
export function buildKendrewHint(atoms, atomIndices, bonds, caOnly) {
    // The hint finds the topology itself, so `bonds` and `caOnly` are not read.
    const parts = kendrewParts(atoms, bondsByDistance(atoms), { include: atomIndices });
    const isTarget = i => atoms[i]?.residue_id === 'target';
    const group = drawParts(parts, materialCache(ids => (ids.every(isTarget) ? HINT_TARGET_OPACITY : HINT_FLANK_OPACITY)));
    // Draw after the translucent sheets, which otherwise fade every part of the hint behind them.
    group.children.forEach(mesh => { mesh.renderOrder = 1; });
    return group;
}

// Aged Kendrew models: faded, chipped paint and tarnished brass, swept in by a noise threshold.
const KENDREW_WEAR = {
    duration: 1000,
    fade: 0xD9D2C2,
    fadeMix: 0.38,
    tarnish: 0x8E6A34,
    verdigris: 0x5FA38A,
    grime: 0x5E5F5A,
    // Shininess pristine to aged; noise threshold at full wear (lower covers more) and scale in 1/Å.
    brass: { shine: [120, 45], threshold: 0.38, scale: 1.4 },
    paint: { shine: [60, 30], threshold: 0.64, scale: 7.0 },
    sleeve: { shine: [25, 12], threshold: 0.6, scale: 3.5 },
};
const WEAR_MODE = { brass: 0, paint: 1, sleeve: 2 };

const WEAR_GLSL = `
varying vec3 vWearPos;
varying float vWearY;
uniform float uWear, uMode, uSeed, uAmount, uThreshold, uScale, uGlow, uFadeMix;
uniform vec3 uBrass, uFade, uTarnish, uVerdigris, uGrime;
float wHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float wFbm(vec3 p) { return 0.55 * wNoise(p) + 0.3 * wNoise(p * 2.03 + 11.7) + 0.15 * wNoise(p * 4.01 + 3.1); }
`;

const WEAR_COLOR = `#include <color_fragment>
float wearSpec = 1.0;
{
    float w = uWear * uAmount;
    vec3 p = vWearPos * uScale + uSeed * 31.7;
    float n = wFbm(p);
    float t = mix(1.0, uThreshold, w);
    if (uMode < 0.5) {
        float spot = smoothstep(t, t + 0.03, n);
        vec3 stain = mix(uTarnish, uVerdigris, step(0.8, wNoise(p * 0.7 + 5.3)));
        diffuseColor.rgb = mix(diffuseColor.rgb, stain, spot);
        wearSpec = mix(1.0, 0.1, spot);
    } else if (uMode < 1.5) {
        diffuseColor.rgb = mix(diffuseColor.rgb, uFade, uFadeMix * w);
        // Hands wear the paint most near the rod ends (cylinder y runs -0.5 to 0.5).
        n += 0.12 * w * smoothstep(0.25, 0.5, abs(vWearY));
        diffuseColor.rgb = mix(diffuseColor.rgb, uBrass, smoothstep(t, t + 0.02, n));
    } else {
        float spot = smoothstep(t, t + 0.04, n);
        diffuseColor.rgb = mix(diffuseColor.rgb, uGrime, 0.8 * spot);
        wearSpec = mix(1.0, 0.3, spot);
    }
}`;

function wearHash(n) {
    n = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B);
    n ^= n >>> 13;
    n = Math.imul(n, 0xC2B2AE35);
    return (n ^ (n >>> 16)) >>> 0;
}

function wornMaterial(pristine, kind, seed, wear) {
    const m = pristine.clone();
    const c = KENDREW_WEAR[kind];
    const uniforms = {
        uWear: wear,
        uMode: { value: WEAR_MODE[kind] },
        uSeed: { value: (seed % 997) / 997 },
        uAmount: { value: 0.75 + 0.25 * ((seed >>> 10) % 100) / 100 },
        uThreshold: { value: c.threshold },
        uScale: { value: c.scale },
        uGlow: { value: pristine.emissiveIntensity },
        uBrass: { value: new THREE.Color(KENDREW_PAINT.brass) },
        uFade: { value: new THREE.Color(KENDREW_WEAR.fade) },
        uFadeMix: { value: KENDREW_WEAR.fadeMix },
        uTarnish: { value: new THREE.Color(KENDREW_WEAR.tarnish) },
        uVerdigris: { value: new THREE.Color(KENDREW_WEAR.verdigris) },
        uGrime: { value: new THREE.Color(KENDREW_WEAR.grime) },
    };
    m.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWearPos;\nvarying float vWearY;')
            .replace('#include <project_vertex>',
                '#include <project_vertex>\nvWearPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWearY = position.y;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${WEAR_GLSL}`)
            .replace('#include <color_fragment>', WEAR_COLOR)
            .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= wearSpec;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * uGlow;');
    };
    m.customProgramCacheKey = () => 'kendrew-wear';
    return m;
}

// Ages a buildKendrewModel() group's meshes and polishes them back. Each piece and sleeve wears in its own
// fixed pattern. Call before the group's meshes are moved elsewhere; dispose() restores the pristine materials.
export function kendrewWear(group) {
    const piece = group.userData.piece ?? [];
    const wear = { value: 0 };
    const worn = new Map();
    const users = [];
    for (const mesh of group.children) {
        const kind = mesh.userData.wear;
        if (!kind) continue;
        const { atom, atoms } = mesh.userData;
        const seed = atoms ? wearHash(7919 * (atoms[0] + 1) + atoms[1]) : wearHash((piece[atom] ?? atom) + 1);
        const key = `${mesh.material.uuid}|${seed}`;
        if (!worn.has(key)) worn.set(key, { material: wornMaterial(mesh.material, kind, seed, wear), kind });
        users.push([mesh, mesh.material, worn.get(key).material]);
    }
    let progress = 0, target = 0, last = null, frame = 0;
    const apply = () => {
        const e = progress * progress * (3 - 2 * progress);
        wear.value = e;
        for (const { material, kind } of worn.values()) {
            const [from, to] = KENDREW_WEAR[kind].shine;
            material.shininess = from + (to - from) * e;
        }
        for (const [mesh, pristine, aged] of users) mesh.material = progress > 0 ? aged : pristine;
    };
    const step = now => {
        progress = Math.min(1, Math.max(0, progress + Math.sign(target - progress) * (last === null ? 0 : now - last) / KENDREW_WEAR.duration));
        last = now;
        apply();
        frame = progress === target ? 0 : requestAnimationFrame(step);
        if (!frame) last = null;
    };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = null; };
    return {
        set(aged, { instant = false } = {}) {
            target = aged ? 1 : 0;
            if (instant) { stop(); progress = target; apply(); }
            else if (!frame && progress !== target) frame = requestAnimationFrame(step);
        },
        get progress() { return progress; },
        dispose() {
            stop();
            for (const [mesh, pristine] of users) mesh.material = pristine;
            for (const { material } of worn.values()) material.dispose();
        },
    };
}
