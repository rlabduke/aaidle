# Summary

## 2026-11-07

- Public; v1.0.2 archived on Zenodo. CITATION.cff and README cite the concept DOI 10.5281/zenodo.24043062.
- v1.0.2 (docs only): copyright year 2026; author line, Cite section and CITATION.cff; Node version in README and package.json engines; note on how the puzzles derive from the Top8000 values.
- v1.0.1: sync.py --check says when the clone is older than the synced copy (fetch tags) instead of suggesting a downgrade; leaderboard toggles work on the standalone page (click handler outside the markers).
- Added LICENSE (BSD-3) and README.md; tagged v1.0.0.
- Added tools/sync.py (site and app targets, VERSION.json with per-file sha256, --check against the newest tag) and tests/test_sync.py.
- Ported the puzzle generator to a plain cctbx script (generator/generate_density_puzzles.py with pro_ring, Top8000 table and CSVs) and its 16 tests; output is byte-identical to web/data. Console hint now names the new command.
- Added standalone web/index.html (game markup between aaidle:game-body markers, import map for vendored three.js), web/game.css, and page tests for markers, Django-free markup and element ids.
- Initial import of the AA.ID.LE web modules, vendored three.js, puzzle data and node tests from molprobity-next and the iOS app. Added fetch_ok.js (status 0 counts as loaded) and a warm-up ID guard test.
