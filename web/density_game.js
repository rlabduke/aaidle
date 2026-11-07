// Electron Density Guessing Game - Main game logic
// ES module using Three.js for 3D rendering of pre-computed isosurface meshes

import * as THREE from 'three';
import * as seventies from './seventies.js';
import { dailyAminoAcidIndex, mulberry32 } from './daily_schedule.js';
import { pickRotamer, pickAminoAcid } from './puzzle_pick.js';
import { shareResult } from './result_share.js';
import { createSolveTimer, timeSummary, distributionRows, distributionHtml, historyHtml, timesLine } from './play_stats.js';
import { installHudLayout, hudInsets } from './hud_layout.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { isLoaded } from './fetch_ok.js';

// === Constants ===
const CPK_COLORS = {
    C: 0x909090, N: 0x3050F8, O: 0xFF0D0D, S: 0xFFFF30, P: 0xFF8000, H: 0xFFFFFF,
};
const ELEMENT_RADII = { C: 0.35, N: 0.32, O: 0.30, S: 0.45, P: 0.40, H: 0.20 };
const BOND_RADIUS = 0.06;

const RESOLUTION_STEPS = ['3.5', '2.5', '2.0', '1.5', '1.0'];
const RESOLUTION_LABELS = { '3.5': '3.5 \u00c5', '2.5': '2.5 \u00c5', '2.0': '2.0 \u00c5', '1.5': '1.5 \u00c5', '1.0': '1.0 \u00c5' };

// Points by resolution at time of guess
const BASE_SCORES = { '3.5': 1000, '2.5': 800, '2.0': 600, '1.5': 400, '1.0': 200 };
const TIME_BONUS_MAX = 200;
const TIME_BONUS_DECAY = 5; // pts per second
const IMPROVE_COST = 200;
const ROUNDS_PER_GAME = 10;
const PARTIAL_CREDIT_RATIO = 0.5;

// Backbone hint constants
const HINT_COST_PRACTICE = 300;
const HINT_COST_TA = [5, 8];              // bar cost for level 1 (CA), level 2 (full backbone)
const BACKBONE_ATOMS = new Set(['N', 'CA', 'C', 'O']);

// Help a host page sells beside the game, such as the AA.ID.LE app's field guide; the website sells none.
const HELP_COSTS = { guide: { practice: 200, ta: 5, daily: 1 } };

// Star thresholds (out of max ~12000)
const STAR_THRESHOLDS = [2000, 5000, 8000];
const DIFFICULTY_MULTIPLIER = { easy: 1.0, medium: 1.3, hard: 1.5 };

const STORAGE_KEY = 'molprobity_density_game_scores';
const TA_STORAGE_KEY = 'molprobity_density_game_ta_scores';

// Time Attack constants — life bar model
const TA_BAR_MAX = 100;          // max bar value
const TA_BASE_DRAIN = 1.5;       // bar units drained per second at start
const TA_ACCEL_PER_ROUND = 0.12; // additional drain/sec per completed round
const TA_CORRECT_BONUS = 15;     // bar units added on correct guess
const TA_PARTIAL_BONUS = 8;      // bar units added on confusable-pair partial credit
const TA_WRONG_PENALTY = 10;     // bar units subtracted on wrong guess
// Per-step improve costs: index = currentResIndex (step you're improving FROM)
// 3.5→2.5: 2, 2.5→2.0: 4, 2.0→1.5: 6, 1.5→1.0: 8
const TA_IMPROVE_COSTS = [2, 4, 6, 8];
const TA_ADVANCE_DELAY = 1000;   // ms to show result before auto-advancing
const TA_TICK_INTERVAL = 100;    // ms between timer ticks

const NORMAL_BG_COLOR = 0x1a1a2e;             // default scene background

// Confusable pairs (partial credit)
const CONFUSABLE_PAIRS = [
    ['ASP', 'ASN'], ['GLU', 'GLN'], ['VAL', 'THR'], ['SER', 'CYS'],
];

// Amino acid data for button grid
const ALL_AMINO_ACIDS = [
    { code: 'GLY', one: 'G', name: 'Gly', group: 'nonpolar' },
    { code: 'ALA', one: 'A', name: 'Ala', group: 'nonpolar' },
    { code: 'VAL', one: 'V', name: 'Val', group: 'nonpolar' },
    { code: 'LEU', one: 'L', name: 'Leu', group: 'nonpolar' },
    { code: 'ILE', one: 'I', name: 'Ile', group: 'nonpolar' },
    { code: 'PRO', one: 'P', name: 'Pro', group: 'nonpolar' },
    { code: 'PHE', one: 'F', name: 'Phe', group: 'aromatic' },
    { code: 'TRP', one: 'W', name: 'Trp', group: 'aromatic' },
    { code: 'TYR', one: 'Y', name: 'Tyr', group: 'aromatic' },
    { code: 'SER', one: 'S', name: 'Ser', group: 'polar' },
    { code: 'THR', one: 'T', name: 'Thr', group: 'polar' },
    { code: 'CYS', one: 'C', name: 'Cys', group: 'polar' },
    { code: 'MET', one: 'M', name: 'Met', group: 'polar' },
    { code: 'ASN', one: 'N', name: 'Asn', group: 'polar' },
    { code: 'GLN', one: 'Q', name: 'Gln', group: 'polar' },
    { code: 'ASP', one: 'D', name: 'Asp', group: 'charged-neg' },
    { code: 'GLU', one: 'E', name: 'Glu', group: 'charged-neg' },
    { code: 'LYS', one: 'K', name: 'Lys', group: 'charged-pos' },
    { code: 'ARG', one: 'R', name: 'Arg', group: 'charged-pos' },
    { code: 'HIS', one: 'H', name: 'His', group: 'charged-pos' },
];

const DIFFICULTY_AA = {
    easy: ['GLY', 'ALA', 'PRO', 'PHE', 'TRP', 'TYR'],
    medium: ['GLY', 'ALA', 'PRO', 'PHE', 'TRP', 'TYR', 'SER', 'THR', 'VAL', 'LEU', 'ILE', 'CYS', 'MET', 'HIS'],
    hard: ALL_AMINO_ACIDS.map(a => a.code),
};

// Educational messages for confusable pairs
const CONFUSABLE_MESSAGES = {
    'ASP-ASN': 'Asp and Asn are nearly identical in density \u2014 crystallographers use chemical context (nearby H-bond donors/acceptors) to distinguish them.',
    'GLU-GLN': 'Glu and Gln differ by only one oxygen vs. nitrogen \u2014 indistinguishable from density alone at most resolutions.',
    'VAL-THR': 'Val and Thr have very similar shapes. The oxygen in Thr can sometimes be spotted at high resolution by its slightly stronger density.',
    'CYS-SER': 'Ser and Cys have very similar shapes \u2014 the sulfur in Cys shows slightly stronger density than the oxygen in Ser, but the difference is subtle.',
};

// === Daily Mode Constants ===
const DAILY_STORAGE_KEY = 'molprobity_aaidle_daily';
const DAILY_GUESSES = 5;

// === State ===
let scene, camera, renderer, controls;
let animFrameId = null;
let densityMeshes = {};     // resolution -> THREE.Mesh
let revealMeshes = [];      // atom spheres + bond cylinders shown after guess
let revealWear = null;      // ages a 70's reveal model while 70's is off
let gameState = 'IDLE';     // IDLE, LOADING, PLAYING, REVEAL, COMPLETED
let manifest = null;        // Loaded from manifest.json
let puzzlePool = [];         // Available puzzles for current session
let currentPuzzle = null;
let currentResIndex = 0;    // Index into RESOLUTION_STEPS
let roundNumber = 0;
let totalScore = 0;
let correctCount = 0;
let roundStartTime = 0;
let sessionTimer = null;
let sessionStartTime = 0;
let roundHistory = [];       // Array of {puzzle, aa, guessed, correct, partial, score, resolution, ms, hint}
let taRoundHistory = [];
let taEntry = null;
let difficulty = 'medium';
let usedAAs = {};            // Count of each AA used this session

// Backbone hint state
let hintMeshes = [];         // THREE.Mesh objects for backbone hint geometry
let hintLevel = 0;           // 0 = none, 1 = CA only, 2 = full backbone
let hintScoreDeduction = 0;  // accumulated score penalty (practice mode)
let helpBought = new Set();   // HELP_COSTS kinds bought this round

// Daily mode state
let gameMode = 'daily';      // 'daily', 'practice', or 'time-attack'
let dailyGuessesRemaining = DAILY_GUESSES;
let dailyGuessHistory = [];  // {type: 'guess'|'improve', code?, correct?}
const dailyTimer = createSolveTimer();
// Also sets html.hud-layout, which density_game.css keys its HUD rules on.
const HUD_LAYOUT = installHudLayout(window, relayout);
const DAILY_HISTORY_DAYS = 365;
const HISTORY_ROWS_SHOWN = 14;
let dailyAnswer = null;
let dailyPuzzleEntry = null;
let dailyDateStr = '';
let dailyCompleted = false;
let dailyWon = false;
let dailyGuessedAAs = new Set();
let countdownTimer = null;

// Time Attack state — life bar model
let taBarValue = TA_BAR_MAX;            // 0–100 float
let taRoundsCompleted = 0;              // rounds completed (for drain acceleration)
let taCorrectCount = 0;
let taRoundNumber = 0;
let taTimerInterval = null;
let taTimerPaused = false;              // paused during puzzle loading
let taLastTick = 0;                     // Date.now() of last tick

// === DOM References ===
let canvasContainer, canvas;
let instructionsOverlay, revealOverlay, completeOverlay;
let startBtn, nextRoundBtn, playAgainBtn;
let difficultySelect, roundNumber_el, roundIndicator;
let resolutionValue, resolutionSteps, improveBtn;
let aaGrid;
let statScore, statRound, statCorrect, statTimer, liveStars, practiceScore;
let leaderboardBody;
let revealResult, revealMessage, revealInfo;
let completionStars, completionScore, completionDetails;
let miniProgressBar, progressLabel, progressLink, analysisProgressEl;

// Daily mode DOM refs
let modeTabs;
let dailyGuessPanel, guessIndicators;
let dailyStatsPanel, dailyStreak_el, dailyMaxStreak_el, dailyPlayed_el, dailyWinPct_el;
let dailyResultOverlay, dailyResultTitle, dailyResultAnswer, dailyResultEmoji;
let dailyStatsGrid, drPlayed, drWinPct, drStreak, drMaxStreak;
let dailyDistribution, dailyTimes, dailyHistory, shareBtn, shareConfirm, dailyCountdown;
let improveCost;
let hintBtn, hintCost;

