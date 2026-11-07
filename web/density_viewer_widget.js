/**
 * Minimal density viewer widget — extracted from density_game.js.
 * Renders pre-computed isosurface meshes at multiple resolution levels.
 *
 * Usage:
 *   const viewer = new DensityViewer(containerEl);
 *   await viewer.loadPuzzle(puzzleData);
 *   viewer.setResolution('2.0');
 */

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

const RESOLUTION_STEPS = ['3.5', '2.5', '2.0', '1.5', '1.0'];
const DENSITY_COLOR_TARGET = new THREE.Color(0x4488cc);
const DENSITY_COLOR_FLANK = new THREE.Color(0x334455);

// CPK element colors for ball-and-stick reveal
const CPK_COLORS = {
    C: 0x909090, N: 0x3050F8, O: 0xFF0D0D, S: 0xFFFF30, H: 0xFFFFFF,
};

// Same flank look as density_game.js's reveal: a weaker grey glow, visible from any side but secondary.
const FLANK_COLOR = 0x999999;
const flankMaterial = () => new THREE.MeshStandardMaterial({
    color: FLANK_COLOR, emissive: FLANK_COLOR, emissiveIntensity: 0.3, roughness: 0.6,
    transparent: true, opacity: 0.7, depthWrite: false,
});

// Backbone hint constants
const BACKBONE_ATOMS = new Set(['N', 'CA', 'C', 'O']);
const HINT_COLOR = 0x00cccc;
const HINT_FLANK_COLOR = 0x007777;

