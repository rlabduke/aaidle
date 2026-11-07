import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WARMUP_IDS = [
  'density_tyr_rot0', 'density_his_rot0', 'density_pro_rot0',
  'density_val_rot0', 'density_glu_rot0', 'density_asn_rot0',
];

test('the rebuilding-tutorial warm-up puzzles are in the manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../web/data/manifest.json', import.meta.url), 'utf8'));
  const ids = new Set(manifest.puzzles.map((p) => p.id));
  for (const id of WARMUP_IDS) assert.ok(ids.has(id), `${id} missing from manifest`);
});