// Time Attack DOM refs
let timeAttackPanel, taLifeBar, taLifeBarFill, taScore_el, taRound_el;
let taDifficultySelect, taLeaderboardBody;

// 70's mode state
let viewMode = 'normal';   // 'normal' or 'seventies'
let seventiesGroup = null;  // THREE.Group holding all contour sheet sub-groups
let viewModeBtn = null;     // toggle button DOM element

// === Initialization ===
function init() {
    canvasContainer = document.getElementById('canvasContainer');
    canvas = document.getElementById('densityCanvas');
    instructionsOverlay = document.getElementById('instructionsOverlay');
    revealOverlay = document.getElementById('revealOverlay');
    completeOverlay = document.getElementById('completeOverlay');
    startBtn = document.getElementById('startBtn');
    nextRoundBtn = document.getElementById('nextRoundBtn');
    playAgainBtn = document.getElementById('playAgainBtn');
    difficultySelect = document.getElementById('difficultySelect');
    roundNumber_el = document.getElementById('roundNumber');
    roundIndicator = document.getElementById('roundIndicator');
    resolutionValue = document.getElementById('resolutionValue');
    resolutionSteps = document.getElementById('resolutionSteps');
    improveBtn = document.getElementById('improveBtn');
    aaGrid = document.getElementById('aaGrid');
    statScore = document.getElementById('statScore');
    practiceScore = document.getElementById('practiceScore');
    statRound = document.getElementById('statRound');
    statCorrect = document.getElementById('statCorrect');
    statTimer = document.getElementById('statTimer');
    liveStars = document.getElementById('liveStars');
    leaderboardBody = document.getElementById('leaderboardBody');
    revealResult = document.getElementById('revealResult');
    revealMessage = document.getElementById('revealMessage');
    revealInfo = document.getElementById('revealInfo');
    completionStars = document.getElementById('completionStars');
    completionScore = document.getElementById('completionScore');
    completionDetails = document.getElementById('completionDetails');
    miniProgressBar = document.getElementById('miniProgressBar');
    progressLabel = document.getElementById('progressLabel');
    progressLink = document.getElementById('progressLink');
    analysisProgressEl = document.getElementById('analysisProgress');

    // Daily mode DOM refs
    modeTabs = document.getElementById('modeTabs');
    dailyGuessPanel = document.getElementById('dailyGuessPanel');
    guessIndicators = document.getElementById('guessIndicators');
    dailyStatsPanel = document.getElementById('dailyStatsPanel');
    dailyStreak_el = document.getElementById('dailyStreak');
    dailyMaxStreak_el = document.getElementById('dailyMaxStreak');
    dailyPlayed_el = document.getElementById('dailyPlayed');
    dailyWinPct_el = document.getElementById('dailyWinPct');
    dailyResultOverlay = document.getElementById('dailyResultOverlay');
    dailyResultTitle = document.getElementById('dailyResultTitle');
    dailyResultAnswer = document.getElementById('dailyResultAnswer');
    dailyResultEmoji = document.getElementById('dailyResultEmoji');
    dailyStatsGrid = document.getElementById('dailyStatsGrid');
    drPlayed = document.getElementById('drPlayed');
    drWinPct = document.getElementById('drWinPct');
    drStreak = document.getElementById('drStreak');
    drMaxStreak = document.getElementById('drMaxStreak');
    dailyDistribution = document.getElementById('dailyDistribution');
    dailyTimes = document.getElementById('dailyTimes');
    dailyHistory = document.getElementById('dailyHistory');
    shareBtn = document.getElementById('shareBtn');
    shareConfirm = document.getElementById('shareConfirm');
    dailyCountdown = document.getElementById('dailyCountdown');
    improveCost = document.getElementById('improveCost');
    hintBtn = document.getElementById('hintBtn');
    hintCost = document.getElementById('hintCost');

    // Time Attack DOM refs
    timeAttackPanel = document.getElementById('timeAttackPanel');
    taLifeBar = document.getElementById('taLifeBar');
    taLifeBarFill = document.getElementById('taLifeBarFill');
    taScore_el = document.getElementById('taScore');
    taRound_el = document.getElementById('taRound');
    taDifficultySelect = document.getElementById('taDifficultySelect');
    taLeaderboardBody = document.getElementById('taLeaderboardBody');

    // Create 70's mode toggle button
    viewModeBtn = document.createElement('button');
    viewModeBtn.className = 'mp-density-btn-view-mode';
    viewModeBtn.textContent = "70's";
    viewModeBtn.title = "Toggle 1970s contour-sheet mode";
    viewModeBtn.addEventListener('click', toggleViewMode);
    canvasContainer.appendChild(viewModeBtn);

    setupResultPanels();
    setupScene();
    setupEventListeners();
    switchMode('daily');
    updateLeaderboard();
    updateTALeaderboard();
    pollAnalysisStatus();
    loadManifest().then(() => {
        if (gameMode === 'daily') checkAndRestoreDaily();
    });
}

const RESULT_STRIPS = [
    ['revealOverlay', 'revealResult', 'nextRoundBtn'],
    ['completeOverlay', 'completionScore', 'playAgainBtn'],
    ['dailyResultOverlay', 'dailyResultTitle', 'shareBtn'],
];

function setupResultPanels() {
    for (const [panelId, headId, btnId] of RESULT_STRIPS) {
        const panel = document.getElementById(panelId);
        const head = document.getElementById(headId);
        const btn = document.getElementById(btnId);
        if (!panel || !head || !btn) continue;
        head.classList.add('strip-keep');
        btn.classList.add('strip-keep');
        const hide = document.createElement('button');
        hide.className = 'result-hide';
        hide.type = 'button';
        hide.setAttribute('aria-label', 'Hide result');
        hide.textContent = 'Hide';
        hide.addEventListener('click', () => panel.classList.add('collapsed'));
        panel.appendChild(hide);
        head.addEventListener('click', () => panel.classList.remove('collapsed'));
    }
}

function showResultPanel(panel) {
    panel.classList.remove('collapsed');
    panel.classList.remove('d-none');
}

// How far the HUD panels reach into the map; zero outside the HUD layout or when a panel sits beside it.
function measureInsets() {
    if (!HUD_LAYOUT.matches) return { top: 0, bottom: 0 };
    const rectOf = id => document.getElementById(id)?.getBoundingClientRect() ?? null;
    return hudInsets(canvasContainer.getBoundingClientRect(), rectOf('resolutionPanel'), rectOf('aaPanel'));
}

function getCanvasSize() {
    const rect = canvasContainer.getBoundingClientRect();
    const w = rect.width || 800;
    if (!HUD_LAYOUT.matches) return { w, h: Math.max(rect.height, 600) };
    return { w, h: Math.max(300, Math.max(rect.height, 300) - measureInsets().bottom) };
}

function setupScene() {
    const { w, h } = getCanvasSize();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Orthographic camera — frustum sized later by fitCameraToBox()
    const aspect = w / h;
    const frustum = 15;
    camera = new THREE.OrthographicCamera(
        -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200
    );
    camera.position.set(0, 0, 40);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.noZoom = false;
    controls.noPan = false;
    controls.dynamicDampingFactor = 0.1;

    // Lighting
    const ambient = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dir1.position.set(5, 10, 7);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x8888ff, 0.5);
    dir2.position.set(-5, -5, -5);
    scene.add(dir2);

    animate();

    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') {
        let queued = false;
        const observer = new ResizeObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; if (renderer) onResize(); });
        });
        for (const id of ['resolutionPanel', 'aaPanel']) {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        }
    }
}

function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = null;
        dailyTimer.pause();
    } else {
        if (!animFrameId && renderer) animate();
        if (gameMode === 'daily' && gameState === 'PLAYING' && !dailyCompleted) dailyTimer.start();
    }
});

// The HUD padding is applied only when a round's map is fitted, so refit after a layout switch.
function relayout() {
    if (!camera) return;
    onResize();
    refitMap();
}

function refitMap() {
    const mesh = densityMeshes[RESOLUTION_STEPS[0]];
    if (mesh) fitFrustum(new THREE.Box3().setFromObject(mesh));
}

// Whether the HUD panels covered the map when it was last fitted; a change means the fit is stale.
let mapOverlaid = null;

function onResize() {
    const { w, h } = getCanvasSize();
    const aspect = w / h;
    // Preserve vertical frustum, adjust horizontal
    const vSize = (camera.top - camera.bottom) / 2;
    // Reset to symmetric frustum, then shift it by the measured top inset
    camera.top = vSize;
    camera.bottom = -vSize;
    camera.left = -vSize * aspect;
    camera.right = vSize * aspect;
    const insets = measureInsets();
    canvasContainer.style.setProperty('--hud-top', insets.top + 'px');
    // Shift the frustum so the density centres below the top HUD overlay
    if (insets.top > 0) {
        const topHudPx = 56; // top HUD height (guess dots + resolution bar)
        const nudge = topHudPx * vSize / h;
        camera.top += nudge;
        camera.bottom += nudge;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (controls) controls.handleResize();
    // Keep the 70's button above the AA grid overlay
    if (viewModeBtn) viewModeBtn.style.bottom = insets.bottom > 0 ? (insets.bottom + 12) + 'px' : '';
    if (mapOverlaid !== null && mapOverlaid !== (insets.top > 0 || insets.bottom > 0)) refitMap();
}

function setupEventListeners() {
    startBtn.addEventListener('click', onStartGame);
    nextRoundBtn.addEventListener('click', onNextRound);
    playAgainBtn.addEventListener('click', onPlayAgain);
    improveBtn.addEventListener('click', onImproveResolution);
    hintBtn.addEventListener('click', onBackboneHint);
    difficultySelect.addEventListener('change', (e) => {
        difficulty = e.target.value;
        populateAAGrid();
    });
    taDifficultySelect.addEventListener('change', (e) => {
        difficulty = e.target.value;
        populateAAGrid();
    });
    // Mode tabs
    modeTabs.querySelectorAll('.mp-density-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (gameState === 'PLAYING' || gameState === 'LOADING' || gameState === 'REVEAL') return; // Don't switch mid-game
            switchMode(tab.dataset.mode);
        });
    });
    // Share button
    shareBtn.addEventListener('click', copyShare);
}

// === Manifest & Puzzle Loading ===
// The site serves /static/ as immutable for a year, so data fetches reuse the stamped manifest URL's ?v=.
// The app's bundled page passes no manifest_url and fetches plain file names.
function dataVersionQuery() {
    const url = window.DENSITY_GAME_DATA.manifest_url || '';
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(q) : '';
}

