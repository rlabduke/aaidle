// Puzzle choice: amino acid uniformly, then rotamer in proportion to its Top8000 frequency.
// Each function takes one uniform `rand` in [0, 1) so Daily can pass its date-seeded draw.

export function weightedIndex(weights, rand) {
    const clean = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
    const total = clean.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.min(weights.length - 1, Math.floor(rand * weights.length));
    const target = rand * total;
    let cumulative = 0;
    let last = 0;
    for (let i = 0; i < clean.length; i++) {
        if (clean[i] === 0) continue;
        cumulative += clean[i];
        last = i;
        if (target < cumulative) return i;
    }
    return last;
}

// Entries without `frequency` (an older manifest) count as 1.
export function pickRotamer(puzzles, rand) {
    const weights = puzzles.map(p => (Number.isFinite(p.frequency) ? p.frequency : 1));
    return puzzles[weightedIndex(weights, rand)];
}

export function pickAminoAcid(codes, previous, rand) {
    const others = codes.filter(c => c !== previous);
    const pool = others.length > 0 ? others : codes;
    return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))];
}
