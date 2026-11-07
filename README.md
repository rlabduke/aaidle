# AA.ID.LE

AA.ID.LE is a browser game in which the player identifies an amino acid from its electron density. Puzzles are generated from the Top8000 rotamer library and rendered with three.js. This repository is the single source for the game; the MolProbity Next web service and the AA.ID.LE iOS app each carry a copy of `web/` taken from a tagged release.

## Play locally

    cd web && python3 -m http.server

Then open http://localhost:8000/.

## Tests

    npm test
    python3 -m unittest tests/test_sync.py

The generator tests need a Python with cctbx:

    python -m unittest tests/test_generator.py

## Regenerating puzzles

With a cctbx Python, from the repository root:

    python generator/generate_density_puzzles.py

Output goes to `web/data/` by default. See `--help` for `--out`, `--amino-acids` and `--max-rotamers`.

## Syncing into consumers

`tools/sync.py` copies a tagged release of `web/` into a consumer checkout and writes a `VERSION.json` with a sha256 for each file.

    python tools/sync.py site <molprobity-next checkout> --ref vX.Y.Z
    python tools/sync.py app <app checkout> --ref vX.Y.Z
    python tools/sync.py site <molprobity-next checkout> --check

`--check` reports whether a newer aaidle tag exists. It reads the clone's local tags, so run `git fetch --tags` first. The copies must never be edited in place; make changes here, tag a release and sync again.

## Credits

- Top8000 rotamer library, Richardson Lab, Duke University, CC BY 4.0. Central values are taken from rlabduke/reference_data (Top8000_rotamer_central_values) at commit cbe300663a2b.
- three.js r170, MIT license, vendored in `web/lib/three/`.

Developed under LBNL Subcontract 7825826 to Duke University.

## License

BSD 3-Clause; see `LICENSE`.
