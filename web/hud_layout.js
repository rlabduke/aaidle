// Chooses between the HUD layout (map with controls overlaid) and the side column, and glides between them.
// The host page may set <html data-hud-query="..."> for its own switch point; the website uses Bootstrap's
// lg breakpoint, which the default matches.

export const DEFAULT_HUD_QUERY = '(max-width: 991.98px), (orientation: portrait)';

export function hudQuery(doc) {
    return doc.documentElement.dataset.hudQuery || DEFAULT_HUD_QUERY;
}

export function switchLayout(win, apply) {
    const doc = win.document;
    if (typeof doc.startViewTransition === 'function'
        && !win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        doc.startViewTransition(apply);
    } else {
        apply();
    }
}

const installed = new WeakMap();
const forcedEarly = new WeakMap();

// Sets html.hud-layout now, then follows the query, calling onSwitch after each change. The class is set
// from the current state, so a transition interrupted by another still ends in the latest layout.
// The returned object's `matches` is the layout in force, including setHudForced.
export function installHudLayout(win, onSwitch) {
    const mql = win.matchMedia(hudQuery(win.document));
    const layout = { forced: forcedEarly.get(win) ?? false, get matches() { return this.forced || mql.matches; } };
    const set = () => win.document.documentElement.classList.toggle('hud-layout', layout.matches);
    const change = () => switchLayout(win, () => { set(); onSwitch(); });
    set();
    mql.addEventListener('change', () => { if (!layout.forced) change(); });
    installed.set(win, { layout, change });
    return layout;
}

// Lets a host page that has narrowed the game, such as the AA.ID.LE app beside its field guide, hold the HUD layout.
export function setHudForced(win, on) {
    const entry = installed.get(win);
    // A host that decides before the game installs its layout is honoured at install.
    if (!entry) { forcedEarly.set(win, on); return; }
    if (entry.layout.forced === on) return;
    const before = entry.layout.matches;
    entry.layout.forced = on;
    if (entry.layout.matches !== before) entry.change();
}

// How far each overlay panel reaches into the canvas, from DOMRect-like rects; a panel beside or clear of the canvas counts 0.
export function hudInsets(canvasRect, topRect, bottomRect) {
    const overlaps = r => r && r.left < canvasRect.right && r.right > canvasRect.left
        && r.top < canvasRect.bottom && r.bottom > canvasRect.top;
    return {
        top: overlaps(topRect) ? Math.max(0, topRect.bottom - canvasRect.top) : 0,
        bottom: overlaps(bottomRect) ? Math.max(0, canvasRect.bottom - bottomRect.top) : 0,
    };
}