async function loadManifest() {
    const staticUrl = window.DENSITY_GAME_DATA.static_url;
    try {
        const resp = await fetch(staticUrl + 'manifest.json' + dataVersionQuery());
        if (!isLoaded(resp)) {
            console.warn('Density game data not found. Run: python generator/generate_density_puzzles.py');
            return;
        }
        manifest = await resp.json();
        console.log(`Loaded manifest: ${manifest.puzzles.length} puzzles`);
    } catch (e) {
        console.warn('Could not load density game manifest:', e);
    }
}

async function loadPuzzle(puzzleEntry) {
    const staticUrl = window.DENSITY_GAME_DATA.static_url;
    const resp = await fetch(staticUrl + puzzleEntry.file + dataVersionQuery());
    if (!isLoaded(resp)) throw new Error(`Failed to load puzzle: ${puzzleEntry.file}`);
    return await resp.json();
}

function selectPuzzlesForSession() {
    if (!manifest) return [];

    const allowedAAs = DIFFICULTY_AA[difficulty];
    const available = manifest.puzzles.filter(p => allowedAAs.includes(p.amino_acid));

    // Group by amino acid
    const byAA = {};
    for (const p of available) {
        if (!byAA[p.amino_acid]) byAA[p.amino_acid] = [];
        byAA[p.amino_acid].push(p);
    }

    const selected = [];
    usedAAs = {};
    const aaKeys = Object.keys(byAA);

    for (let i = 0; i < ROUNDS_PER_GAME && aaKeys.length > 0; i++) {
        // Filter to AAs with count < 2
        const eligible = aaKeys.filter(aa => (usedAAs[aa] || 0) < 2);
        if (eligible.length === 0) break;

        const aa = eligible[Math.floor(Math.random() * eligible.length)];
        const puzzles = byAA[aa];
        // Avoid repeating the exact same puzzle back-to-back
        const prev = selected.length > 0 ? selected[selected.length - 1] : null;
        const candidates = prev ? puzzles.filter(p => p.id !== prev.id) : puzzles;
        const pool = candidates.length > 0 ? candidates : puzzles;
        const puzzle = pickRotamer(pool, Math.random());
        selected.push(puzzle);
        usedAAs[aa] = (usedAAs[aa] || 0) + 1;
    }

    return selected;
}

// === AA Grid ===
function populateAAGrid() {
    aaGrid.innerHTML = '';
    // Daily mode always shows all 20 AAs; practice and time-attack use difficulty setting
    const allowedAAs = gameMode === 'daily' ? DIFFICULTY_AA.hard : DIFFICULTY_AA[difficulty];

    for (const aa of ALL_AMINO_ACIDS) {
        if (!allowedAAs.includes(aa.code)) continue;

        const btn = document.createElement('button');
        btn.className = `mp-density-aa-btn group-${aa.group}`;
        btn.dataset.code = aa.code;
        btn.innerHTML = `<span class="aa-code">${aa.one}</span><span class="aa-three">${aa.name}</span><span class="aa-name">${aa.name}</span>`;
        btn.disabled = gameState !== 'PLAYING';

        // Daily mode: grey out already-guessed AAs
        if (gameMode === 'daily' && dailyGuessedAAs.has(aa.code)) {
            btn.classList.add('guessed');
            btn.disabled = true;
        }

        btn.addEventListener('click', () => onGuess(aa.code));
        aaGrid.appendChild(btn);
    }
    // Resize renderer so canvas accounts for new grid height
    if (renderer) onResize();
}

function setAAButtonsEnabled(enabled) {
    const buttons = aaGrid.querySelectorAll('.mp-density-aa-btn');
    buttons.forEach(btn => { btn.disabled = !enabled; });
}

function highlightAAButton(code, className) {
    const buttons = aaGrid.querySelectorAll('.mp-density-aa-btn');
    buttons.forEach(btn => {
        if (btn.dataset.code === code) btn.classList.add(className);
    });
}

// === Game Flow ===
function onStartGame() {
    if (gameMode === 'daily') { onStartDaily(); return; }
    if (gameMode === 'time-attack') { onStartTimeAttack(); return; }
    if (!manifest || manifest.puzzles.length === 0) {
        alert('Puzzle data not loaded. The management command may need to be run first.');
        return;
    }

    difficulty = difficultySelect.value;
    puzzlePool = selectPuzzlesForSession();
    if (puzzlePool.length === 0) {
        alert('No puzzles available for this difficulty.');
        return;
    }

    roundNumber = 0;
    totalScore = 0;
    correctCount = 0;
    roundHistory = [];
    sessionStartTime = Date.now();

    instructionsOverlay.classList.add('d-none');
    completeOverlay.classList.add('d-none');
    difficultySelect.disabled = true;

    startSessionTimer();
    startNextRound();
}

function startNextRound() {
    if (roundNumber >= puzzlePool.length || roundNumber >= ROUNDS_PER_GAME) {
        endGame();
        return;
    }

    gameState = 'LOADING';
    revealOverlay.classList.add('d-none');
    currentResIndex = 0;
    hintLevel = 0;
    hintScoreDeduction = 0;
    helpBought = new Set();
    roundNumber++;
    roundStartTime = Date.now();

    updateRoundDisplay();
    updateResolutionDisplay();
    clearScene();
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    updateHintButton();

    // Clear any previous guess highlights
    aaGrid.querySelectorAll('.mp-density-aa-btn').forEach(btn => {
        btn.classList.remove('correct', 'wrong', 'answer');
    });

    // Load the puzzle
    const entry = puzzlePool[roundNumber - 1];
    loadPuzzle(entry).then(puzzle => {
        currentPuzzle = puzzle;
        buildDensityMeshes(puzzle);
        buildSeventiesMode(puzzle);
        showResolution(0);
        gameState = 'PLAYING';
        setAAButtonsEnabled(true);
        improveBtn.disabled = (currentResIndex >= RESOLUTION_STEPS.length - 1);
        updateHintButton();
        emitRound();
    }).catch(err => {
        console.error('Failed to load puzzle:', err);
        // Skip this round
        startNextRound();
    });
}

function onImproveResolution() {
    if (gameState !== 'PLAYING') return;
    if (gameMode === 'daily') { onDailyImprove(); return; }
    if (currentResIndex >= RESOLUTION_STEPS.length - 1) return;

    if (gameMode === 'time-attack') {
        // Deduct bar value — cost increases with resolution
        const cost = TA_IMPROVE_COSTS[currentResIndex] || 5;
        taBarValue = Math.max(0, taBarValue - cost);
        updateTABarDisplay();
        showTimeDelta(-cost);
        if (taBarValue <= 0) {
            endTimeAttack();
            return;
        }
    }

    currentResIndex++;
    showResolution(currentResIndex);
    updateResolutionDisplay();

    if (currentResIndex >= RESOLUTION_STEPS.length - 1) {
        improveBtn.disabled = true;
    }
}

function onGuess(guessCode) {
    if (gameState !== 'PLAYING') return;
    if (gameMode === 'daily') { onDailyGuess(guessCode); return; }
    if (gameMode === 'time-attack') { onTimeAttackGuess(guessCode); return; }

    gameState = 'REVEAL';
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    hintBtn.disabled = true;

    const correctCode = currentPuzzle.amino_acid;
    const resKey = RESOLUTION_STEPS[currentResIndex];
    const elapsed = (Date.now() - roundStartTime) / 1000;

    // Calculate score
    let score = 0;
    let isCorrect = (guessCode === correctCode);
    let isPartial = false;

    if (isCorrect) {
        const baseScore = BASE_SCORES[resKey];
        const timeBonus = Math.max(0, TIME_BONUS_MAX - Math.floor(elapsed * TIME_BONUS_DECAY));
        score = baseScore + timeBonus;
    } else {
        // Check for confusable pair partial credit
        for (const pair of CONFUSABLE_PAIRS) {
            if (pair.includes(guessCode) && pair.includes(correctCode)) {
                isPartial = true;
                const baseScore = BASE_SCORES[resKey];
                score = Math.floor(baseScore * PARTIAL_CREDIT_RATIO);
                break;
            }
        }
    }

    // Apply backbone hint penalty (practice mode)
    score = Math.max(0, score - hintScoreDeduction);
    totalScore += score;
    if (isCorrect) correctCount++;

    roundHistory.push({
        puzzle: puzzlePool[roundNumber - 1].id,
        aa: correctCode,
        guessed: guessCode,
        correct: isCorrect,
        partial: isPartial,
        score: score,
        resolution: resKey,
        ms: Math.round(elapsed * 1000),
        hint: hintLevel,
        guide: helpBought.has('guide'),
    });

    // UI feedback
    if (isCorrect) {
        highlightAAButton(guessCode, 'correct');
        revealResult.textContent = `Correct! +${score} pts`;
        revealResult.className = 'reveal-result correct strip-keep';
    } else if (isPartial) {
        highlightAAButton(guessCode, 'wrong');
        highlightAAButton(correctCode, 'answer');
        revealResult.textContent = `Close! +${score} pts (partial credit)`;
        revealResult.className = 'reveal-result partial strip-keep';
    } else {
        highlightAAButton(guessCode, 'wrong');
        highlightAAButton(correctCode, 'answer');
        revealResult.textContent = `Wrong! The answer was ${currentPuzzle.amino_acid_name}`;
        revealResult.className = 'reveal-result wrong strip-keep';
    }

    // Show reveal message
    const aaInfo = ALL_AMINO_ACIDS.find(a => a.code === correctCode);
    revealMessage.textContent = `${currentPuzzle.amino_acid_name} (${aaInfo ? aaInfo.one : correctCode}) at ${RESOLUTION_LABELS[resKey]}`;

    // Show educational message for confusable pairs
    if (isPartial || (!isCorrect && isConfusablePair(guessCode, correctCode))) {
        const pairKey = [guessCode, correctCode].sort().join('-');
        revealInfo.textContent = CONFUSABLE_MESSAGES[pairKey] || '';
    } else {
        revealInfo.textContent = '';
    }

    // Show atomic model overlay
    showAtomicModel(currentPuzzle);

    // Dim the wireframe so the atomic model stands out
    Object.values(densityMeshes).forEach(mesh => {
        if (mesh.visible) {
            mesh.material.opacity = 0.3;
            mesh.material.transparent = true;
        }
    });

    showResultPanel(revealOverlay);
    updateStats();
}

function isConfusablePair(a, b) {
    return CONFUSABLE_PAIRS.some(pair => pair.includes(a) && pair.includes(b));
}

function onNextRound() {
    startNextRound();
}

function emitFinished(detail) {
    window.dispatchEvent(new CustomEvent('densitygame:finished', { detail }));
}