export class DensityViewer {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.densityMeshes = {};
        this.revealMeshes = [];
        this.animFrameId = null;
        this.currentResIndex = 0;
        this.hintMeshes = [];
        this._onResize = this._handleResize.bind(this);
        this._setupScene();
    }

    _getSize() {
        const rect = this.container.getBoundingClientRect();
        return {
            w: rect.width || 400,
            h: Math.max(rect.height, 300),
        };
    }

    _setupScene() {
        const { w, h } = this._getSize();
        const canvas = this.container.querySelector('canvas');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        const aspect = w / h;
        const frustum = 15;
        this.camera = new THREE.OrthographicCamera(
            -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200
        );
        this.camera.position.set(0, 0, 40);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(w, h, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 2.0;
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.dynamicDampingFactor = 0.1;

        // Lighting
        this.scene.add(new THREE.AmbientLight(0x404040, 1.5));
        const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
        dir1.position.set(5, 10, 7);
        this.scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0x8888ff, 0.5);
        dir2.position.set(-5, -5, -5);
        this.scene.add(dir2);

        this._animate();
        window.addEventListener('resize', this._onResize);

        // Pause animation when tab is hidden to save CPU/memory
        this._onVisibilityChange = () => {
            if (document.hidden) {
                if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            } else {
                if (!this.animFrameId) this._animate();
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    _animate() {
        this.animFrameId = requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _handleResize() {
        const { w, h } = this._getSize();
        const aspect = w / h;
        const vSize = (this.camera.top - this.camera.bottom) / 2;
        this.camera.top = vSize;
        this.camera.bottom = -vSize;
        this.camera.left = -vSize * aspect;
        this.camera.right = vSize * aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        if (this.controls) this.controls.handleResize();
    }

    _clearMeshes() {
        Object.values(this.densityMeshes).forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.densityMeshes = {};

        this.revealMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.revealMeshes = [];

        this.clearHintMeshes();
    }

    _buildDensityMeshes(puzzle) {
        const atoms = puzzle.atoms;
        const atomPos = atoms.map(a => [a.x, a.y, a.z]);
        const atomIsTarget = atoms.map(a => a.residue_id === 'target');

        for (const resKey of RESOLUTION_STEPS) {
            const meshData = puzzle.meshes[resKey];
            if (!meshData || meshData.v.length === 0) continue;

            const geom = new THREE.BufferGeometry();
            const vertices = new Float32Array(meshData.v);
            const normals = new Float32Array(meshData.n);

            // Per-vertex Voronoi coloring
            const numVerts = vertices.length / 3;
            const colors = new Float32Array(numVerts * 3);
            const tmpColor = new THREE.Color();
            for (let i = 0; i < numVerts; i++) {
                const vx = vertices[i * 3], vy = vertices[i * 3 + 1], vz = vertices[i * 3 + 2];
                let minTarget = Infinity, minFlank = Infinity;
                for (let j = 0; j < atoms.length; j++) {
                    const dx = vx - atomPos[j][0], dy = vy - atomPos[j][1], dz = vz - atomPos[j][2];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (atomIsTarget[j]) { if (d2 < minTarget) minTarget = d2; }
                    else { if (d2 < minFlank) minFlank = d2; }
                }
                const diff = Math.sqrt(minTarget) - Math.sqrt(minFlank);
                const t = Math.min(1, Math.max(0, diff * 0.5 + 0.5));
                tmpColor.copy(DENSITY_COLOR_TARGET).lerp(DENSITY_COLOR_FLANK, t);
                colors[i * 3] = tmpColor.r;
                colors[i * 3 + 1] = tmpColor.g;
                colors[i * 3 + 2] = tmpColor.b;
            }

            geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geom.setIndex(meshData.f);
            geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const mat = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.densityMeshes[resKey] = mesh;
        }
    }

    _fitCamera() {
        const box = new THREE.Box3();
        Object.values(this.densityMeshes).forEach(mesh => {
            if (mesh.visible) box.expandByObject(mesh);
        });
        if (box.isEmpty()) {
            // Use first available mesh
            const first = Object.values(this.densityMeshes)[0];
            if (first) box.expandByObject(first);
        }
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const { w, h } = this._getSize();
        const aspect = w / h;
        const halfV = (maxDim / 2) * 1.3;
        this.camera.top = halfV;
        this.camera.bottom = -halfV;
        this.camera.left = -halfV * aspect;
        this.camera.right = halfV * aspect;
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 40;
        this.camera.position.set(
            center.x + r * Math.sin(phi) * Math.cos(theta),
            center.y + r * Math.sin(phi) * Math.sin(theta),
            center.z + r * Math.cos(phi)
        );
        this.camera.up.set(0, 1, 0);
        this.controls.update();
    }

    /**
     * Load a puzzle and build meshes. Shows the first resolution by default.
     */
    async loadPuzzle(puzzleData) {
        this._clearMeshes();
        this._buildDensityMeshes(puzzleData);
        this.currentResIndex = 0;
        this.setResolution(RESOLUTION_STEPS[0]);
        this._fitCamera();
        this._puzzle = puzzleData;
    }

    /**
     * Show density at a given resolution step ('3.5', '2.5', '2.0', '1.5', '1.0').
     */
    setResolution(resKey) {
        Object.entries(this.densityMeshes).forEach(([key, mesh]) => {
            mesh.visible = (key === resKey);
        });
        this.currentResIndex = RESOLUTION_STEPS.indexOf(resKey);
    }

    /**
     * Advance to the next finer resolution. Returns the new resolution key, or null if already at finest.
     */
    improveResolution() {
        if (this.currentResIndex >= RESOLUTION_STEPS.length - 1) return null;
        this.currentResIndex++;
        const resKey = RESOLUTION_STEPS[this.currentResIndex];
        this.setResolution(resKey);
        return resKey;
    }

    /**
     * Get the current resolution key.
     */
    getResolution() {
        return RESOLUTION_STEPS[this.currentResIndex];
    }

    /**
     * Whether we can still improve resolution.
     */
    canImprove() {
        return this.currentResIndex < RESOLUTION_STEPS.length - 1;
    }

    /**
     * Show ball-and-stick model for the target residue (after reveal).
     */
    showBallAndStick() {
        if (!this._puzzle) return;
        const atoms = this._puzzle.atoms;
        const bonds = this._puzzle.bonds || [];

        for (const atom of atoms) {
            const isTarget = atom.residue_id === 'target';
            const radius = isTarget ? 0.3 : 0.15;

            const geom = new THREE.SphereGeometry(radius, 12, 8);
            let mat;
            if (isTarget) {
                const baseColor = CPK_COLORS[atom.element] || 0x909090;
                mat = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    emissive: baseColor,
                    emissiveIntensity: 0.45,
                    roughness: 0.4,
                    metalness: 0.1,
                });
            } else {
                mat = flankMaterial();
            }
            const sphere = new THREE.Mesh(geom, mat);
            sphere.position.set(atom.x, atom.y, atom.z);
            this.scene.add(sphere);
            this.revealMeshes.push(sphere);
        }

        for (const [i, j] of bonds) {
            if (i >= atoms.length || j >= atoms.length) continue;
            const a1 = atoms[i], a2 = atoms[j];
            const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
            const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const len = dir.length();
            dir.normalize();

            const isTarget = a1.residue_id === 'target' && a2.residue_id === 'target';

            const geom = new THREE.CylinderGeometry(0.06, 0.06, len, 6);
            let mat;
            if (isTarget) {
                mat = new THREE.MeshStandardMaterial({
                    color: 0x00cccc,
                    emissive: 0x00cccc,
                    emissiveIntensity: 0.35,
                    roughness: 0.4,
                    metalness: 0.1,
                });
            } else {
                mat = flankMaterial();
            }
            const cyl = new THREE.Mesh(geom, mat);
            cyl.position.copy(mid);
            const axis = new THREE.Vector3(0, 1, 0);
            cyl.quaternion.setFromUnitVectors(axis, dir);
            this.scene.add(cyl);
            this.revealMeshes.push(cyl);
        }
    }

    /**
     * Get the correct amino acid for the current puzzle.
     */
    getAnswer() {
        return this._puzzle ? this._puzzle.amino_acid : null;
    }

    /**
     * Get the full amino acid name.
     */
    getAnswerName() {
        return this._puzzle ? this._puzzle.amino_acid_name : null;
    }

    /**
     * Show backbone hint overlay at the given level.
     * Level 0 = none, 1 = CA only, 2 = full backbone (N, CA, C, O + bonds).
     */
    showBackboneHint(level) {
        this.clearHintMeshes();
        if (level === 0 || !this._puzzle) return;

        const { atomIndices, bonds } = this._getBackboneSubset(level);
        const atoms = this._puzzle.atoms;

        // Atom spheres
        for (const idx of atomIndices) {
            const a = atoms[idx];
            const isFlank = a.residue_id === 'flank';
            const color = isFlank ? HINT_FLANK_COLOR : HINT_COLOR;

            const geom = new THREE.SphereGeometry(0.25, 12, 8);
            const mat = new THREE.MeshPhongMaterial({
                color,
                transparent: true,
                opacity: isFlank ? 0.4 : 0.6,
                depthWrite: false,
                emissive: color,
                emissiveIntensity: 0.5,
            });
            const sphere = new THREE.Mesh(geom, mat);
            sphere.position.set(a.x, a.y, a.z);
            this.scene.add(sphere);
            this.hintMeshes.push(sphere);
        }

        // Bond cylinders (level 2 only)
        for (const [i, j] of bonds) {
            const a1 = atoms[i];
            const a2 = atoms[j];
            const isFlank = a1.residue_id === 'flank' && a2.residue_id === 'flank';
            const color = isFlank ? HINT_FLANK_COLOR : HINT_COLOR;

            const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
            const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
            const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const len = dir.length();
            if (len < 0.001) continue;

            const geom = new THREE.CylinderGeometry(0.04, 0.04, len, 6);
            const mat = new THREE.MeshPhongMaterial({
                color,
                transparent: true,
                opacity: isFlank ? 0.3 : 0.5,
                depthWrite: false,
                emissive: color,
                emissiveIntensity: 0.4,
            });
            const cyl = new THREE.Mesh(geom, mat);
            cyl.position.copy(mid);
            cyl.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                dir.normalize()
            );
            this.scene.add(cyl);
            this.hintMeshes.push(cyl);
        }
    }

    clearHintMeshes() {
        this.hintMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.hintMeshes = [];
    }

    _getBackboneSubset(level) {
        const atoms = this._puzzle.atoms;
        const atomIndices = [];
        for (let i = 0; i < atoms.length; i++) {
            const a = atoms[i];
            if (level === 1) {
                if (a.name === 'CA') atomIndices.push(i);
            } else {
                if (BACKBONE_ATOMS.has(a.name)) atomIndices.push(i);
            }
        }

        const indexSet = new Set(atomIndices);
        const bonds = [];
        if (level >= 2) {
            for (const [i, j] of this._puzzle.bonds) {
                if (indexSet.has(i) && indexSet.has(j)) bonds.push([i, j]);
            }
        }

        return { atomIndices, bonds };
    }

    dispose() {
        document.removeEventListener('visibilitychange', this._onVisibilityChange);
        window.removeEventListener('resize', this._onResize);
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        this._clearMeshes();
        if (this.renderer) this.renderer.dispose();
        if (this.controls) this.controls.dispose();
    }
}

export { RESOLUTION_STEPS };
