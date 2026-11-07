// Solve time and the result-panel stats shared by the Daily and Word.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Active time: callers pause it while the page is hidden.
export function createSolveTimer(now = () => Date.now()) {
    let base = 0;
    let since = null;
    return {
        start() { if (since === null) since = now(); },
        pause() {
            if (since === null) return;
            base += now() - since;
            since = null;
        },
        reset(ms = 0) { base = ms; since = null; },
        elapsedMs() { return base + (since === null ? 0 : now() - since); },
        get running() { return since !== null; },
    };
}

export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const secs = Math.floor(ms / 1000);
    const pad = n => String(n).padStart(2, '0');
    const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function timeSummary(msList) {
    const t = msList.filter(ms => Number.isFinite(ms) && ms >= 0).sort((a, b) => a - b);
    if (t.length === 0) return null;
    const mid = t.length >> 1;
    return { best: t[0], median: t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2 };
}

// winCounts[i] is the number of wins with score firstScore + i.
export function distributionRows(winCounts, losses, firstScore) {
    return winCounts.map((count, i) => ({ label: String(firstScore + i), count }))
        .concat([{ label: 'X', count: losses }]);
}

export function distributionHtml(rows, highlightLabel) {
    const max = Math.max(1, ...rows.map(r => r.count));
    return rows.map(({ label, count }) => {
        const cls = ['dist-bar'];
        if (label === highlightLabel) cls.push('dist-bar-highlight');
        if (label === 'X') cls.push('dist-bar-loss');
        const pct = Math.max(8, Math.round(count / max * 100));
        return `<div class="dist-row"><span class="dist-label">${label}</span>`
            + `<div class="dist-bar-wrap"><div class="${cls.join(' ')}" style="width: ${pct}%">${count}</div></div></div>`;
    }).join('');
}

function shortDate(dateString) {
    const [, m, d] = dateString.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
}

// rows: { date: 'YYYY-MM-DD', won, score, ms }
export function historyHtml(rows, limit) {
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit).map(r =>
        `<div class="history-row ${r.won ? 'history-won' : 'history-lost'}">`
        + `<span class="history-date">${shortDate(r.date)}</span>`
        + `<span class="history-mark">${r.won ? '✓' : '✗'}</span>`
        + `<span class="history-score">${r.score}</span>`
        + `<span class="history-time">${formatDuration(r.ms)}</span></div>`).join('');
}

export function timesLine(todayMs, summary) {
    const parts = [];
    if (Number.isFinite(todayMs)) parts.push(`Today ${formatDuration(todayMs)}`);
    if (summary) parts.push(`Best ${formatDuration(summary.best)}`, `Median ${formatDuration(summary.median)}`);
    return parts.join(' · ');
}