function emitRound() {
    window.dispatchEvent(new CustomEvent('densitygame:round', { detail: { mode: gameMode } }));
}

function canBuyHelp(kind) {
    const costs = HELP_COSTS[kind];
    if (!costs || gameState !== 'PLAYING' || helpBought.has(kind)) return false;
    // Daily keeps one action back: spending the last on help could only lose the round.
    if (gameMode === 'daily') return !dailyCompleted && dailyGuessesRemaining > costs.daily;
    if (gameMode === 'time-attack') return taBarValue > costs.ta;
    return true;
}

function buyHelp(kind) {
    if (!canBuyHelp(kind)) return null;
    const costs = HELP_COSTS[kind];
    helpBought.add(kind);
    if (gameMode === 'daily') {
        dailyGuessesRemaining -= costs.daily;
        dailyGuessHistory.push({ type: kind });
        updateGuessIndicators();
        return { cost: costs.daily, unit: 'action' };
    }
    if (gameMode === 'time-attack') {
        taBarValue = Math.max(0, taBarValue - costs.ta);
        updateTABarDisplay();
        showTimeDelta(-costs.ta);
        return { cost: costs.ta, unit: 'bar' };
    }
    hintScoreDeduction += costs.practice;
    return { cost: costs.practice, unit: 'pts' };
}

function helpLabel(kind) {
    const costs = HELP_COSTS[kind];
    if (!costs) return '';
    if (gameMode === 'daily') return `(costs ${costs.daily} guess)`;
    if (gameMode === 'time-attack') return `(-${costs.ta})`;
    return `(-${costs.practice} pts)`;
}

window.densityGame = { buyHelp, helpLabel, canBuyHelp, revealWear: () => revealWear?.progress ?? null, puzzleId: () => currentPuzzle?.id ?? null };

function endGame() {
    gameState = 'COMPLETED';
    stopSessionTimer();
    emitFinished({ mode: 'practice', difficulty, score: totalScore, rounds: roundHistory });

    const stars = getStarCount(totalScore);
    const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
    const adjustedScore = Math.round(totalScore * multiplier);

    // Show completion overlay
    completionStars.innerHTML = [1, 2, 3].map(i =>
        `<span class="${i <= stars ? 'star-earned' : ''}">&#9733;</span>`
    ).join('');
    completionScore.textContent = `${totalScore} pts`;
    completionDetails.textContent = `${correctCount}/${roundHistory.length} correct | ${difficulty} mode (${multiplier}x) = ${adjustedScore} leaderboard pts`;

    showResultPanel(completeOverlay);
    revealOverlay.classList.add('d-none');

    // Save score
    saveScore(adjustedScore, stars, difficulty);
    updateLeaderboard();
    updateStats();
}

function onPlayAgain() {
    completeOverlay.classList.add('d-none');
    difficultySelect.disabled = false;
    if (taDifficultySelect) taDifficultySelect.disabled = false;
    instructionsOverlay.classList.remove('d-none');
    clearScene();
    gameState = 'IDLE';
    stopTATimer();
    populateAAGrid();
}

function getStarCount(score) {
    let stars = 0;
    for (const threshold of STAR_THRESHOLDS) {
        if (score >= threshold) stars++;
    }
    return stars;
}

// === Three.js Density Rendering ===
function clearScene() {
    // Remove density meshes
    Object.values(densityMeshes).forEach(mesh => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    densityMeshes = {};

    // Remove reveal meshes
    revealWear?.dispose();
    revealWear = null;
    revealMeshes.forEach(mesh => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    revealMeshes = [];

    // Remove backbone hint meshes
    clearHintMeshes();

    // Remove 70's mode contour sheets
    clearSeventiesMode();
}

// Colors for target vs flanking density
const DENSITY_COLOR_TARGET = new THREE.Color(0x4488cc);  // blue
const DENSITY_COLOR_FLANK = new THREE.Color(0x334455);   // dim grey-blue
function buildDensityMeshes(puzzle) {
    // Pre-extract atom positions and target flags for nearest-atom coloring
    const atoms = puzzle.atoms;
    const atomPos = atoms.map(a => [a.x, a.y, a.z]);
    const atomIsTarget = atoms.map(a => a.residue_id === 'target');

    for (const resKey of RESOLUTION_STEPS) {
        const meshData = puzzle.meshes[resKey];
        if (!meshData || meshData.v.length === 0) continue;

        const geom = new THREE.BufferGeometry();
        const vertices = new Float32Array(meshData.v);
        const indices = meshData.f;
        const normals = new Float32Array(meshData.n);

        // Per-vertex color based on nearest atom's residue_id
        const numVerts = vertices.length / 3;
        const colors = new Float32Array(numVerts * 3);
        const tmpColor = new THREE.Color();
        for (let i = 0; i < numVerts; i++) {
            const vx = vertices[i * 3];
            const vy = vertices[i * 3 + 1];
            const vz = vertices[i * 3 + 2];

            // Find min squared distance to any target atom and any flank atom
            let minTarget = Infinity, minFlank = Infinity;
            for (let j = 0; j < atoms.length; j++) {
                const dx = vx - atomPos[j][0];
                const dy = vy - atomPos[j][1];
                const dz = vz - atomPos[j][2];
                const d2 = dx * dx + dy * dy + dz * dz;
                if (atomIsTarget[j]) {
                    if (d2 < minTarget) minTarget = d2;
                } else {
                    if (d2 < minFlank) minFlank = d2;
                }
            }

            // Smooth blend near the Voronoi boundary (±1 Å transition zone)
            const diff = Math.sqrt(minTarget) - Math.sqrt(minFlank);
            const t = Math.min(1, Math.max(0, diff * 0.5 + 0.5));
            tmpColor.copy(DENSITY_COLOR_TARGET).lerp(DENSITY_COLOR_FLANK, t);
            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.setIndex(indices);
        geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            wireframe: true,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.visible = false;
        scene.add(mesh);
        densityMeshes[resKey] = mesh;
    }
}

// Frames the box for the current layout, leaving the view direction alone.
function fitFrustum(box) {
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const { w, h } = getCanvasSize();
    const aspect = w / h;
    const insets = measureInsets();
    // Extra padding to clear the top HUD overlay and the AA grid below
    mapOverlaid = insets.top > 0 || insets.bottom > 0;
    const padding = mapOverlaid ? 1.6 : 1.3;
    const halfV = (maxDim / 2) * padding;
    camera.top = halfV;
    camera.bottom = -halfV;
    camera.left = -halfV * aspect;
    camera.right = halfV * aspect;
    // Nudge the density below the top HUD (guess indicators + resolution bar)
    if (insets.top > 0) {
        const topHudPx = 56; // top HUD height
        const nudge = topHudPx * halfV / h;
        camera.top += nudge;
        camera.bottom += nudge;
    }
    camera.updateProjectionMatrix();
}

function fitCameraToBox(box) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    fitFrustum(box);
    controls.target.copy(center);
    // Randomize starting orientation: place camera on a random point on a sphere
    const theta = Math.random() * Math.PI * 2;       // azimuthal angle [0, 2π)
    const phi = Math.acos(2 * Math.random() - 1);    // polar angle [0, π], uniform on sphere
    const r = 40;
    camera.position.set(
        center.x + r * Math.sin(phi) * Math.cos(theta),
        center.y + r * Math.sin(phi) * Math.sin(theta),
        center.z + r * Math.cos(phi)
    );
    camera.up.set(0, 1, 0);
    controls.update();
}

function showResolution(index) {
    const resKey = RESOLUTION_STEPS[index];

    // Hide all density meshes
    Object.values(densityMeshes).forEach(mesh => { mesh.visible = false; });

    // Hide all 70's sub-groups and toggle parent visibility
    if (seventiesGroup) {
        seventiesGroup.visible = (viewMode === 'seventies');
        seventiesGroup.children.forEach(g => { g.visible = false; });
    }

    // Show based on current view mode
    if (viewMode === 'seventies' && seventiesGroup) {
        const sub = seventiesGroup.getObjectByName(`seventies_${resKey}`);
        if (sub) sub.visible = true;
    }
    if (viewMode === 'normal' && densityMeshes[resKey]) {
        densityMeshes[resKey].visible = true;
    }

    // Only auto-fit camera on the first resolution of a new round
    if (index === 0 && densityMeshes[resKey]) {
        fitCameraToBox(new THREE.Box3().setFromObject(densityMeshes[resKey]));
    }
}

function showAtomicModel(puzzle) {
    // Remove backbone hint geometry — the full reveal model supersedes it
    clearHintMeshes();

    // Dim 70's mode planes when revealing answer
    if (seventiesGroup) {
        seventiesGroup.traverse(obj => {
            if (obj.material && obj.material.opacity !== undefined) {
                obj.material.opacity *= 0.3;
            }
        });
    }

    if (viewMode === 'seventies') {
        showKendrewModel(puzzle);
    } else {
        showBallAndStickModel(puzzle);
    }
}

function showBallAndStickModel(puzzle) {
    // Ball-and-stick model from puzzle atom/bond data
    // Target residue: glowing CPK atoms and cyan bonds; flanking ALAs: dimmed grey
    const atoms = puzzle.atoms;
    const bonds = puzzle.bonds;
    // A weaker grey glow keeps the flanks visible beside the target from any side, but secondary.
    const FLANK_COLOR = 0x999999;
    const FLANK_OPACITY = 0.7;
    const flankMaterial = () => new THREE.MeshStandardMaterial({
        color: FLANK_COLOR, emissive: FLANK_COLOR, emissiveIntensity: 0.3, roughness: 0.6,
        transparent: true, opacity: FLANK_OPACITY, depthWrite: false,
    });

    // Atom spheres
    for (const atom of atoms) {
        const isFlank = atom.residue_id === 'flank';
        const color = isFlank ? FLANK_COLOR : (CPK_COLORS[atom.element] || 0x909090);
        const radius = (ELEMENT_RADII[atom.element] || 0.3) * (isFlank ? 0.6 : 0.8);

        const geom = new THREE.SphereGeometry(radius, 16, 12);
        // The target glows in its own colour (as in Word's viewer), so it reads from any side, lit or not.
        const mat = isFlank
            ? flankMaterial()
            : new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.1 });
        const sphere = new THREE.Mesh(geom, mat);
        sphere.position.set(atom.x, atom.y, atom.z);
        scene.add(sphere);
        revealMeshes.push(sphere);
    }

    // Bond cylinders
    for (const [i, j] of bonds) {
        const a1 = atoms[i];
        const a2 = atoms[j];
        // Only bonds within the target are cyan; the peptide bonds to the flanks stay faint, as in Word.
        const isFlank = a1.residue_id === 'flank' || a2.residue_id === 'flank';
        const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
        const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();

        const bondRadius = isFlank ? BOND_RADIUS * 0.5 : BOND_RADIUS;
        const geom = new THREE.CylinderGeometry(bondRadius, bondRadius, len, 8);
        const mat = isFlank
            ? flankMaterial()
            : new THREE.MeshStandardMaterial({ color: 0x00cccc, emissive: 0x00cccc, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
        const cyl = new THREE.Mesh(geom, mat);

        cyl.position.copy(mid);
        cyl.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.normalize()
        );
        scene.add(cyl);
        revealMeshes.push(cyl);
    }
}

function showKendrewModel(puzzle) {
    const group = seventies.buildKendrewModel(puzzle.atoms, puzzle.bonds);
    revealWear = seventies.kendrewWear(group);
    for (const mesh of [...group.children]) {
        scene.add(mesh);
        revealMeshes.push(mesh);
    }
}

// === Backbone Hint ===

function clearHintMeshes() {
    hintMeshes.forEach(mesh => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    hintMeshes = [];
}

function getBackboneSubset(puzzle, level) {
    // Returns {atomIndices, bonds} for the requested hint level
    const atoms = puzzle.atoms;
    const atomIndices = [];
    for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        if (level === 1) {
            // CA only (target + flanks)
            if (a.name === 'CA') atomIndices.push(i);
        } else {
            // Full backbone: N, CA, C, O
            if (BACKBONE_ATOMS.has(a.name)) atomIndices.push(i);
        }
    }

    const indexSet = new Set(atomIndices);
    const bonds = [];
    if (level >= 2) {
        for (const [i, j] of puzzle.bonds) {
            if (indexSet.has(i) && indexSet.has(j)) bonds.push([i, j]);
        }
    }

    return { atomIndices, bonds };
}

function showBackboneHint(puzzle, level) {
    clearHintMeshes();

    if (viewMode === 'seventies') {
        showBackboneHintKendrew(puzzle, level);
    } else {
        showBackboneHintNormal(puzzle, level);
    }
}

function showBackboneHintNormal(puzzle, level) {
    const { atomIndices, bonds } = getBackboneSubset(puzzle, level);
    const atoms = puzzle.atoms;

    const HINT_COLOR = 0x00cccc;      // turquoise
    const HINT_FLANK_COLOR = 0x007777; // dimmed turquoise for flanks
    const SPHERE_RADIUS = 0.25;
    const BOND_HINT_RADIUS = 0.04;

    // Atom spheres
    for (const idx of atomIndices) {
        const a = atoms[idx];
        const isFlank = a.residue_id === 'flank';
        const color = isFlank ? HINT_FLANK_COLOR : HINT_COLOR;

        const geom = new THREE.SphereGeometry(SPHERE_RADIUS, 12, 8);
        const mat = new THREE.MeshPhongMaterial({
            color,
            transparent: true,
            opacity: isFlank ? 0.4 : 0.6,
            depthWrite: false,
            emissive: color,
            emissiveIntensity: 0.5,
        });
        const sphere = new THREE.Mesh(geom, mat);
        sphere.position.set(a.x, a.y, a.z);
        scene.add(sphere);
        hintMeshes.push(sphere);
    }

    // Bond cylinders (level 2 only)
    for (const [i, j] of bonds) {
        const a1 = atoms[i];
        const a2 = atoms[j];
        const isFlank = a1.residue_id === 'flank' && a2.residue_id === 'flank';
        const color = isFlank ? HINT_FLANK_COLOR : HINT_COLOR;

        const p1 = new THREE.Vector3(a1.x, a1.y, a1.z);
        const p2 = new THREE.Vector3(a2.x, a2.y, a2.z);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        if (len < 0.001) continue;

        const geom = new THREE.CylinderGeometry(BOND_HINT_RADIUS, BOND_HINT_RADIUS, len, 6);
        const mat = new THREE.MeshPhongMaterial({
            color,
            transparent: true,
            opacity: isFlank ? 0.3 : 0.5,
            depthWrite: false,
            emissive: color,
            emissiveIntensity: 0.4,
        });
        const cyl = new THREE.Mesh(geom, mat);
        cyl.position.copy(mid);
        cyl.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.normalize()
        );
        scene.add(cyl);
        hintMeshes.push(cyl);
    }
}

