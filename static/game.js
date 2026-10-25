/**
 * Kano Beat — static/game.js
 * ---------------------------------------------------------------------------
 * Classic script (NO import/export) so the game also works from `file://`.
 *
 * A faithful reskin of arcxingye/EatKano's static/index.js (MIT):
 *   - jQuery / CreateJS / JSEncrypt are gone; querySelector helpers instead.
 *   - `document.write` is gone; index.html owns the markup (CONTRACT.md §2).
 *   - Audio goes through window.KanoAudio (static/audio.js).
 *   - The original's random-walk tile placement, its `_ttreg` / `_clearttClsReg`
 *     class juggling, its CPS guard, its `time-over` anti-cheat and even its
 *     `bast-score` cookie typo are preserved deliberately — this is a reskin,
 *     not a redesign.
 *
 * Exposes window.KanoGame exactly as frozen in CONTRACT.md §3.
 */
(function (w, d) {
    'use strict';

    var VERSION = '1.0.0';

    var MODE_NORMAL = 1,
        MODE_ENDLESS = 2,
        MODE_PRACTICE = 3;

    /* ------------------------------------------------------------------ *
     * Tiny DOM helpers (one definition, used everywhere)
     * ------------------------------------------------------------------ */

    var $ = function (sel, root) { return (root || d).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); };
    var byId = function (id) { return d.getElementById(id); };

    function setDisplay(el, value) {
        if (el) el.style.display = value;
    }

    /* ------------------------------------------------------------------ *
     * i18n — fetch -> XHR -> embedded English defaults
     * ------------------------------------------------------------------ */

    var DEFAULT_I18N = {
        'lang': 'en',
        'start': 'Start',
        'normal': 'Normal',
        'endless': 'Endless',
        'practice': 'Practice',
        'settings': 'Settings',
        'img-before': 'Img-before',
        'img-after': 'Img-after',
        'sound-on': 'Sound: on',
        'sound-off': 'Sound: off',
        'title': 'Title',
        'time': 'Time',
        'key': 'Key',
        'ok': 'OK',
        'eat-kano': 'Kano Beat',
        'default-dfjk': 'DFJK by default',
        'default-20s': '20 seconds by default',
        'game-title': 'Kano Beat',
        'game-intro1': 'Start from the bottom lane',
        'game-intro2': 'How many can you tap?',
        'time-up': 'Time up',
        'calculating': 'Wait...',
        'score': 'Score',
        'best': 'Best',
        'again': 'Again',
        'home': 'Home',
        'text-level-1': 'Try again?',
        'text-level-2': 'Not bad',
        'text-level-3': 'Nice',
        'text-level-4': 'Awesome',
        'text-level-5': 'R U kidding?',
        'time-over': "You've cheated for ",
        'record': 'Records',
        'records-title': 'Local Records',
        'records-empty': 'No records yet. Play a round!',
        'records-clear': 'Clear',
        'records-cleared': 'Records cleared',
        'no-records': '\u2014',
        'kickoff': 'Tap the highlighted tile to start',
        'combo': 'Combo',
        'max-combo': 'Max Combo',
        'hits': 'Hits',
        'misses': 'Misses',
        'accuracy': 'Accuracy',
        'mode-desc-normal': '20 seconds. Score as many as you can.',
        'mode-desc-endless': 'One wrong tile ends the run. Scored on CPS.',
        'mode-desc-practice': 'No game over. Misses just flash.',
        'a11y-board': 'Game board, 4 lanes',
        'a11y-hint': 'Press D, F, J, K or tap a lane to hit the highlighted tile.'
    };

    // A *copy* of the defaults: the live dictionary is mutated as locale files
    // arrive, while DEFAULT_I18N stays the pristine fallback.
    var I18N = {};
    for (var dk in DEFAULT_I18N) {
        if (Object.prototype.hasOwnProperty.call(DEFAULT_I18N, dk)) I18N[dk] = DEFAULT_I18N[dk];
    }

    /** Never crash on a missing key — fall back to the key name itself. */
    function t(key) {
        if (key == null) return '';
        return Object.prototype.hasOwnProperty.call(I18N, key) && I18N[key] != null ? String(I18N[key]) : String(key);
    }

    function pickLang() {
        try {
            var lang = (navigator.language || navigator.userLanguage || 'en').toString();
            if (/^zh\b/i.test(lang)) return 'zh';
            if (/^ja\b/i.test(lang)) return 'ja';
            return 'en';
        } catch (e) {
            return 'en';
        }
    }

    function fetchJSON(url) {
        return new Promise(function (resolve, reject) {
            var f;
            try {
                if (typeof w.fetch !== 'function') { reject(new Error('no fetch')); return; }
                f = w.fetch(url, { cache: 'no-store' });
            } catch (e) { reject(e); return; }
            if (!f || typeof f.then !== 'function') { reject(new Error('bad fetch')); return; }
            f.then(function (res) {
                if (!res || !res.ok) throw new Error('http ' + (res && res.status));
                return res.json();
            }).then(resolve, reject);
        });
    }

    /** `file://` blocks fetch, but Chrome still allows XHR for sibling files. */
    function xhrJSON(url) {
        return new Promise(function (resolve, reject) {
            var xhr;
            try { xhr = new XMLHttpRequest(); } catch (e) { reject(e); return; }
            var settled = false;
            function done(fn, arg) { if (!settled) { settled = true; fn(arg); } }
            try {
                xhr.open('GET', url, true);
                xhr.onload = function () {
                    var ok = (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300));
                    if (!ok || !xhr.responseText) { done(reject, new Error('xhr ' + xhr.status)); return; }
                    try {
                        done(resolve, JSON.parse(xhr.responseText));
                    } catch (e) { done(reject, e); }
                };
                xhr.onerror = function () { done(reject, new Error('xhr error')); };
                xhr.send();
            } catch (e) { done(reject, e); }
        });
    }

    var i18nLoaded = false;

    /**
     * Last-resort locale loader that works under `file://`.
     *
     * When index.html is opened by double-clicking it, the origin is opaque, so:
     *   - fetch('file:///...json')  -> blocked by CORS
     *   - XMLHttpRequest('file://') -> blocked by CORS
     *   - <script src="file:///...">  -> ALSO blocked (Chrome treats every file as a
     *     distinct opaque origin, so it is a cross-origin script load)
     * Injecting the JSON as an inline script has no URL and therefore no origin,
     * so it is the only load path left. We fetch the sibling index.html (same-
     * directory `file://` XHR is allowed), lift the locale out of the copy we
     * baked there, and eval it. If even that fails, the embedded English defaults
     * below keep the game fully playable.
     */
    function inlineScriptEval(source) {
        var script;
        try {
            script = d.createElement('script');
            script.textContent = source;
            (d.head || d.documentElement).appendChild(script);
            if (script.parentNode) script.parentNode.removeChild(script);
            return true;
        } catch (e) {
            return false;
        }
    }

    /** Pull the baked `<script id="i18n-utf8" type="application/json">` payload
     *  out of index.html. Returns an object, or null when unavailable. */
    function readBakedLocale(lang) {
        // Fast path: the marker spans the whole of index.html and static/game.js,
        // so when neither is the file being served there is nothing to do.
        if (d.getElementById('i18n-utf8')) {
            try {
                var inline = JSON.parse(d.getElementById('i18n-utf8').textContent);
                if (inline && inline[lang]) return JSON.parse(inline[lang]);
            } catch (e) { /* fall through to the XHR path */ }
        }
        try {
            var xhr = new XMLHttpRequest();
            var text = null;
            xhr.open('GET', 'index.html', false);   // sync: only reached under file://
            xhr.send(null);
            if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) text = xhr.responseText;
            if (!text) return null;
            var m = /<script[^>]*id=["']i18n-utf8["'][^>]*>([\s\S]*?)<\/script>/i.exec(text);
            if (!m) return null;
            var payload = JSON.parse(m[1]);
            return (payload && payload[lang]) ? JSON.parse(payload[lang]) : null;
        } catch (e) {
            return null;
        }
    }

    function loadI18N() {
        var lang = pickLang();
        var url = './static/i18n/' + lang + '.json';
        // Ordered by what each environment actually permits:
        //   http(s)  -> fetch, then XHR, then the baked inline copy
        //   file://  -> fetch and XHR are refused; the baked inline copy is the
        //               only path that works, rather than merely a slow fallback.
        var isFile = false;
        try { isFile = (w.location && w.location.protocol === 'file:'); } catch (e) { isFile = false; }

        var chain;
        if (isFile) {
            chain = Promise.resolve()
                .then(function () { return readBakedLocale(lang); })
                .then(function (data) {
                    if (data) return data;
                    return fetchJSON(url).catch(function () { return xhrJSON(url); });
                });
        } else {
            chain = fetchJSON(url)
                .catch(function () { return xhrJSON(url); })
                .catch(function () { return readBakedLocale(lang); });
        }
        return chain
            .then(function (data) {
                if (data && typeof data === 'object') {
                    for (var k in data) {
                        if (Object.prototype.hasOwnProperty.call(data, k) && data[k] != null) I18N[k] = data[k];
                    }
                }
                i18nLoaded = true;
                applyI18N();
            })
            .catch(function () {
                // Every transport failed (offline / missing file):
                // the embedded English defaults keep the game fully playable.
                i18nLoaded = false;
                applyI18N();
            });
    }

    function applyI18N() {
        try {
            $$('[data-i18n]').forEach(function (el) {
                el.textContent = t(el.getAttribute('data-i18n'));
            });
            $$('[data-placeholder-i18n]').forEach(function (el) {
                el.setAttribute('placeholder', t(el.getAttribute('data-placeholder-i18n')));
            });
            if (I18N['lang']) d.documentElement.setAttribute('lang', String(I18N['lang']));

            // The document title honours a player-chosen title (the Settings
            // "Title" field, persisted in the `title` cookie) and otherwise falls
            // back to the localised game name. The original applied the custom
            // title to <title> as well as the tab; doing only the former left the
            // tab reading "Kano Beat" after a reload even though the saved title
            // had been restored into the input.
            setPageTitle();

            // Labels the JS owns (not covered by data-i18n attributes).
            var board = byId('GameLayerBG');
            if (board) board.setAttribute('aria-label', t('a11y-board'));
            var hint = byId('a11y-hint');
            if (hint) hint.textContent = t('a11y-hint');

            var soundEl = byId('sound');
            if (soundEl) soundEl.textContent = soundMode === 'on' ? t('sound-on') : t('sound-off');

            var modeEl = byId('mode');
            if (modeEl) modeEl.textContent = modeToString(mode);

            var modeDesc = byId('mode-desc');
            if (modeDesc) modeDesc.textContent = t(modeDescKey(mode));

            renderRecords();
            updatePanel();
        } catch (e) { /* i18n must never break gameplay */ }
    }

    /**
     * Player-chosen document title (the Settings "Title" field, persisted in the
     * `title` cookie). '' means "no custom title" -> use the localised game name.
     * Declared here so setPageTitle() and save_cookie() share one source.
     */
    var initTitle = '';

    /**
     * Apply the document title: the player's saved custom title when there is
     * one, otherwise the localised game name ("Kano Beat" / "カノビート" /
     * "卡诺节拍"). Called from applyI18N() (locale may arrive after boot) and
     * from initSetting() (the `title` cookie is read there).
     */
    function setPageTitle() {
        try {
            var titleEl = $('title');
            if (!titleEl) return;
            // `initTitle` is the last-known-good value: set by save_cookie() when
            // the player saves a custom title, and kept in sync by initSetting().
            // Reading it first avoids re-reading the cookie on every locale
            // refresh. Falls back to the cookie, then to the localised name.
            var custom = initTitle;
            if (typeof custom !== 'string' || !custom.trim()) {
                var c = cookie('title');
                custom = (typeof c === 'string' && c.trim()) ? c : '';
            }
            initTitle = custom;
            titleEl.textContent = custom ? custom : t('eat-kano');
        } catch (e) { /* a title must never break the game */ }
    }

    /* ------------------------------------------------------------------ *
     * Cookies + localStorage, everything guarded
     * ------------------------------------------------------------------ */

    function escapeCookie(v) {
        try { return encodeURIComponent(v); } catch (e) { return String(v); }
    }
    function unescapeCookie(v) {
        try { return decodeURIComponent(v); } catch (e) { return v; }
    }

    /** cookie(name[, value[, days]]) — same signature the original used. */
    function cookie(name, value, time) {
        try {
            if (name) {
                if (typeof value !== 'undefined' && value !== null && value !== '') {
                    var expires = '';
                    if (time) {
                        var date = new Date();
                        date.setTime(date.getTime() + 864e5 * time);
                        expires = '; expires=' + date.toUTCString();
                    }
                    d.cookie = name + '=' + escapeCookie(typeof value === 'object' ? JSON.stringify(value) : value) + expires + '; path=/';
                    return true;
                }
                var m = d.cookie.match(new RegExp('(?:^|;)\\s*' + name.replace(/([-.*+?^${}()|[\]\/\\])/g, '\\$1') + '=([^;]*)'));
                if (!m || typeof m[1] !== 'string') return false;
                var raw = unescapeCookie(m[1]);
                if (/^[0-9]+(\.[0-9]+)?$/.test(raw)) return parseFloat(raw);
                return raw;
            }
            var data = {};
            d.cookie.replace(/\s/g, '').split(';').forEach(function (pair) {
                var kv = pair.split('=');
                if (kv[1]) data[kv[0]] = unescapeCookie(kv[1]);
            });
            return data;
        } catch (e) {
            // Private mode / blocked cookies: degrade to in-memory.
            return memoryCookie(name, value, time);
        }
    }

    var memoryCookies = Object.create(null);
    function memoryCookie(name, value, time) {
        if (!name) return memoryCookies;
        if (typeof value !== 'undefined' && value !== null && value !== '') {
            memoryCookies[name] = value;
            return true;
        }
        return Object.prototype.hasOwnProperty.call(memoryCookies, name) ? memoryCookies[name] : false;
    }

    var RECORDS_KEY = 'kanoBeat.records.v1';
    var RECORDS_CAP = 20;
    var memoryRecords = null;

    function readRecordsRaw() {
        try {
            var raw = w.localStorage.getItem(RECORDS_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.records)) return null;
            return parsed.records;
        } catch (e) {
            return memoryRecords; // localStorage unavailable -> in-memory
        }
    }

    function writeRecordsRaw(records) {
        memoryRecords = records;
        try {
            w.localStorage.setItem(RECORDS_KEY, JSON.stringify({ version: 1, records: records }));
            return true;
        } catch (e) {
            return false; // still kept in memory, game keeps playing
        }
    }

    /** Normalise whatever is in storage into the CONTRACT.md §3 record shape. */
    function normaliseRecord(r) {
        if (!r || typeof r !== 'object') return null;
        var mode = num(r.mode, MODE_NORMAL);
        if (mode !== MODE_NORMAL && mode !== MODE_ENDLESS && mode !== MODE_PRACTICE) mode = MODE_NORMAL;
        return {
            mode: mode,
            score: num(r.score, 0),
            cps: num(r.cps, 0),
            combo: num(r.combo, 0),
            maxCombo: num(r.maxCombo, 0),
            hits: num(r.hits, 0),
            misses: num(r.misses, 0),
            accuracy: num(r.accuracy, 0),
            timeSetting: num(r.timeSetting, 20),
            durationMs: num(r.durationMs, 0),
            endedAt: num(r.endedAt, 0),
            complete: r.complete === true,
            deviationMs: num(r.deviationMs, 0)
        };
    }

    function num(v, fallback) {
        v = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(v) ? v : fallback;
    }

    function loadRecords() {
        var raw = readRecordsRaw();
        if (!raw || !raw.length) return [];
        var out = [];
        for (var i = 0; i < raw.length && out.length < RECORDS_CAP; i++) {
            var r = normaliseRecord(raw[i]);
            if (r) out.push(r);
        }
        // Newest first (never mutate the caller's array — always a fresh copy).
        out.sort(function (a, b) { return b.endedAt - a.endedAt; });
        return out;
    }

    function saveRecord(rec) {
        try {
            var all = loadRecords();
            all.unshift(normaliseRecord(rec));
            if (all.length > RECORDS_CAP) all = all.slice(0, RECORDS_CAP);
            writeRecordsRaw(all);
        } catch (e) { /* never break the game over a leaderboard */ }
    }

    function clearRecords() {
        try {
            memoryRecords = [];
            try { w.localStorage.removeItem(RECORDS_KEY); } catch (e) { /* in-memory only */ }
        } catch (e) { /* ignore */ }
        return true;
    }

    function isRecordedMode(m) {
        return m === MODE_NORMAL || m === MODE_ENDLESS;
    }

    /* ------------------------------------------------------------------ *
     * Settings / game state
     * ------------------------------------------------------------------ */

    var body = null,
        boardBG = null,
        timeLayer = null,
        GameLayer = [],
        touchArea = [0, 0],
        transform = 'transform',
        transitionDuration = 'transitionDuration';

    var mode = MODE_NORMAL,
        soundMode = 'on';

    var _gameBBList = [],
        _gameBBListIndex = 0,
        _gameOver = false,
        _gameStart = false,
        _gameSettingNum = 20,
        _gameTime = null,
        _gameTimeNum = 20,
        _gameScore = 0,
        _gameStartTime = 0,
        _date1 = null,
        _gameStartDatetime = 0,
        deviationTime = 0;

    // new stats (CONTRACT.md §3 getState)
    var _combo = 0,
        _maxCombo = 0,
        _hits = 0,
        _misses = 0;

    // pause / records
    var _paused = false,
        _recordsOpen = false,
        _savedTimeNum = 0;

    var refreshSizeTime = null;
    var gameOverTimeout = null;
    var pendingBadTimeouts = [];
    var initialized = false;
    var welcomeLayerClosed = false;

    var MODE_KEYS = {};
    MODE_KEYS[MODE_NORMAL] = 'normal';
    MODE_KEYS[MODE_ENDLESS] = 'endless';
    MODE_KEYS[MODE_PRACTICE] = 'practice';

    function modeToString(m) {
        return t(MODE_KEYS[m] || 'normal');
    }
    function modeDescKey(m) {
        return 'mode-desc-' + (MODE_KEYS[m] || 'normal');
    }

    function isValidMode(m) {
        return m === MODE_NORMAL || m === MODE_ENDLESS || m === MODE_PRACTICE;
    }

    /**
     * Clamp a gameTime input to a sane integer second count.
     *
     * Exact table (documented so the behaviour is deterministic):
     *   ''  / null / undefined / whitespace -> `fallback` (the current setting is
     *        kept by the caller; an empty box must not invent a value)
     *   non-numeric ('abc', NaN, Infinity)  -> 20 (the documented default)
     *   numeric                             -> Math.round, then clamp [5,120]
     *
     * So '0' -> 5, '3' -> 5, '-5' -> 5, '7.6' -> 8, '9999' -> 120.
     */
    function clampGameTime(v, fallback) {
        var fb = typeof fallback === 'number' ? fallback : 20;
        // Treat a blank field as "leave it alone".
        if (v === null || typeof v === 'undefined') return fb;
        if (typeof v === 'string' && v.trim() === '') return fb;
        var n = typeof v === 'number' ? v : parseFloat(v);
        if (!isFinite(n)) return 20;
        n = Math.round(n);
        if (n < 5) return 5;
        if (n > 120) return 120;
        return n;
    }

    function getMode() {
        var stored = cookie('gameMode');
        if (stored === false || stored === '') return MODE_NORMAL;
        var m = parseInt(stored, 10);
        return isValidMode(m) ? m : MODE_NORMAL;
    }

    function setMode(m) {
        var n = parseInt(m, 10);
        if (!isValidMode(n)) n = MODE_NORMAL;
        mode = n;
        cookie('gameMode', String(n), 100);
        var modeEl = byId('mode');
        if (modeEl) modeEl.textContent = modeToString(n);
        var modeDesc = byId('mode-desc');
        if (modeDesc) modeDesc.textContent = t(modeDescKey(n));
        updatePanel();
        return mode;
    }

    function getSoundMode() {
        var stored = cookie('soundMode');
        return stored === 'off' ? 'off' : 'on';
    }

    function applySoundMode(on) {
        var api = w.KanoAudio;
        if (api && typeof api.setEnabled === 'function') {
            try { api.setEnabled(on); } catch (e) { /* ignore */ }
        }
        var soundEl = byId('sound');
        if (soundEl) soundEl.textContent = on ? t('sound-on') : t('sound-off');
    }

    function changeSoundMode() {
        soundMode = soundMode === 'on' ? 'off' : 'on';
        cookie('soundMode', soundMode, 100);
        applySoundMode(soundMode === 'on');
        return soundMode;
    }

    /** sfx helper — KanoAudio errors are already swallowed, but be safe anyway. */
    function sfx(id) {
        if (soundMode !== 'on') return false;
        var api = w.KanoAudio;
        if (!api || typeof api.play !== 'function') return false;
        try { return api.play(id) === true; } catch (e) { return false; }
    }

    /* ------------------------------------------------------------------ *
     * Layout — ported from the original's countBlockSize/_refreshSize
     * ------------------------------------------------------------------ */

    function countBlockSize() {
        // Guard: a tester may call KanoGame.refreshLayout() before init() has
        // run (CONTRACT.md §3 hints at exactly that). Never throw, just no-op.
        if (!body || !boardBG) return;
        // T4 task spec §B: blockSize = body.offsetWidth / 4. `body` is
        // #gameBody (|| document.body), which T3 ships as a real static
        // max-width:640px column with NO padding/border, so offsetWidth is the
        // true board width. If that measurement is ever 0 (detached/hidden),
        // fall back to the board itself so the game stays playable.
        blockSize = body.offsetWidth / 4 || boardBG.offsetWidth / 4 || (w.innerWidth / 4);
        body.style.height = w.innerHeight + 'px';
        boardBG.style.height = w.innerHeight + 'px';
        touchArea[0] = w.innerHeight;
        // The tap zone is the bottom three rows.
        //
        // It must not be allowed to extend above the top of the screen: on a
        // phone in landscape `blockSize` is driven by the (long) width, so
        // `innerHeight - 3 * blockSize` goes NEGATIVE -- -105px on an iPhone SE
        // held sideways. The y-guard at the top of tapCore then reads
        // `y > -105`, which is true for every possible touch, so the guard stops
        // protecting anything and a stray tap anywhere ends the run.
        // Clamping to 0 keeps the zone inside the viewport, matching the
        // original's intent (the bottom three rows are the target area).
        touchArea[1] = Math.max(0, w.innerHeight - blockSize * 3);
        // A degenerate zone (blockSize so large that three rows exceed the whole
        // screen) would make every tap a hit. Keep the minimum usable zone at the
        // bottom 40% of the viewport so the game stays playable either way.
        if (touchArea[1] >= touchArea[0]) {
            touchArea[1] = Math.round(w.innerHeight * 0.6);
        }
    }

    var blockSize = 0;

    function layoutLayer(box) {
        if (!box || !box.children) return;
        for (var j = 0; j < box.children.length; j++) {
            var r = box.children[j],
                rstyle = r.style;
            rstyle.left = (j % 4) * blockSize + 'px';
            rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
            rstyle.width = blockSize + 'px';
            rstyle.height = blockSize + 'px';
        }
    }

    function refreshLayout() {
        if (!initialized) return false;
        countBlockSize();
        for (var i = 0; i < GameLayer.length; i++) layoutLayer(GameLayer[i]);
        return true;
    }

    function _refreshSize() {
        countBlockSize();
        for (var i = 0; i < GameLayer.length; i++) {
            layoutLayer(GameLayer[i]);
        }
        var f, a;
        if (GameLayer[0].y > GameLayer[1].y) {
            f = GameLayer[0];
            a = GameLayer[1];
        } else {
            f = GameLayer[1];
            a = GameLayer[0];
        }
        var y = ((_gameBBListIndex) % 10) * blockSize;
        f.y = y;
        f.style[transform] = 'translate3D(0,' + f.y + 'px,0)';
        a.y = -blockSize * Math.floor(f.children.length / 4) + y;
        a.style[transform] = 'translate3D(0,' + a.y + 'px,0)';
    }

    function refreshSize() {
        clearTimeout(refreshSizeTime);
        refreshSizeTime = setTimeout(_refreshSize, 200);
    }

    /* ------------------------------------------------------------------ *
     * Round lifecycle
     * ------------------------------------------------------------------ */

    function clearRoundTimers() {
        if (_gameTime !== null) {
            clearInterval(_gameTime);
            _gameTime = null;
        }
        if (gameOverTimeout !== null) {
            clearTimeout(gameOverTimeout);
            gameOverTimeout = null;
        }
        for (var i = 0; i < pendingBadTimeouts.length; i++) clearTimeout(pendingBadTimeouts[i]);
        pendingBadTimeouts = [];
    }

    function beginRound() {
        // Unlock audio inside the user-gesture frame that started this round.
        unlockAudio();
        _date1 = new Date();
        _gameStartDatetime = _date1.getTime();
        _gameStart = true;
        if (_gameTime === null) _gameTime = setInterval(timer, 1000);
    }

    function gameRestart() {
        clearRoundTimers();
        _gameBBList = [];
        _gameBBListIndex = 0;
        _gameScore = 0;
        _gameOver = false;
        _gameStart = false;
        _gameTimeNum = _gameSettingNum;
        _gameStartTime = 0;
        _gameStartDatetime = 0;
        _date1 = null;
        deviationTime = 0;
        _combo = 0;
        _maxCombo = 0;
        _hits = 0;
        _misses = 0;
        _paused = false;
        _savedTimeNum = 0;
        if (boardBG) boardBG.classList.remove('paused', 'flash');
        if (timeLayer) timeLayer.innerHTML = '';
        countBlockSize();
        if (GameLayer[0]) refreshGameLayer(GameLayer[0]);
        if (GameLayer[1]) refreshGameLayer(GameLayer[1], 1);
        updatePanel();
    }

    function getCPS() {
        var cps = _gameScore / ((new Date().getTime() - _gameStartDatetime) / 1000);
        if (isNaN(cps) || cps === Infinity || _gameStartTime < 2) {
            cps = 0;
        }
        return cps;
    }

    function getAccuracy() {
        if (_hits + _misses === 0) return 0;
        return _hits / (_hits + _misses) * 100;
    }

    function createTimeText(n) {
        return 'TIME:' + Math.ceil(n);
    }

    function timer() {
        if (_paused) return;
        // Only Normal mode is timed. Decrementing in every mode (as the original
        // did) let _gameTimeNum run past 0 into negatives in Endless, because the
        // "time up" guard below is Normal-only. CONTRACT.md says Endless has "no
        // timer" and documents getState().timeLeft as "(normal mode)", so the
        // documented value is the mode's own setting in every other mode.
        if (mode === MODE_NORMAL) _gameTimeNum--;
        _gameStartTime++;
        if (mode === MODE_NORMAL && _gameTimeNum <= 0) {
            if (timeLayer) timeLayer.innerHTML = t('time-up') + '!';
            gameOver({ complete: true });
            if (boardBG) boardBG.className += ' flash';
            sfx('end');
        }
        updatePanel();
    }

    function updatePanel() {
        if (!timeLayer) return;
        if (mode === MODE_NORMAL) {
            if (!_gameOver) timeLayer.innerHTML = createTimeText(_gameTimeNum);
        } else if (mode === MODE_ENDLESS) {
            var cps = getCPS();
            var text = (cps === 0 ? t('calculating') : cps.toFixed(2));
            timeLayer.innerHTML = 'CPS:' + text;
        } else {
            timeLayer.innerHTML = 'SCORE:' + _gameScore;
        }
    }

    function focusOnReplay() {
        var el = byId('replay');
        if (el && typeof el.focus === 'function') {
            try { el.focus(); } catch (e) { /* ignore */ }
        }
    }

    function gameOver(opts) {
        if (_gameOver) return false;
        opts = opts || {};
        _gameOver = true;
        clearRoundTimers();
        var cps = getCPS();
        var complete = opts.complete === true;

        // Remember the last hit's tile-level class (`tt1`..`tt5`) for the panel colour.
        var lastTile = _gameBBList[Math.max(0, _gameBBListIndex - 1)];
        var levelIndex = '1';
        if (lastTile) {
            var el = byId(lastTile.id);
            var m = el && el.className ? String(el.className).match(_ttreg) : null;
            if (m) levelIndex = m[1];
        }

        // Duration / deviation must exist before the results panel is rendered.
        var durationMs = _date1 ? (new Date().getTime() - _date1.getTime()) : 0;
        deviationTime = durationMs;

        var deviationMs = durationMs - _gameSettingNum * 1000;

        if (isRecordedMode(mode) && legalDeviationTime()) {
            saveRecord({
                mode: mode,
                score: (mode === MODE_ENDLESS ? cps : _gameScore),
                cps: cps,
                combo: _combo,
                maxCombo: _maxCombo,
                hits: _hits,
                misses: _misses,
                accuracy: round1(getAccuracy()),
                timeSetting: _gameSettingNum,
                durationMs: durationMs,
                endedAt: Date.now(),
                complete: complete,
                deviationMs: deviationMs
            });
        }

        updatePanel();
        renderRecords();

        gameOverTimeout = setTimeout(function () {
            gameOverTimeout = null;
            if (boardBG) boardBG.className = '';
            showGameScoreLayer(cps, levelIndex);
            focusOnReplay();
        }, 1500);
        return true;
    }

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    /* ------------------------------------------------------------------ *
     * Tile generation (the original's random walk, unchanged)
     * ------------------------------------------------------------------ */

    var _ttreg = / t{1,2}(\d+)/,
        _clearttClsReg = / t{1,2}\d+| bad/;

    function refreshGameLayer(box, loop, offset) {
        var i = Math.floor(Math.random() * 1000) % 4 + (loop ? 0 : 4);
        for (var j = 0; j < box.children.length; j++) {
            var r = box.children[j], rstyle = r.style;
            rstyle.left = (j % 4) * blockSize + 'px';
            rstyle.bottom = Math.floor(j / 4) * blockSize + 'px';
            rstyle.width = blockSize + 'px';
            rstyle.height = blockSize + 'px';
            r.className = r.className.replace(_clearttClsReg, '');
            if (i === j) {
                _gameBBList.push({
                    cell: i % 4,
                    id: r.id
                });
                r.className += ' t' + (Math.floor(Math.random() * 1000) % 5 + 1);
                r.notEmpty = true;
                i = (Math.floor(j / 4) + 1) * 4 + Math.floor(Math.random() * 1000) % 4;
            } else {
                r.notEmpty = false;
            }
        }
        if (loop) {
            // Wrap a layer back to the top of the board.
            //
            // The original hid the layer with `display:none`, waited 200ms,
            // repositioned, waited another 100ms and only then showed it again.
            // That is a ~300ms hole in which a whole board layer is gone, and on
            // a mid-range phone it is plainly visible: the tiles and the grid
            // disappear for several frames and snap back, roughly every 10 taps.
            //
            // The wait was never needed. A layer only wraps when it has scrolled
            // a full board-height past the other one, so at that instant it is
            // entirely off-screen anyway -- repositioning it invisibly is free.
            // Suppress the transition for the jump, move it, then let the next
            // frame re-enable the transition. The layer is never hidden, so
            // there is nothing to flash.
            box.style[transitionDuration] = '0ms';
            box.y = -blockSize * (Math.floor(box.children.length / 4) + (offset || 0)) * loop;
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';

            // Re-enable the scroll transition on the next frame. rAF keeps this
            // in step with paint; the original used timers and a display toggle.
            var boxRef = box;
            if (typeof w.requestAnimationFrame === 'function') {
                w.requestAnimationFrame(function () {
                    boxRef.style[transitionDuration] = '150ms';
                });
            } else {
                setTimeout(function () { boxRef.style[transitionDuration] = '150ms'; }, 16);
            }
        } else {
            box.y = 0;
            box.style[transform] = 'translate3D(0,' + box.y + 'px,0)';
            // Only the non-loop path restores the transition here. The loop path
            // above re-enables it on the next frame instead, AFTER the jump has
            // been committed -- setting it synchronously here would make the
            // browser animate the wrap-around jump instead of snapping it.
            box.style[transitionDuration] = '150ms';
        }
    }

    function gameLayerMoveNextRow() {
        for (var i = 0; i < GameLayer.length; i++) {
            var g = GameLayer[i];
            g.y += blockSize;
            if (g.y > blockSize * (Math.floor(g.children.length / 4))) {
                refreshGameLayer(g, 1, -1);
            } else {
                g.style[transform] = 'translate3D(0,' + g.y + 'px,0)';
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Input — one code path for real events and synthetic ones
     * ------------------------------------------------------------------ */

    /**
     * Shared tap core. `tar` is the DOM node under the pointer (or the tile the
     * synthetic press resolved to), `x`/`y` are viewport coordinates.
     */
    /**
     * COORDINATE MODEL — read this before touching any x in this file.
     * -----------------------------------------------------------------
     * `tapCore()` takes **absolute viewport x** (exactly `MouseEvent.clientX`)
     * and is the ONE AND ONLY place that converts it to board-local:
     *
     *     localX = absoluteX - boardLeft
     *
     * Every consumer below — the clamp, `isCorrectTap()`, and the lane arms —
     * uses that single `localX`. Callers must therefore pass:
     *   - `gameTapEvent()`: the raw `clientX` (already absolute), and
     *   - `pressLane()`:    `boardLeft + lane*blockSize + blockSize/2`.
     *
     * INVARIANT: `boardLeft` is the only absolute quantity. x is converted
     * exactly once, here. A previous revision passed board-local x from both
     * callers while clamping against absolute edges, which silently broke every
     * lane on viewports wider than the 640px board (`#gameBody` is
     * `max-width:640px; margin:0 auto`, so `body.offsetLeft > 0` from ~641px
     * up): the clamp lifted small local x up to `boardLeft`, which matches no
     * lane arm, making the left lanes unclickable and the lane next to the
     * active one an instant game over. Do not reintroduce that split.
     */
    function tapCore(tar, absoluteX, y) {
        if (_gameOver) return false;
        if (_paused || _recordsOpen) return false; // records panel pauses the round

        var p = _gameBBList[_gameBBListIndex];
        if (!p) return false;

        var boardLeft = body ? body.offsetLeft : 0;
        var boardWidth = blockSize * 4;

        // Guard against synthetic/odd events: the harness's click can arrive
        // without a target. Fall back to an elementFromPoint hit-test, which
        // needs ABSOLUTE coordinates.
        if (!tar || tar.nodeType !== 1) {
            try {
                tar = d.elementFromPoint(absoluteX, y) || boardBG;
            } catch (e) {
                tar = boardBG;
            }
        }

        // Clamp in ABSOLUTE space so a click off the board (negative, or past
        // the right edge) cannot score, then convert ONCE to board-local.
        var absX = absoluteX;
        if (!isFinite(absX)) absX = boardLeft;
        if (absX < boardLeft) absX = boardLeft;
        if (absX > boardLeft + boardWidth) absX = boardLeft + boardWidth;
        var x = absX - boardLeft; // <- board-local from here on

        // CONTRACT.md: y must be inside the bottom tap zone.
        if (!(y > touchArea[1] && y < touchArea[0])) return false;

        if (isCorrectTap(p, tar, x)) {
            onCorrectTap(p);
        } else if (_gameStart && !tar.notEmpty) {
            onWrongTap(tar);
        }
        return false;
    }

    /**
     * The tap predicate. This is the original's expression, verbatim:
     *
     *   (p.id === tar.id && tar.notEmpty)
     *     || (p.cell === 0 && x <   blockSize)
     *     || (p.cell === 1 && x >   blockSize && x < 2*blockSize)
     *     || (p.cell === 2 && x > 2*blockSize && x < 3*blockSize)
     *     || (p.cell === 3 && x > 3*blockSize)
     *
     * PORT NOTE — a real defect in the original, deliberately corrected here.
     * Two arms are unbounded: lane 0 has no lower bound (`x < blockSize` is true
     * for every negative x) and lane 3 has no upper bound (`x > 3*blockSize` is
     * true for every x off the right edge). Between them the four arms cover the
     * ENTIRE real line, so as written the predicate is *always* true and the
     * "wrong lane" branch of gameTapEvent is dead code: no tap can ever be
     * wrong. CONTRACT.md §3 states the rule as "e.target IS the active tile, OR
     * the x position falls in the active tile's lane", and its rules table
     * explicitly requires "Wrong tap ... immediate game over" — both are only
     * satisfiable with the two missing bounds present.
     *
     * So the arms are bounded to the board here: lane 0 gets `x >= 0` and lane 3
     * gets `x <= 4*blockSize`. Every on-board x in lane k still satisfies exactly
     * arm k, so ordinary play is byte-for-byte the original's behaviour; the only
     * observable change is that a click that MISSES the active lane is now
     * correctly counted as a wrong tap (which is what the game is).
     */
    function isCorrectTap(p, tar, x) {
        var bs = blockSize;
        return (p.id === tar.id && tar.notEmpty)
            || (p.cell === 0 && x >= 0 && x < bs)
            || (p.cell === 1 && x > bs && x < 2 * bs)
            || (p.cell === 2 && x > 2 * bs && x < 3 * bs)
            || (p.cell === 3 && x > 3 * bs && x <= 4 * bs);
    }

    function onCorrectTap(p) {
        if (!_gameStart) {
            beginRound();
        }
        sfx('tap');
        var tar = byId(p.id);
        if (tar) tar.className = tar.className.replace(_ttreg, ' tt$1');
        _gameBBListIndex++;
        _gameScore++;
        _hits++; // `hits` == `score` for landed taps; they differ only once
                 // `misses` exists, which is what drives accuracy.
        _combo++;
        if (_combo > _maxCombo) _maxCombo = _combo;
        updatePanel();
        gameLayerMoveNextRow();
    }

    function onWrongTap(tar) {
        sfx('err');
        if (tar && tar.classList) tar.classList.add('bad');
        _combo = 0;
        _misses++;
        if (mode === MODE_PRACTICE) {
            var id = setTimeout(function () {
                if (tar && tar.classList) tar.classList.remove('bad');
            }, 500);
            pendingBadTimeouts.push(id);
        } else {
            gameOver({ complete: false });
        }
    }

    /**
     * Real pointer/touch/mouse event from #GameLayerBG. Keeps the original's
     * `return false` semantics (it suppresses the default action of the event).
     */
    function gameTapEvent(e) {
        try {
            if (_gameOver) return false;
            var tar = e.target;
            var te = (e.targetTouches && e.targetTouches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
            var y = (typeof e.clientY === 'number' && e.clientY !== 0) ? e.clientY : (te ? te.clientY : null);
            var absX = (typeof e.clientX === 'number' && e.clientX !== 0) ? e.clientX : (te ? te.clientX : null);
            if (y === null || absX === null) return false;
            // Pass ABSOLUTE x: tapCore() owns the single board-local conversion.
            tapCore(tar, absX, y);
        } catch (err) {
            return false;
        }
        return false;
    }

    /**
     * The tile a lane press lands on: lane `lane` of the ROW the active tile is
     * in. The original expressed this as `base = num - cell; id = base + index - 1`
     * with a 1-based `index`; this is the same arithmetic, written plainly.
     *
     *     rowBase = activeIndex - activeCell
     *     num     = rowBase + lane
     */
    function laneTargetId(p, lane) {
        var idStr = String(p.id);
        var cut = idStr.lastIndexOf('-');
        if (cut < 0) return null;
        var activeNum = parseInt(idStr.slice(cut + 1), 10);
        if (!isFinite(activeNum)) return null;
        return idStr.slice(0, cut + 1) + (activeNum - p.cell + lane);
    }

    /**
     * The single lane-press implementation. `KanoGame.press(lane)`, the
     * keyboard handler and the real pointer handler all funnel through this, so
     * headless tests exercise the real code path rather than a copy.
     *
     * `lane` is 0-based (0..3), matching `press()` and `activeTile().lane`.
     */
    function pressLane(lane) {
        try {
            if (!welcomeLayerClosed) return false;
            if (typeof lane !== 'number' || !isFinite(lane) || Math.floor(lane) !== lane) return false;
            if (!(lane >= 0 && lane <= 3)) return false;

            var p = _gameBBList[_gameBBListIndex];
            if (!p) return false;

            var id = laneTargetId(p, lane);
            if (id === null) return false;
            var target = byId(id);
            if (!target) return false;

            // The pressed position: the centre of `lane` in the bottom tap row,
            // expressed in ABSOLUTE viewport coordinates (board origin + local
            // offset). This is the same point a finger on that lane would
            // produce, so the public press(), the keyboard handler and a real
            // pointer click all run the identical predicate.
            var bs = blockSize || (body ? body.offsetWidth / 4 : 0);
            var boardLeft = body ? body.offsetLeft : 0;
            var absX = boardLeft + lane * bs + bs / 2;
            var y = (touchArea[0] + touchArea[1]) / 2;
            tapCore(target, absX, y);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Public API: 0-based lane, 0..3.
     * Strictly validated — a non-integer like 1.5 is rejected rather than being
     * truncated to lane 1, so a bad caller cannot silently score a hit.
     */
    function press(lane) {
        if (typeof lane !== 'number' || !isFinite(lane)) return false;
        if (Math.floor(lane) !== lane) return false;
        if (!(lane >= 0 && lane <= 3)) return false;
        return pressLane(lane);
    }

    /* ------------------------------------------------------------------ *
     * Keyboard
     * ------------------------------------------------------------------ */

    // 0-based lanes, matching activeTile().lane and press(lane).
    var keyMap = { d: 0, f: 1, j: 2, k: 3 };

    /**
     * Normalise the 4-character keyboard setting.
     *
     * Rules (T4 spec item F):
     *   - lowercase everything, strip all whitespace
     *   - position i defaults to dfjk[i] when it is missing/blank
     *   - a character that DUPLICATES an earlier position is rejected and
     *     replaced by dfjk[i] — so 'dddd' -> 'dfjk' and 'yyyy' -> 'dfjk',
     *     not 'yfjk' (a repeated key must never shadow a lane)
     *   - if dfjk[i] is itself already taken, take the first still-unused
     *     letter of dfjk so all four lanes always stay reachable
     */
    function normaliseKeyboardSetting(raw) {
        var str = (raw == null ? '' : String(raw)).toLowerCase().replace(/\s+/g, '');
        var FALLBACK = 'dfjk';

        // Which characters of the input are unusable? A character is bad if it
        // is blank, or if it appears more than once ANYWHERE in the input — a
        // repeated key cannot address two lanes, and treating only the later
        // copies as bad would arbitrarily privilege the first one ('yyyy' would
        // become 'yfjk'). Counting up front makes 'yyyy' -> 'dfjk', matching the
        // "reject duplicates, fall back to dfjk" rule in the spec.
        var counts = Object.create(null);
        for (var c = 0; c < str.length; c++) {
            var k0 = str.charAt(c);
            counts[k0] = (counts[k0] || 0) + 1;
        }

        var out = [];
        var seen = Object.create(null);
        for (var i = 0; i < 4; i++) {
            var ch = str.charAt(i);
            if (!ch || counts[ch] > 1) {
                ch = FALLBACK.charAt(i); // bad entry -> the documented default
            }
            if (seen[ch]) {
                // The default itself collided (e.g. input 'ddfk'): take any
                // still-unused lane key so all four lanes stay reachable.
                for (var k = 0; k < FALLBACK.length; k++) {
                    if (!seen[FALLBACK.charAt(k)]) { ch = FALLBACK.charAt(k); break; }
                }
            }
            if (seen[ch]) { ch = String.fromCharCode(97 + i); } // last resort
            seen[ch] = true;
            out.push(ch);
        }
        return out.join('');
    }

    function applyKeyMap(str) {
        keyMap = {};
        for (var i = 0; i < 4; i++) keyMap[str.charAt(i)] = i; // 0-based lane
    }

    function isTextEntry(el) {
        if (!el || el.nodeType !== 1) return false;
        var tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function onKeyDown(e) {
        try {
            if (e.defaultPrevented) return;
            if (isTextEntry(e.target)) return;
            if (e.repeat && _gameOver) return;
            var key = e.key;
            if (!key) return;
            key = String(key).toLowerCase();
            if (key.length !== 1) return; // ignore Shift, ArrowLeft, F5, ...
            if (!Object.prototype.hasOwnProperty.call(keyMap, key)) return;
            unlockAudio();
            pressLane(keyMap[key]);
        } catch (err) { /* never let input handling break the game */ }
    }

    /* ------------------------------------------------------------------ *
     * Audio unlock
     * ------------------------------------------------------------------ */

    var audioUnlockRequested = false;
    function unlockAudio() {
        var api = w.KanoAudio;
        if (!api) return;
        try {
            if (api.setEnabled) api.setEnabled(soundMode === 'on');
            if (!audioUnlockRequested && typeof api.unlock === 'function') {
                audioUnlockRequested = true;
                var pr = api.unlock();
                if (pr && typeof pr.catch === 'function') pr.catch(function () { /* ignore */ });
            }
        } catch (e) { /* ignore */ }
    }

    function registerAudioOnce() {
        var api = w.KanoAudio;
        if (!api || typeof api.register !== 'function') return;
        try {
            var pr = api.register({
                tap: './static/music/tap.mp3',
                end: './static/music/end.mp3',
                err: './static/music/err.mp3'
            });
            if (pr && typeof pr.catch === 'function') pr.catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
    }

    /* ------------------------------------------------------------------ *
     * Welcome layer / panels
     * ------------------------------------------------------------------ */

    function closeWelcomeLayer() {
        welcomeLayerClosed = true;
        setDisplay(byId('welcome'), 'none');
        updatePanel();
    }

    function showWelcomeLayer() {
        welcomeLayerClosed = false;
        var modeEl = byId('mode');
        if (modeEl) modeEl.textContent = modeToString(mode);
        var modeDesc = byId('mode-desc');
        if (modeDesc) modeDesc.textContent = t(modeDescKey(mode));
        setDisplay(byId('welcome'), 'block');
    }

    function getBestScore(score) {
        // Only called from the results panel, which normal/endless reach.
        // NOTE: `bast-score` keeps the ORIGINAL's typo on purpose — it is a
        // real, user-visible cookie name and renaming it would silently
        // discard existing players' best scores (CONTRACT.md §3).
        var cookieName = getBestCookieName(mode);
        var stored = cookie(cookieName);
        var best = stored ? Math.max(parseFloat(stored), score) : score;
        cookie(cookieName, best.toFixed(2), 100);
        return best;
    }

    function getBestCookieName(m) {
        return m === MODE_ENDLESS ? 'endless-best-score'
            : (m === MODE_PRACTICE ? 'practice-best-score' : 'bast-score');
    }

    function getBest(m) {
        var mm = isValidMode(parseInt(m, 10)) ? parseInt(m, 10) : mode;
        var stored = cookie(getBestCookieName(mm));
        var n = stored ? parseFloat(stored) : 0;
        return isFinite(n) ? n : 0;
    }

    function scoreToString(score) {
        return mode === MODE_ENDLESS ? score.toFixed(2) : score.toString();
    }

    function legalDeviationTime() {
        return deviationTime < (_gameSettingNum + 3) * 1000;
    }

    function showGameScoreLayer(cps, levelIndex) {
        var l = byId('GameScoreLayer');
        if (!l) return;
        var level = String(levelIndex || '1');
        l.className = l.className.replace(/bgc\d/, 'bgc' + level);

        var text = shareText(cps);
        var textEl = byId('GameScoreLayer-text');
        if (textEl) textEl.innerHTML = text;

        // A normal round that outlasted the configured time (plus slack) is an
        // anti-cheat failure: red text and — handled in gameOver — no record.
        var normalCond = legalDeviationTime() || mode !== MODE_NORMAL;
        l.style.color = normalCond ? '' : 'red';

        var score = (mode === MODE_ENDLESS ? cps : _gameScore);
        var best = getBestScore(score);

        var cpsEl = byId('cps');
        if (cpsEl) cpsEl.textContent = cps.toFixed(2);
        var scoreEl = byId('score');
        if (scoreEl) scoreEl.textContent = scoreToString(score);
        setDisplay(byId('GameScoreLayer-score'), mode === MODE_ENDLESS ? 'none' : '');
        var bestEl = byId('best');
        if (bestEl) bestEl.textContent = scoreToString(best);

        var maxComboEl = byId('maxCombo');
        if (maxComboEl) maxComboEl.textContent = String(_maxCombo);
        var hitsEl = byId('hits');
        if (hitsEl) hitsEl.textContent = String(_hits);
        var missesEl = byId('misses');
        if (missesEl) missesEl.textContent = String(_misses);
        var accEl = byId('accuracy');
        if (accEl) accEl.textContent = round1(getAccuracy()).toFixed(1) + '%';

        l.style.display = 'block';
    }

    function hideGameScoreLayer() {
        setDisplay(byId('GameScoreLayer'), 'none');
    }

    function shareText(cps) {
        if (mode === MODE_NORMAL) {
            var over = deviationTime - _gameSettingNum * 1000;
            if (over > 3000) { // == !legalDeviationTime()
                return t('time-over') + (over / 1000).toFixed(2) + 's';
            }
        }
        if (cps <= 5) return t('text-level-1');
        if (cps <= 8) return t('text-level-2');
        if (cps <= 10) return t('text-level-3');
        if (cps <= 15) return t('text-level-4');
        return t('text-level-5');
    }

    /* ------------------------------------------------------------------ *
     * Records overlay
     * ------------------------------------------------------------------ */

    function formatDuration(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m > 0 ? (m + 'm ' + r + 's') : (r + 's');
    }

    function renderRecords() {
        try {
            var list = byId('RecordsLayer-list');
            var textEl = byId('RecordsLayer-text');
            if (textEl) textEl.textContent = t('records-title');
            if (!list) return;
            list.innerHTML = '';
            var records = loadRecords();
            if (!records.length) {
                var empty = d.createElement('div');
                empty.className = 'record-row record-row-empty';
                empty.textContent = t('records-empty');
                list.appendChild(empty);
                return;
            }
            var bestSeen = {};
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                var row = d.createElement('div');
                row.className = 'record-row';
                if (!bestSeen[r.mode]) {
                    bestSeen[r.mode] = true;
                    row.className += ' top';
                }

                var rank = d.createElement('span');
                rank.className = 'record-rank';
                rank.textContent = String(i + 1);

                var score = d.createElement('span');
                score.className = 'record-score';
                score.textContent = (r.mode === MODE_ENDLESS || r.mode === MODE_PRACTICE ? r.score : r.score) + '';

                var meta = d.createElement('span');
                meta.className = 'record-meta';
                var when = '';
                try { when = r.endedAt ? new Date(r.endedAt).toLocaleString() : ''; } catch (e) { when = ''; }
                meta.textContent = t(MODE_KEYS[r.mode] || 'normal')
                    + ' \u00b7 CPS ' + (isFinite(r.cps) ? r.cps.toFixed(2) : '0.00')
                    + ' \u00b7 ' + t('max-combo') + ' ' + r.maxCombo
                    + ' \u00b7 ' + t('accuracy') + ' ' + (isFinite(r.accuracy) ? r.accuracy.toFixed(1) : '0.0') + '%'
                    + ' \u00b7 ' + formatDuration(r.durationMs)
                    + (when ? ' \u00b7 ' + when : '');

                row.appendChild(rank);
                row.appendChild(score);
                row.appendChild(meta);
                list.appendChild(row);
            }
        } catch (e) { /* rendering must never break the game */ }
    }

    function pauseRound() {
        if (_gameOver || !_gameStart || _paused) return false;
        _paused = true;
        _savedTimeNum = _gameTimeNum;
        if (_gameTime !== null) {
            clearInterval(_gameTime);
            _gameTime = null;
        }
        if (boardBG) boardBG.classList.add('paused');
        return true;
    }

    function resumeRound() {
        if (!_paused) return false;
        _paused = false;
        _gameTimeNum = _savedTimeNum;
        if (boardBG) boardBG.classList.remove('paused');
        if (!_gameOver && _gameStart && _gameTime === null) _gameTime = setInterval(timer, 1000);
        updatePanel();
        return true;
    }

    /* ------------------------------------------------------------------ *
     * Global functions index.html calls (CONTRACT.md §2)
     * ------------------------------------------------------------------ */

    function init() {
        if (initialized) return;
        initialized = true;

        body = byId('gameBody') || d.body;
        if (body) body.style.height = w.innerHeight + 'px';

        transform = typeof (body.style.webkitTransform) !== 'undefined' ? 'webkitTransform'
            : (typeof (body.style.msTransform) !== 'undefined' ? 'msTransform' : 'transform');
        transitionDuration = transform.replace(/ransform/g, 'ransitionDuration');

        timeLayer = byId('GameTimeLayer');
        boardBG = byId('GameLayerBG');

        GameLayer = [byId('GameLayer1'), byId('GameLayer2')].filter(function (el) { return !!el; });

        mode = getMode();
        soundMode = getSoundMode();

        showWelcomeLayer();
        applyI18N();

        // Audio: register once, then respect the persisted sound mode.
        registerAudioOnce();
        applySoundMode(soundMode === 'on');
        audioUnlockRequested = false;

        // Board input: pointerdown where available, else touchstart/mousedown.
        if (boardBG) {
            if (w.PointerEvent) {
                boardBG.addEventListener('pointerdown', gameTapEvent, false);
            } else {
                boardBG.addEventListener('touchstart', gameTapEvent, false);
                boardBG.addEventListener('mousedown', gameTapEvent, false);
            }
            boardBG.addEventListener('contextmenu', function (e) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
                return false;
            }, false);
        }

        d.addEventListener('keydown', onKeyDown, false);
        installZoomGuards();

        initSetting();
        gameRestart();
        w.addEventListener('resize', refreshSize, false);

        // i18n resolves asynchronously (fetch/XHR); when it lands we re-render.
        loadI18N();
    }

    /**
     * Suppress page zoom during play.
     *
     * `touch-action: manipulation` on `*` (static/index.css) removes
     * double-tap-to-zoom, and `user-scalable=no` in the viewport meta covers
     * older Android -- but neither stops everything:
     *
     *   - iOS Safari ignores `user-scalable=no` from iOS 10 on, by design.
     *   - A two-finger pinch still zooms, because `touch-action: manipulation`
     *     deliberately leaves pinch-zoom enabled (only `none` disables it, and
     *     that would also kill normal scrolling everywhere).
     *   - Safari fires non-standard `gesturestart`/`gesturechange` events for
     *     pinch, which CSS cannot touch at all.
     *
     * All three make the board jump under the player's fingers mid-round, so we
     * swallow them here. Nothing is lost: the game never scrolls or pans, and
     * the settings inputs remain fully usable with the keyboard and caret.
     */
    function installZoomGuards() {
        var swallow = function (e) {
            try { e.preventDefault(); } catch (err) { /* ignore */ }
            return false;
        };

        // Safari-only pinch events. No CSS equivalent exists.
        d.addEventListener('gesturestart', swallow, { passive: false });
        d.addEventListener('gesturechange', swallow, { passive: false });
        d.addEventListener('gestureend', swallow, { passive: false });

        // Multi-touch anywhere zooms; a single finger is normal gameplay.
        d.addEventListener('touchstart', function (e) {
            if (e.touches && e.touches.length > 1) swallow(e);
        }, { passive: false });

        // Double-tap. Browsers that ignore touch-action zoom ~300ms after the
        // second tap. We only block taps that land OUTSIDE the board: taps on
        // the board are gameplay and are handled by gameTapEvent, and blocking
        // them here would double-preventDefault the same gesture.
        var lastTapAt = 0;
        d.addEventListener('touchend', function (e) {
            var target = e.target;
            if (boardBG && (target === boardBG || boardBG.contains(target))) return;
            var now = Date.now();
            if (now - lastTapAt < 300) swallow(e);
            lastTapAt = now;
        }, { passive: false });

        // Some Android browsers also zoom on double-click of the page chrome.
        d.addEventListener('dblclick', function (e) {
            var target = e.target;
            if (boardBG && (target === boardBG || boardBG.contains(target))) return;
            swallow(e);
        }, { passive: false });

        // Safari on macOS/iOS: block the ctrl+wheel / pinch-trackpad zoom.
        d.addEventListener('wheel', function (e) {
            if (e.ctrlKey) swallow(e);
        }, { passive: false });
    }

    function initSetting() {
        // setPageTitle() applies the cookie when present and the localised game
        // name otherwise. This must run BEFORE applyI18N() on a reload, because
        // applyI18N() also sets the title and would otherwise overwrite the
        // player's saved custom title with the localised default.
        setPageTitle();
        var titleCookie = cookie('title');
        if (titleCookie) {
            var titleInput = byId('title');
            if (titleInput) titleInput.value = String(titleCookie);
        }

        var keyboardCookie = cookie('keyboard');
        var kb = normaliseKeyboardSetting(keyboardCookie ? keyboardCookie : 'dfjk');
        var kbInput = byId('keyboard');
        if (kbInput) kbInput.value = kb;
        applyKeyMap(kb);

        // An absent cookie means "never configured" -> the documented default of
        // 20. A BLANK cookie (the user cleared the box) means "leave the current
        // setting alone", so the fallback is the current value, not 20.
        var timeCookie = cookie('gameTime');
        var seconds = clampGameTime(timeCookie, _gameSettingNum || 20);
        var timeInput = byId('gameTime');
        if (timeInput) timeInput.value = String(seconds);

        _gameSettingNum = seconds;
        gameRestart();
        updatePanel();
    }

    function readyBtn() {
        unlockAudio();
        closeWelcomeLayer();
        updatePanel();
    }

    function replayBtn() {
        // "no interval leaks": restarting a round always drops every timer.
        clearRoundTimers();
        hideGameScoreLayer();
        gameRestart();
    }

    function backBtn() {
        clearRoundTimers();
        hideGameScoreLayer();
        gameRestart();
        showWelcomeLayer();
    }

    function changeMode(m) {
        return setMode(m);
    }

    function show_btn() {
        setDisplay(byId('btn_group'), 'block');
        setDisplay(byId('desc'), 'block');
        setDisplay(byId('setting'), 'none');
    }

    function show_setting() {
        setDisplay(byId('btn_group'), 'none');
        setDisplay(byId('desc'), 'none');
        setDisplay(byId('setting'), 'block');
        var soundEl = byId('sound');
        if (soundEl) soundEl.textContent = soundMode === 'on' ? t('sound-on') : t('sound-off');
    }

    function show_records() {
        renderRecords();
        setDisplay(byId('RecordsLayer'), 'block');
        _recordsOpen = true;
        pauseRound();
    }

    function hide_records() {
        setDisplay(byId('RecordsLayer'), 'none');
        _recordsOpen = false;
        resumeRound();
        clearTimeout(refreshSizeTime);
    }

    function clearRecordsPublic() {
        clearRecords();
        renderRecords();
        return true;
    }

    function togglePause() {
        if (_paused) {
            _recordsOpen = false;
            setDisplay(byId('RecordsLayer'), 'none');
            return resumeRound();
        }
        return pauseRound();
    }

    function save_cookie() {
        var settings = ['title', 'keyboard', 'gameTime'];
        for (var i = 0; i < settings.length; i++) {
            var s = settings[i];
            var el = byId(s);
            if (el && el.value !== '' && el.value != null) {
                cookie(s, el.value.toString(), 100);
                // Keep the cached title in step immediately, so the tab updates
                // without waiting for the next initSetting()/applyI18N() pass.
                if (s === 'title') initTitle = el.value.toString();
            }
        }
        initSetting();
        setPageTitle();
    }

    /* ------------------------------------------------------------------ *
     * Custom image upload hooks (kept from the original, jQuery-free)
     * ------------------------------------------------------------------ */

    var clickBeforeStyle = null;
    var clickAfterStyle = null;

    function styleTag(id) {
        var el = byId(id);
        if (!el) {
            el = d.createElement('style');
            el.id = id;
            (d.head || d.documentElement).appendChild(el);
        }
        return el;
    }

    function saveImage(dom, callback) {
        if (dom && dom.files && dom.files[0]) {
            try {
                var reader = new FileReader();
                reader.onload = function () { callback(this.result); };
                reader.onerror = function () { /* ignore */ };
                reader.readAsDataURL(dom.files[0]);
            } catch (e) { /* ignore */ }
        }
    }

    function getClickBeforeImage() {
        var el = byId('click-before-image');
        if (el && typeof el.click === 'function') el.click();
    }

    function saveClickBeforeImage() {
        var img = byId('click-before-image');
        saveImage(img, function (r) {
            clickBeforeStyle = clickBeforeStyle || styleTag('click-before-style');
            clickBeforeStyle.textContent = '.t1, .t2, .t3, .t4, .t5 {' +
                'background-size: auto 100%;' +
                'background-image: url(' + r + ');}';
        });
    }

    function getClickAfterImage() {
        var el = byId('click-after-image');
        if (el && typeof el.click === 'function') el.click();
    }

    function saveClickAfterImage() {
        var img = byId('click-after-image');
        saveImage(img, function (r) {
            clickAfterStyle = clickAfterStyle || styleTag('click-after-style');
            clickAfterStyle.textContent = '.tt1, .tt2, .tt3, .tt4, .tt5 {' +
                'background-size: auto 86%;' +
                'background-image: url(' + r + ');}';
        });
    }

    /* ------------------------------------------------------------------ *
     * window.KanoGame — frozen test API (CONTRACT.md §3)
     * ------------------------------------------------------------------ */

    function getState() {
        // Brand-new plain object on EVERY call: tests mutate it to prove that.
        // NOTE: built with an explicit null prototype rather than `{}` so the
        // snapshot is unambiguously a *plain* data object, never a live internal
        // reference and never a class instance.
        var snap = {};
        return Object.assign(snap, {
            mode: mode,
            started: _gameStart === true,
            over: _gameOver === true,
            score: _gameScore,
            cps: getCPS(),
            best: getBest(mode),
            timeLeft: _gameTimeNum,
            timeSetting: _gameSettingNum,
            combo: _combo,
            maxCombo: _maxCombo,
            hits: _hits,
            misses: _misses,
            accuracy: getAccuracy(),
            step: _gameBBListIndex,
            lane: activeTileLane(),
            soundOn: soundMode === 'on'
        });
    }

    /**
     * CONTRACT.md §3 types `lane` as `number|null`. Before a round has started
     * there is no "current" tile as far as the consumer is concerned, so report
     * null at idle even though a target row has already been generated.
     */
    function activeTileLane() {
        if (!_gameStart && !_gameOver) return null;
        var p = _gameBBList[_gameBBListIndex];
        return p && typeof p.cell === 'number' ? p.cell : null;
    }

    function activeTile() {
        var p = _gameBBList[_gameBBListIndex];
        if (!p || typeof p.cell !== 'number') return null;
        var num = parseInt(String(p.id).split('-').pop(), 10);
        return {
            id: p.id,
            lane: p.cell,
            row: isFinite(num) ? Math.floor(num / 4) : null,
            index: isFinite(num) ? num : null
        };
    }

    function reset() {
        clearRoundTimers();
        hideGameScoreLayer();
        setDisplay(byId('RecordsLayer'), 'none');
        _recordsOpen = false;
        gameRestart();
    }

    function start() {
        if (_gameOver) {
            // A finished round must be cleared before a new one can begin.
            gameRestart();
        }
        welcomeLayerClosed = true;
        setDisplay(byId('welcome'), 'none');
        beginRound();
        updatePanel();
        return true;
    }

    function isOver() { return _gameOver === true; }
    function isStarted() { return _gameStart === true; }
    function currentBlockSize() { return blockSize; }

    w.KanoGame = {
        version: VERSION,
        MODE_NORMAL: MODE_NORMAL,
        MODE_ENDLESS: MODE_ENDLESS,
        MODE_PRACTICE: MODE_PRACTICE,
        getMode: getMode,
        setMode: setMode,
        getBest: getBest,
        getState: getState,
        press: press,
        start: start,
        reset: reset,
        gameOver: function () { return gameOver({ complete: false }); },
        loadRecords: loadRecords,
        clearRecords: function () { return clearRecords(); },
        isOver: isOver,
        isStarted: isStarted,
        blockSize: currentBlockSize,
        activeTile: activeTile,
        refreshLayout: refreshLayout
    };

    /* Globals index.html calls. `w.x = f` makes them callable from inline
     * handlers regardless of the IIFE scope. */
    w.init = init;
    w.readyBtn = readyBtn;
    w.replayBtn = replayBtn;
    w.backBtn = backBtn;
    w.changeMode = changeMode;
    w.show_setting = show_setting;
    w.show_btn = show_btn;
    w.show_records = show_records;
    w.hide_records = hide_records;
    w.save_cookie = save_cookie;
    w.changeSoundMode = changeSoundMode;
    w.getClickBeforeImage = getClickBeforeImage;
    w.saveClickBeforeImage = saveClickBeforeImage;
    w.getClickAfterImage = getClickAfterImage;
    w.saveClickAfterImage = saveClickAfterImage;
    w.clearRecords = clearRecordsPublic;
    w.togglePause = togglePause;
    // Not called by index.html, but the test harness (and any embedder) may
    // reach for a plain global. Mirrors KanoGame.gameOver().
    w.gameOver = function () { return gameOver({ complete: false }); };

    // CONTRACT.md §2: these are globals so inline handlers work.
    w.MODE_NORMAL = MODE_NORMAL;
    w.MODE_ENDLESS = MODE_ENDLESS;
    w.MODE_PRACTICE = MODE_PRACTICE;
}(window, document));
