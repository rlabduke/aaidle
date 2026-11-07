# Summary

## 2026-11-07

- Ported the puzzle generator to a plain cctbx script (generator/generate_density_puzzles.py with pro_ring, Top8000 table and CSVs) and its 16 tests; output is byte-identical to web/data. Console hint now names the new command.
- Added standalone web/index.html (game markup between aaidle:game-body markers, import map for vendored three.js), web/game.css, and page tests for markers, Django-free markup and element ids.
- Initial import of the AA.ID.LE web modules, vendored three.js, puzzle data and node tests from molprobity-next and the iOS app. Added fetch_ok.js (status 0 counts as loaded) and a warm-up ID guard test.