function showBackboneHintKendrew(puzzle, level) {
    const { atomIndices, bonds } = getBackboneSubset(puzzle, level);
    const group = seventies.buildKendrewHint(puzzle.atoms, atomIndices, bonds, level === 1);
    for (const mesh of [...group.children]) {
        scene.add(mesh);
        hintMeshes.push(mesh);
    }
}

function onBackboneHint() {
    if (gameState !== 'PLAYING') return;
    if (hintLevel >= 2) return;
    if (!currentPuzzle) return;

    const newLevel = hintLevel + 1;

    if (gameMode === 'daily') {
        // Costs one of the 5 daily actions
        if (dailyGuessesRemaining <= 0) return;
        dailyGuessesRemaining--;
        dailyGuessHistory.push({ type: 'hint', level: newLevel });
        updateGuessIndicators();

        if (dailyGuessesRemaining <= 0) {
            // Used all guesses — loss
            setAAButtonsEnabled(false);
            highlightAAButton(dailyAnswer, 'answer');
            hintLevel = newLevel;
            showBackboneHint(currentPuzzle, hintLevel);
            updateHintButton();
            endDailyGame(false);
            return;
        }
    } else if (gameMode === 'time-attack') {
        const cost = HINT_COST_TA[hintLevel]; // hintLevel is 0 or 1 before increment
        taBarValue = Math.max(0, taBarValue - cost);
        updateTABarDisplay();
        showTimeDelta(-cost);
        if (taBarValue <= 0) {
            hintLevel = newLevel;
            showBackboneHint(currentPuzzle, hintLevel);
            updateHintButton();
            endTimeAttack();
            return;
        }
    } else {
        // Practice mode: accumulate score deduction
        hintScoreDeduction += HINT_COST_PRACTICE;
    }

    hintLevel = newLevel;
    showBackboneHint(currentPuzzle, hintLevel);
    updateHintButton();
}

function updateHintButton() {
    if (!hintBtn) return;

    // Disabled when not playing or already at max level
    if (gameState !== 'PLAYING' || hintLevel >= 2) {
        hintBtn.disabled = true;
    } else {
        hintBtn.disabled = false;
    }

    // Update cost label per mode
    if (hintCost) {
        if (gameMode === 'daily') {
            hintCost.textContent = '(costs 1 guess)';
        } else if (gameMode === 'time-attack') {
            const cost = HINT_COST_TA[hintLevel] || HINT_COST_TA[0];
            hintCost.textContent = `(-${cost})`;
        } else {
            hintCost.textContent = '(-300 pts)';
        }
    }
}

// === 70's Mode (stacked contour sheets) ===

function buildSeventiesMode(puzzle) {
    clearSeventiesMode();
    const isTarget = puzzle.atoms.map(a => a.residue_id === 'target');
    seventiesGroup = seventies.buildContourSheets(puzzle.meshes, puzzle.atoms, isTarget, RESOLUTION_STEPS);
    seventiesGroup.visible = (viewMode === 'seventies');
    scene.add(seventiesGroup);
}

function clearSeventiesMode() {
    if (!seventiesGroup) return;
    seventies.disposeGroup(seventiesGroup);
    scene.remove(seventiesGroup);
    seventiesGroup = null;
}

function toggleViewMode() {
    viewMode = viewMode === 'normal' ? 'seventies' : 'normal';
    scene.background.set(viewMode === 'seventies' ? seventies.SEVENTIES_BG_COLOR : NORMAL_BG_COLOR);

    // Toggle visibility: hide density wireframes, show contour sheets (or vice versa)
    const resKey = RESOLUTION_STEPS[currentResIndex];
    Object.values(densityMeshes).forEach(mesh => { mesh.visible = false; });
    if (seventiesGroup) {
        seventiesGroup.visible = (viewMode === 'seventies');
        seventiesGroup.children.forEach(g => { g.visible = false; });
    }

    if (viewMode === 'normal') {
        if (densityMeshes[resKey]) densityMeshes[resKey].visible = true;
    } else {
        if (seventiesGroup) {
            const sub = seventiesGroup.getObjectByName(`seventies_${resKey}`);
            if (sub) sub.visible = true;
        }
    }

    // Update button appearance
    if (viewModeBtn) {
        viewModeBtn.classList.toggle('active', viewMode === 'seventies');
        viewModeBtn.textContent = viewMode === 'seventies' ? "70's ON" : "70's";
    }

    // A 70's reveal stays on screen; with 70's off it shows as an old, worn model.
    revealWear?.set(viewMode === 'normal', { instant: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
}

// === UI Updates ===
function updateRoundDisplay() {
    roundNumber_el.textContent = roundNumber;
    statRound.textContent = `${roundNumber} / ${ROUNDS_PER_GAME}`;
}

function updateResolutionDisplay() {
    const resKey = RESOLUTION_STEPS[currentResIndex];
    resolutionValue.textContent = RESOLUTION_LABELS[resKey] || '--';

    // Update step indicators
    const steps = resolutionSteps.querySelectorAll('.step');
    steps.forEach((step, i) => {
        step.classList.remove('active', 'revealed');
        if (i < currentResIndex) step.classList.add('revealed');
        if (i === currentResIndex) step.classList.add('active');
    });

    // Update improve cost label for time-attack (cost varies by step)
    if (gameMode === 'time-attack' && improveCost) {
        const cost = TA_IMPROVE_COSTS[currentResIndex] || TA_IMPROVE_COSTS[0];
        improveCost.textContent = `(-${cost})`;
    }
}

function updateStats() {
    statScore.textContent = totalScore;
    if (practiceScore) practiceScore.textContent = totalScore;
    statRound.textContent = `${roundNumber} / ${ROUNDS_PER_GAME}`;
    statCorrect.textContent = correctCount;

    // Update live stars
    const stars = getStarCount(totalScore);
    const spans = liveStars.querySelectorAll('span');
    spans.forEach((span, i) => {
        span.className = i < stars ? 'star-earned' : '';
        span.innerHTML = '&#9733;';
    });
}

function startSessionTimer() {
    sessionStartTime = Date.now();
    sessionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        statTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopSessionTimer() {
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
}

// === Leaderboard ===
function saveScore(adjustedScore, stars, diff) {
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) { scores = []; }

    scores.push({
        score: adjustedScore,
        stars,
        difficulty: diff,
        correct: correctCount,
        rounds: roundHistory.length,
        date: new Date().toISOString(),
    });

    // Keep top 20
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function updateLeaderboard() {
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) { scores = []; }

    if (scores.length === 0) {
        leaderboardBody.innerHTML = '<tr><td colspan="4" style="color: #999;">No scores yet</td></tr>';
        return;
    }

    leaderboardBody.innerHTML = scores.slice(0, 10).map((s, i) => {
        const starStr = [1, 2, 3].map(n =>
            `<span class="${n <= s.stars ? 'star-earned' : ''}" style="color: ${n <= s.stars ? '#cc9900' : '#ccccaa'}">&#9733;</span>`
        ).join('');
        const diffLabel = s.difficulty ? s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1) : '';
        return `<tr>
            <td>${i + 1}</td>
            <td>${diffLabel}</td>
            <td>${s.score}</td>
            <td>${starStr}</td>
        </tr>`;
    }).join('');
}

// === Analysis Status Polling ===
function pollAnalysisStatus() {
    const url = window.DENSITY_GAME_DATA.check_status_url;
    if (!url) return;

    function check() {
        fetch(url)
            .then(r => r.json())
            .then(data => {
                if (data.status === 'SUCCESS') {
                    analysisProgressEl.classList.add('results-ready');
                    progressLabel.textContent = 'Analysis complete!';
                    progressLink.innerHTML = `<a href="${data.redirect_url || window.DENSITY_GAME_DATA.results_url}">View Results &rarr;</a>`;
                    miniProgressBar.style.width = '100%';
                } else if (data.status === 'RUNNING' || data.status === 'PENDING') {
                    const pct = data.progress || 0;
                    miniProgressBar.style.width = pct + '%';
                    progressLabel.textContent = data.status_text || 'Analysis running...';
                    setTimeout(check, 5000);
                } else if (data.status === 'FAILURE' || data.status === 'CANCELLED') {
                    progressLabel.textContent = data.status_text || 'Analysis failed';
                    miniProgressBar.style.width = '100%';
                } else {
                    setTimeout(check, 5000);
                }
            })
            .catch(() => setTimeout(check, 10000));
    }
    check();
}

// === Daily Mode ===

function getDailyDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDailyDateSeed() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function getDailyPuzzleEntry() {
    if (!manifest) return null;
    const seed = getDailyDateSeed();
    const targetAA = ALL_AMINO_ACIDS[dailyAminoAcidIndex(getDailyDateString())].code;

    // Find puzzles for this AA
    const available = manifest.puzzles.filter(p => p.amino_acid === targetAA);
    if (available.length === 0) return null;

    // Rotamer by frequency, from the date seed so every player gets the same puzzle
    const rng = mulberry32(seed);
    return pickRotamer(available, rng());
}

function loadDailyState() {
    try {
        const data = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY));
        if (data) return data;
    } catch (e) {}
    return {
        lastPlayed: null,
        lastResult: null,
        currentStreak: 0,
        maxStreak: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        guessDistribution: [0, 0, 0, 0, 0],
    };
}

