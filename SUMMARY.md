# Summary

## 2026-11-24

- v1.2.4 (docs only): both authors' ORCID iDs in CITATION.cff; Vincent B. Chen with his middle initial.
- v1.2.3 (docs only): Christopher J. Williams added as an author in CITATION.cff and the README (features and testing).
- v1.2.2 (docs only): CITATION.cff names this version, for the Zenodo archive; the game is identical to v1.2.1.
- v1.2.1: a finished Daily hides the amino-acid panel, so the map and result box get its space (the result box fits a phone without scrolling); the panel returns in Practice and Time Attack.

## 2026-11-09

- v1.2.0: puzzle maps fade to 70% amplitude at the resolution limit (generator `taper`), removing detached Fourier-ripple blips from 14 puzzles; all 138 regenerated, with tests that every mesh is one piece. On phones, result and game-over boxes centre between the HUD panels (`--hud-bottom`) and are more compact.

## 2026-11-07

- v1.1.0: `densitygame:roundresult` event per answered round (Practice, Time Attack) and per completed Daily, so a game left midway is still seen; README lists both events.
- Public; v1.0.2 archived on Zenodo. CITATION.cff and README cite the concept DOI 10.5281/zenodo.24043062.
- v1.0.2 (docs only): copyright year 2026; author line, Cite section and CITATION.cff; Node version in README and package.json engines; note on how the puzzles derive from the Top8000 values.
- v1.0.1: sync.py --check says when the clone is older than the synced copy (fetch tags) instead of suggesting a downgrade; leaderboard toggles work on the standalone page (click handler outside the markers).
- Added LICENSE (BSD-3) and README.md; tagged v1.0.0.
- Added tools/sync.py (site and app targets, VERSION.json with per-file sha256, --check against the newest tag) and tests/test_sync.py.
- Ported the puzzle generator to a plain cctbx script (generator/generate_density_puzzles.py with pro_ring, Top8000 table and CSVs) and its 16 tests; output is byte-identical to web/data. Console hint now names the new command.
- Added standalone web/index.html (game markup between aaidle:game-body markers, import map for vendored three.js), web/game.css, and page tests for markers, Django-free markup and element ids.
- Initial import of the AA.ID.LE web modules, vendored three.js, puzzle data and node tests from molprobity-next and the iOS app. Added fetch_ok.js (status 0 counts as loaded) and a warm-up ID guard test.
