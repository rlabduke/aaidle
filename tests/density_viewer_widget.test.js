import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DensityViewer } from '../web/density_viewer_widget.js';

function reveal() {
    const viewer = { scene: new THREE.Scene(), revealMeshes: [], _puzzle: {
        atoms: [
            { element: 'C', x: 0, y: 0, z: 0, residue_id: 'flank' },
            { element: 'N', x: 1.3, y: 0, z: 0, residue_id: 'target' },
            { element: 'C', x: 2.8, y: 0, z: 0, residue_id: 'target' },
        ],
        bonds: [[0, 1], [1, 2]],
    } };
    DensityViewer.prototype.showBallAndStick.call(viewer);
    return viewer.revealMeshes;
}

function assertFlankGlow(mat) {
    assert.ok(mat.isMeshStandardMaterial);
    assert.equal(mat.color.getHex(), 0x999999);
    assert.equal(mat.emissive.getHex(), 0x999999);
    assert.equal(mat.emissiveIntensity, 0.3);
    assert.equal(mat.opacity, 0.7);
    assert.equal(mat.transparent, true);
    assert.equal(mat.depthWrite, false);
}

test('flank atoms get the same soft grey glow as the game reveal', () => {
    assertFlankGlow(reveal()[0].material);
});

test('bonds touching a flank get the flank glow; target bonds stay cyan', () => {
    const [, , , peptideBond, targetBond] = reveal();
    assertFlankGlow(peptideBond.material);
    assert.equal(targetBond.material.color.getHex(), 0x00cccc);
    assert.equal(targetBond.material.emissiveIntensity, 0.35);
});

test('target atoms keep their CPK glow', () => {
    const mat = reveal()[1].material;
    assert.equal(mat.emissive.getHex(), mat.color.getHex());
    assert.equal(mat.emissiveIntensity, 0.45);
});