function saveDailyState(state) {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
}

function switchMode(mode) {
    gameMode = mode;

    // Update tab styles
    modeTabs.querySelectorAll('.mp-density-mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Show/hide mode-specific panels
    document.querySelectorAll('.daily-only').forEach(el => {
        el.style.display = mode === 'daily' ? '' : 'none';
    });
    document.querySelectorAll('.practice-only').forEach(el => {
        el.style.display = mode === 'practice' ? '' : 'none';
    });
    document.querySelectorAll('.time-attack-only').forEach(el => {
        el.style.display = mode === 'time-attack' ? '' : 'none';
    });

    // Update improve button text
    if (mode === 'daily') {
        improveCost.textContent = '(costs 1 guess)';
    } else if (mode === 'time-attack') {
        improveCost.textContent = `(-${TA_IMPROVE_COSTS[currentResIndex] || TA_IMPROVE_COSTS[0]})`;
    } else {
        improveCost.textContent = '(-200 pts)';
    }

    // Hide life bar when not in time-attack
    if (taLifeBar) taLifeBar.classList.remove('active');

    // Reset to idle state
    gameState = 'IDLE';
    clearScene();
    stopSessionTimer();
    stopTATimer();
    revealOverlay.classList.add('d-none');
    completeOverlay.classList.add('d-none');
    dailyResultOverlay.classList.add('d-none');
    instructionsOverlay.classList.remove('d-none');
    difficultySelect.disabled = false;
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

    // Reset daily state
    dailyGuessesRemaining = DAILY_GUESSES;
    dailyGuessHistory = [];
    dailyGuessedAAs = new Set();
    dailyCompleted = false;
    dailyTimer.reset();

    // Reset hint state
    hintLevel = 0;
    hintScoreDeduction = 0;
    helpBought = new Set();
    hintBtn.disabled = true;
    updateHintButton();
    emitRound();  // help bought in the old mode no longer applies

    // Update instructions overlay content
    updateInstructionsOverlay();

    // Populate AA grid
    populateAAGrid();

    // Mode-specific setup
    if (mode === 'daily') {
        updateDailySidebarStats();
        updateGuessIndicators();
        if (manifest) checkAndRestoreDaily();
    } else if (mode === 'time-attack') {
        updateTALeaderboard();
    }
}

function updateInstructionsOverlay() {
    if (gameMode === 'daily') {
        instructionsOverlay.innerHTML = `
            <h4>AA.ID.LE</h4>
            <p style="font-size: 0.8rem; color: #999; margin-bottom: 0.5rem;">Daily Puzzle</p>
            <p>One puzzle per day, same for everyone.<br>
            Identify the central residue of an Ala-X-Ala tripeptide from its electron density.</p>
            <p>5 actions &mdash; each guess, resolution improvement, or backbone hint costs one.</p>
            <button class="mp-game-btn mp-game-btn-primary" id="startBtn" style="margin-top: 0.5rem; padding: 0.5rem 1.5rem;">
                Play Today's Puzzle
            </button>`;
    } else if (gameMode === 'time-attack') {
        instructionsOverlay.innerHTML = `
            <h4>AA.ID.LE</h4>
            <p style="font-size: 0.8rem; color: #999; margin-bottom: 0.5rem;">Time Attack</p>
            <p>Identify as many amino acids as you can before the life bar runs out!<br>
            The bar drains faster each round. All puzzles begin at 3.5&#197;.</p>
            <p>Correct: <span style="color: #44cc44;">+${TA_CORRECT_BONUS}</span> &nbsp;
            Wrong: <span style="color: #ff4444;">&minus;${TA_WRONG_PENALTY}</span> &nbsp;
            Improve: <span style="color: #cc9900;">&minus;${TA_IMPROVE_COSTS[0]}&ndash;${TA_IMPROVE_COSTS[TA_IMPROVE_COSTS.length - 1]}</span> &nbsp;
            Hint: <span style="color: #00cccc;">&minus;${HINT_COST_TA[0]}&ndash;${HINT_COST_TA[1]}</span></p>
            <div style="margin-top: 0.5rem;">
                <select class="mp-density-difficulty-select" id="overlayDifficultySelect">
                    <option value="easy">Easy (6 amino acids)</option>
                    <option value="medium">Medium (14 amino acids)</option>
                    <option value="hard">Hard (all 20)</option>
                </select>
            </div>
            <button class="mp-game-btn mp-game-btn-primary" id="startBtn" style="margin-top: 0.5rem; padding: 0.5rem 1.5rem;">
                Start Time Attack
            </button>`;
        const overlayDiffSelect = document.getElementById('overlayDifficultySelect');
        if (overlayDiffSelect) {
            overlayDiffSelect.value = difficulty;
            overlayDiffSelect.addEventListener('change', (e) => {
                difficulty = e.target.value;
                if (taDifficultySelect) taDifficultySelect.value = difficulty;
                populateAAGrid();
            });
        }
    } else {
        instructionsOverlay.innerHTML = `
            <h4>AA.ID.LE</h4>
            <p style="font-size: 0.8rem; color: #999; margin-bottom: 0.5rem;">Practice Mode</p>
            <p>Identify the central residue of an Ala-X-Ala tripeptide from its electron density!<br>
            10 rounds with scoring based on speed and resolution.</p>
            <p>Guess early for more points &mdash; or use resolution improvements and backbone hints to see more detail.</p>
            <div style="margin-top: 0.5rem;">
                <select class="mp-density-difficulty-select" id="overlayDifficultySelect">
                    <option value="easy">Easy (6 amino acids)</option>
                    <option value="medium">Medium (14 amino acids)</option>
                    <option value="hard">Hard (all 20)</option>
                </select>
            </div>
            <button class="mp-game-btn mp-game-btn-primary" id="startBtn" style="margin-top: 0.5rem; padding: 0.5rem 1.5rem;">
                Start Game
            </button>`;
        // Sync overlay difficulty select with sidebar select
        const overlayDiffSelect = document.getElementById('overlayDifficultySelect');
        if (overlayDiffSelect) {
            overlayDiffSelect.value = difficulty;
            overlayDiffSelect.addEventListener('change', (e) => {
                difficulty = e.target.value;
                if (difficultySelect) difficultySelect.value = difficulty;
                populateAAGrid();
            });
        }
    }
    // Re-bind start button
    startBtn = document.getElementById('startBtn');
    startBtn.addEventListener('click', onStartGame);
}

function checkAndRestoreDaily() {
    const state = loadDailyState();
    const today = getDailyDateString();

    if (state.lastPlayed === today && state.lastResult) {
        // Already played today - show results
        instructionsOverlay.classList.add('d-none');
        showDailyResult(state.lastResult, state);
    }
}

function onStartDaily() {
    if (!manifest || manifest.puzzles.length === 0) {
        alert('Puzzle data not loaded. The management command may need to be run first.');
        return;
    }

    const today = getDailyDateString();
    const state = loadDailyState();

    if (state.lastPlayed === today) {
        // Already played today - show results
        instructionsOverlay.classList.add('d-none');
        showDailyResult(state.lastResult, state);
        return;
    }

    const entry = getDailyPuzzleEntry();
    if (!entry) {
        alert('No puzzle available for today.');
        return;
    }

    dailyPuzzleEntry = entry;
    dailyDateStr = getDailyDateString();
    dailyGuessesRemaining = DAILY_GUESSES;
    dailyGuessHistory = [];
    dailyGuessedAAs = new Set();
    dailyWon = false;
    dailyCompleted = false;
    currentResIndex = 0;
    hintLevel = 0;
    hintScoreDeduction = 0;
    helpBought = new Set();

    instructionsOverlay.classList.add('d-none');
    dailyResultOverlay.classList.add('d-none');
    clearScene();

    gameState = 'LOADING';
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;

    updateGuessIndicators();
    updateResolutionDisplay();

    loadPuzzle(entry).then(puzzle => {
        currentPuzzle = puzzle;
        dailyAnswer = puzzle.amino_acid;
        buildDensityMeshes(puzzle);
        buildSeventiesMode(puzzle);
        showResolution(0);
        gameState = 'PLAYING';
        dailyTimer.reset();
        if (!document.hidden) dailyTimer.start();
        emitRound();

        populateAAGrid();
        setAAButtonsEnabled(true);
        improveBtn.disabled = (currentResIndex >= RESOLUTION_STEPS.length - 1);
        updateHintButton();
    }).catch(err => {
        console.error('Failed to load daily puzzle:', err);
        alert('Failed to load today\'s puzzle.');
    });
}

function onDailyGuess(guessCode) {
    if (gameState !== 'PLAYING' || dailyCompleted) return;
    if (dailyGuessedAAs.has(guessCode)) return;

    dailyGuessedAAs.add(guessCode);
    dailyGuessesRemaining--;

    const isCorrect = guessCode === dailyAnswer;
    dailyGuessHistory.push({ type: 'guess', code: guessCode, correct: isCorrect });

    if (isCorrect) {
        highlightAAButton(guessCode, 'correct');
        updateGuessIndicators();
        endDailyGame(true);
    } else {
        highlightAAButton(guessCode, 'wrong');
        updateGuessIndicators();

        if (dailyGuessesRemaining <= 0) {
            highlightAAButton(dailyAnswer, 'answer');
            endDailyGame(false);
        } else {
            // Continue playing - disable the guessed button
            disableGuessedAAs();
        }
    }
}

function onDailyImprove() {
    if (gameState !== 'PLAYING' || dailyCompleted) return;
    if (currentResIndex >= RESOLUTION_STEPS.length - 1) return;
    if (dailyGuessesRemaining <= 0) return;

    dailyGuessesRemaining--;
    currentResIndex++;
    dailyGuessHistory.push({ type: 'improve', resolution: RESOLUTION_STEPS[currentResIndex] });

    showResolution(currentResIndex);
    updateResolutionDisplay();
    updateGuessIndicators();

    if (currentResIndex >= RESOLUTION_STEPS.length - 1) {
        improveBtn.disabled = true;
    }
    if (dailyGuessesRemaining <= 0) {
        // Used all guesses on resolution improvements - loss
        setAAButtonsEnabled(false);
        highlightAAButton(dailyAnswer, 'answer');
        endDailyGame(false);
    }
}

function endDailyGame(won) {
    dailyTimer.pause();
    dailyCompleted = true;
    dailyWon = won;
    gameState = 'COMPLETED';
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    hintBtn.disabled = true;

    // Show atomic model
    showAtomicModel(currentPuzzle);
    Object.values(densityMeshes).forEach(mesh => {
        if (mesh.visible) {
            mesh.material.opacity = 0.3;
            mesh.material.transparent = true;
        }
    });

    // Calculate result
    const guessesUsed = DAILY_GUESSES - dailyGuessesRemaining;
    const resKey = RESOLUTION_STEPS[currentResIndex];
    const result = {
        won: won,
        guesses: guessesUsed,
        resolution: resKey,
        answer: dailyAnswer,
        history: dailyGuessHistory,
        ms: Math.round(dailyTimer.elapsedMs()),
    };

    // Update persistent state
    const state = loadDailyState();
    const today = getDailyDateString();

    // Check if yesterday was played (for streak)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    state.gamesPlayed++;
    if (won) {
        state.gamesWon++;
        state.guessDistribution[guessesUsed - 1] = (state.guessDistribution[guessesUsed - 1] || 0) + 1;

        if (state.lastPlayed === yesterdayStr) {
            state.currentStreak++;
        } else {
            state.currentStreak = 1;
        }
    } else {
        state.currentStreak = 0;
    }
    state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
    state.lastPlayed = today;
    state.lastResult = result;
    state.history = (Array.isArray(state.history) ? state.history : [])
        .concat([{ date: today, won, guesses: guessesUsed, ms: result.ms }]).slice(-DAILY_HISTORY_DAYS);

    saveDailyState(state);
    updateDailySidebarStats();
    emitFinished({
        mode: 'daily',
        date: dailyDateStr,
        puzzle: dailyPuzzleEntry.id,
        outcome: won ? 'won' : 'lost',
        ms: result.ms,
        history: dailyGuessHistory,
    });

    // Show result overlay after a short delay
    setTimeout(() => showDailyResult(result, state), 1200);
}

function showDailyResult(result, state) {
    if (!state) state = loadDailyState();

    // Title
    if (result.won) {
        dailyResultTitle.textContent = 'Solved!';
        dailyResultTitle.style.color = '#44cc44';
    } else {
        dailyResultTitle.textContent = 'Not today...';
        dailyResultTitle.style.color = '#ff4444';
    }

    // Answer info
    const aaInfo = ALL_AMINO_ACIDS.find(a => a.code === result.answer);
    const aaName = aaInfo ? `${aaInfo.name} (${aaInfo.one})` : result.answer;
    if (result.won) {
        dailyResultAnswer.textContent = `${aaName} in ${result.guesses}/5 at ${RESOLUTION_LABELS[result.resolution]}`;
    } else {
        dailyResultAnswer.textContent = `The answer was ${aaName}`;
    }

    // Emoji display
    dailyResultEmoji.textContent = generateEmojiLine(result);

    // Stats
    drPlayed.textContent = state.gamesPlayed;
    drWinPct.textContent = state.gamesPlayed > 0 ? Math.round(state.gamesWon / state.gamesPlayed * 100) + '%' : '0%';
    drStreak.textContent = state.currentStreak;
    drMaxStreak.textContent = state.maxStreak;

    const history = Array.isArray(state.history) ? state.history : [];
    dailyTimes.textContent = timesLine(result.ms, timeSummary(history.filter(h => h.won).map(h => h.ms)));
    dailyDistribution.innerHTML = distributionHtml(
        distributionRows(state.guessDistribution, state.gamesPlayed - state.gamesWon, 1),
        result.won ? String(result.guesses) : 'X');
    dailyHistory.innerHTML = historyHtml(history.map(h => ({
        date: h.date, won: h.won, score: h.won ? `${h.guesses}/${DAILY_GUESSES}` : `X/${DAILY_GUESSES}`, ms: h.ms,
    })), HISTORY_ROWS_SHOWN);

    // Show overlay
    showResultPanel(dailyResultOverlay);
    instructionsOverlay.classList.add('d-none');

    // Start countdown
    startCountdown();
}

function generateEmojiLine(result) {
    const emojis = [];
    for (const h of (result.history || [])) {
        if (h.type === 'hint') {
            emojis.push('\uD83E\uDDB4'); // bone
        } else if (h.type === 'guide') {
            emojis.push('\uD83D\uDCD6'); // book
        } else if (h.type === 'improve') {
            emojis.push('\uD83D\uDD2C'); // microscope
        } else if (h.correct) {
            emojis.push('\uD83D\uDFE9'); // green square
        } else {
            emojis.push('\uD83D\uDFE5'); // red square
        }
    }
    // Fill remaining with white square
    while (emojis.length < DAILY_GUESSES) {
        emojis.push('\u2B1C');
    }
    return emojis.join('');
}

function generateShareText(result) {
    const dateStr = getDailyDateString();
    const emojiLine = generateEmojiLine(result);

    if (result.won) {
        return `AA.ID.LE ${dateStr}\n\uD83D\uDFE9 ${result.guesses}/5 at ${RESOLUTION_LABELS[result.resolution]}\n${emojiLine}`;
    } else {
        return `AA.ID.LE ${dateStr}\n\uD83D\uDFE5 X/5\n${emojiLine}`;
    }
}

function copyShare() {
    const state = loadDailyState();
    if (!state.lastResult) return;

    shareResult(generateShareText(state.lastResult), () => {
        shareConfirm.classList.remove('d-none');
        setTimeout(() => shareConfirm.classList.add('d-none'), 2000);
    });
}

function updateGuessIndicators() {
    if (!guessIndicators) return;

    const indicators = [];
    for (let i = 0; i < DAILY_GUESSES; i++) {
        const h = dailyGuessHistory[i];
        let cls = 'guess-dot';
        let content = '';
        if (h) {
            if (h.type === 'hint') {
                cls += ' guess-improve';
                content = '\uD83E\uDDB4';
            } else if (h.type === 'guide') {
                cls += ' guess-improve';
                content = '\uD83D\uDCD6';
            } else if (h.type === 'improve') {
                cls += ' guess-improve';
                content = '\uD83D\uDD2C';
            } else if (h.correct) {
                cls += ' guess-correct';
                content = '\u2713';
            } else {
                cls += ' guess-wrong';
                content = '\u2717';
            }
        } else {
            cls += ' guess-unused';
        }
        indicators.push(`<div class="${cls}">${content}</div>`);
    }
    guessIndicators.innerHTML = indicators.join('');
}

function updateDailySidebarStats() {
    const state = loadDailyState();
    if (dailyStreak_el) dailyStreak_el.textContent = state.currentStreak;
    if (dailyMaxStreak_el) dailyMaxStreak_el.textContent = state.maxStreak;
    if (dailyPlayed_el) dailyPlayed_el.textContent = state.gamesPlayed;
    if (dailyWinPct_el) dailyWinPct_el.textContent = state.gamesPlayed > 0
        ? Math.round(state.gamesWon / state.gamesPlayed * 100) + '%' : '0%';
}

function disableGuessedAAs() {
    const buttons = aaGrid.querySelectorAll('.mp-density-aa-btn');
    buttons.forEach(btn => {
        if (dailyGuessedAAs.has(btn.dataset.code)) {
            btn.classList.add('guessed');
            btn.disabled = true;
        }
    });
}

function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);

    function updateCountdownDisplay() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diff = tomorrow - now;

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        if (dailyCountdown) {
            dailyCountdown.textContent = `Next puzzle in ${hours}h ${mins}m ${secs}s`;
        }
    }

    updateCountdownDisplay();
    countdownTimer = setInterval(updateCountdownDisplay, 1000);
}

