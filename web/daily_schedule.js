// Daily answer schedule: one amino acid per calendar date, the same for every player.

export const AMINO_ACID_COUNT = 20;
// No answer comes back within this many days.
export const COOLDOWN_DAYS = 6;

const START = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

// Seeded PRNG (mulberry32)
export function mulberry32(seed) {
    return function() {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Whole days from 2026-01-01 to a 'YYYY-MM-DD' calendar date, immune to DST.
export function dayNumber(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - START) / DAY_MS);
}

// Index into the 20 amino acids for a date: a date-seeded draw among those not used in the
// previous COOLDOWN_DAYS days, replayed from the start so every player gets the same answer.
export function dailyAminoAcidIndex(dateString) {
    const last = Math.max(0, dayNumber(dateString));
    const recent = [];
    let pick = 0;
    for (let n = 0; n <= last; n++) {
        const open = [];
        for (let i = 0; i < AMINO_ACID_COUNT; i++) {
            if (!recent.includes(i)) open.push(i);
        }
        pick = open[Math.floor(mulberry32(n * 7919 + 271828)() * open.length)];
        recent.push(pick);
        if (recent.length > COOLDOWN_DAYS) recent.shift();
    }
    return pick;
}