// === Time Attack Mode ===

function onStartTimeAttack() {
    if (!manifest || manifest.puzzles.length === 0) {
        alert('Puzzle data not loaded. The management command may need to be run first.');
        return;
    }

    difficulty = taDifficultySelect.value;
    taBarValue = TA_BAR_MAX;
    taRoundsCompleted = 0;
    taCorrectCount = 0;
    taRoundNumber = 0;
    usedAAs = {};
    taRoundHistory = [];

    instructionsOverlay.classList.add('d-none');
    completeOverlay.classList.add('d-none');
    taDifficultySelect.disabled = true;

    // Show the life bar
    taLifeBar.classList.add('active');
    updateTABarDisplay();
    updateTAStats();

    loadNextTAPuzzle();
}

function selectNextTAPuzzle() {
    if (!manifest) return null;
    const allowedAAs = DIFFICULTY_AA[difficulty];
    const available = manifest.puzzles.filter(p => allowedAAs.includes(p.amino_acid));
    if (available.length === 0) return null;

    // Amino acid first (never the previous one when another exists), then rotamer by frequency
    const byAA = {};
    for (const p of available) (byAA[p.amino_acid] ||= []).push(p);
    const lastAA = currentPuzzle ? currentPuzzle.amino_acid : null;
    const aa = pickAminoAcid(Object.keys(byAA), lastAA, Math.random());
    return pickRotamer(byAA[aa], Math.random());
}

function loadNextTAPuzzle() {
    const entry = selectNextTAPuzzle();
    if (!entry) {
        endTimeAttack();
        return;
    }

    taEntry = entry;
    gameState = 'LOADING';
    taTimerPaused = true;  // Pause timer while loading
    taRoundNumber++;
    currentResIndex = 0;
    hintLevel = 0;
    hintScoreDeduction = 0;
    helpBought = new Set();

    clearScene();
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    updateHintButton();
    updateTAStats();
    updateResolutionDisplay();

    // Clear previous guess highlights
    aaGrid.querySelectorAll('.mp-density-aa-btn').forEach(btn => {
        btn.classList.remove('correct', 'wrong', 'answer');
    });

    loadPuzzle(entry).then(puzzle => {
        currentPuzzle = puzzle;
        buildDensityMeshes(puzzle);
        buildSeventiesMode(puzzle);
        showResolution(0);
        gameState = 'PLAYING';
        roundStartTime = Date.now();
        emitRound();
        setAAButtonsEnabled(true);
        improveBtn.disabled = (currentResIndex >= RESOLUTION_STEPS.length - 1);
        updateHintButton();

        // Resume timer (start it on first round)
        taTimerPaused = false;
        taLastTick = Date.now();
        if (!taTimerInterval) {
            startTATimer();
        }
    }).catch(err => {
        console.error('Failed to load time-attack puzzle:', err);
        // Try next puzzle
        loadNextTAPuzzle();
    });
}

function onTimeAttackGuess(guessCode) {
    if (gameState !== 'PLAYING') return;

    gameState = 'REVEAL';
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    hintBtn.disabled = true;
    taTimerPaused = true;  // Pause during reveal

    const correctCode = currentPuzzle.amino_acid;
    const isCorrect = (guessCode === correctCode);
    const isPartial = !isCorrect && isConfusablePair(guessCode, correctCode);

    if (isCorrect) {
        taCorrectCount++;
        taBarValue = Math.min(TA_BAR_MAX, taBarValue + TA_CORRECT_BONUS);
        highlightAAButton(guessCode, 'correct');
        showTimeDelta(TA_CORRECT_BONUS);
        flashBar('correct');
    } else if (isPartial) {
        // Confusable pair: count as correct with partial bonus
        taCorrectCount++;
        taBarValue = Math.min(TA_BAR_MAX, taBarValue + TA_PARTIAL_BONUS);
        highlightAAButton(guessCode, 'correct');
        highlightAAButton(correctCode, 'answer');
        showTimeDelta(TA_PARTIAL_BONUS);
        showAnswerFlash(correctCode);
        flashBar('correct');
    } else {
        taBarValue = Math.max(0, taBarValue - TA_WRONG_PENALTY);
        highlightAAButton(guessCode, 'wrong');
        highlightAAButton(correctCode, 'answer');
        showTimeDelta(-TA_WRONG_PENALTY);
        showAnswerFlash(correctCode);
        flashBar('wrong');
    }

    taRoundsCompleted++;

    taRoundHistory.push({
        puzzle: taEntry.id,
        aa: correctCode,
        guessed: guessCode,
        correct: isCorrect,
        partial: isPartial,
        resolution: RESOLUTION_STEPS[currentResIndex],
        ms: Date.now() - roundStartTime,
        hint: hintLevel,
        guide: helpBought.has('guide'),
    });

    // Brief atomic model flash during reveal
    showAtomicModel(currentPuzzle);
    Object.values(densityMeshes).forEach(mesh => {
        if (mesh.visible) {
            mesh.material.opacity = 0.3;
            mesh.material.transparent = true;
        }
    });

    updateTABarDisplay();
    updateTAStats();

    // Check if bar ran out from penalty
    if (taBarValue <= 0) {
        setTimeout(() => endTimeAttack(), 500);
        return;
    }

    // Auto-advance after brief delay
    setTimeout(() => {
        if (gameState === 'REVEAL' && gameMode === 'time-attack') {
            loadNextTAPuzzle();
        }
    }, TA_ADVANCE_DELAY);
}

function startTATimer() {
    taLastTick = Date.now();
    taTimerInterval = setInterval(updateTATick, TA_TICK_INTERVAL);
}

function stopTATimer() {
    if (taTimerInterval) {
        clearInterval(taTimerInterval);
        taTimerInterval = null;
    }
}

function updateTATick() {
    if (taTimerPaused) {
        taLastTick = Date.now();
        return;
    }

    const now = Date.now();
    const elapsed = (now - taLastTick) / 1000;
    taLastTick = now;

    // Accelerating drain based on rounds completed
    const drainRate = TA_BASE_DRAIN + taRoundsCompleted * TA_ACCEL_PER_ROUND;
    taBarValue = Math.max(0, taBarValue - drainRate * elapsed);
    updateTABarDisplay();

    if (taBarValue <= 0) {
        endTimeAttack();
    }
}

function updateTABarDisplay() {
    if (!taLifeBarFill) return;
    const pct = Math.max(0, Math.min(100, taBarValue));
    taLifeBarFill.style.width = pct + '%';

    // Color classes based on bar percentage
    taLifeBarFill.classList.remove('ta-bar-green', 'ta-bar-yellow', 'ta-bar-red');
    if (pct > 50) {
        taLifeBarFill.classList.add('ta-bar-green');
    } else if (pct > 25) {
        taLifeBarFill.classList.add('ta-bar-yellow');
    } else {
        taLifeBarFill.classList.add('ta-bar-red');
    }
}

function flashBar(type) {
    if (!taLifeBar) return;
    const cls = type === 'correct' ? 'ta-bar-flash-correct' : 'ta-bar-flash-wrong';
    taLifeBar.classList.remove('ta-bar-flash-correct', 'ta-bar-flash-wrong');
    // Force reflow to restart animation
    void taLifeBar.offsetWidth;
    taLifeBar.classList.add(cls);
    setTimeout(() => taLifeBar.classList.remove(cls), 500);
}

function showTimeDelta(amount) {
    const el = document.createElement('div');
    el.className = `ta-time-delta ${amount > 0 ? 'ta-delta-plus' : 'ta-delta-minus'}`;
    el.textContent = amount > 0 ? `+${amount}` : `${amount}`;
    canvasContainer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function showAnswerFlash(correctCode) {
    const aaInfo = ALL_AMINO_ACIDS.find(a => a.code === correctCode);
    if (!aaInfo) return;
    const el = document.createElement('div');
    el.className = 'ta-answer-flash';
    el.textContent = `${aaInfo.name} (${aaInfo.one})`;
    canvasContainer.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function updateTAStats() {
    if (taScore_el) taScore_el.textContent = taCorrectCount;
    if (taRound_el) taRound_el.textContent = taRoundNumber;
}

function endTimeAttack() {
    if (gameState === 'PLAYING') {
        taRoundHistory.push({
            puzzle: taEntry.id,
            aa: currentPuzzle.amino_acid,
            guessed: null,
            correct: false,
            partial: false,
            resolution: RESOLUTION_STEPS[currentResIndex],
            ms: Date.now() - roundStartTime,
            hint: hintLevel,
            guide: helpBought.has('guide'),
        });
    }
    gameState = 'COMPLETED';
    stopTATimer();
    taTimerPaused = true;
    taBarValue = 0;
    updateTABarDisplay();
    if (taLifeBar) taLifeBar.classList.remove('active');
    setAAButtonsEnabled(false);
    improveBtn.disabled = true;
    hintBtn.disabled = true;

    const multiplier = DIFFICULTY_MULTIPLIER[difficulty];
    const adjustedScore = Math.round(taCorrectCount * multiplier * 10) / 10;

    // Show completion overlay
    completionStars.innerHTML = '';  // No stars for time attack
    completionScore.textContent = `${taCorrectCount} correct`;
    completionDetails.textContent = `${taRoundNumber} rounds | ${difficulty} (${multiplier}x) = ${adjustedScore} leaderboard pts`;

    showResultPanel(completeOverlay);
    revealOverlay.classList.add('d-none');

    // Save score
    saveTAScore(adjustedScore, taCorrectCount, difficulty, taRoundNumber);
    updateTALeaderboard();
    emitFinished({ mode: 'time-attack', difficulty, score: taCorrectCount, rounds: taRoundHistory });
}

function saveTAScore(adjustedScore, correct, diff, rounds) {
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem(TA_STORAGE_KEY) || '[]');
    } catch (e) { scores = []; }

    scores.push({
        score: adjustedScore,
        correct,
        difficulty: diff,
        rounds,
        date: new Date().toISOString(),
    });

    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 20);
    localStorage.setItem(TA_STORAGE_KEY, JSON.stringify(scores));
}

function updateTALeaderboard() {
    if (!taLeaderboardBody) return;
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem(TA_STORAGE_KEY) || '[]');
    } catch (e) { scores = []; }

    if (scores.length === 0) {
        taLeaderboardBody.innerHTML = '<tr><td colspan="4" style="color: #999;">No scores yet</td></tr>';
        return;
    }

    taLeaderboardBody.innerHTML = scores.slice(0, 10).map((s, i) => {
        const diffLabel = s.difficulty ? s.difficulty.charAt(0).toUpperCase() + s.difficulty.slice(1) : '';
        return `<tr>
            <td>${i + 1}</td>
            <td>${diffLabel}</td>
            <td>${s.score}</td>
            <td>${s.correct}/${s.rounds}</td>
        </tr>`;
    }).join('');
}

// === Bootstrap ===
document.addEventListener('DOMContentLoaded', init);
