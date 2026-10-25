/**
 * Kano Beat — static/audio.js
 * ---------------------------------------------------------------------------
 * Classic script (NO import/export, no `type="module"`) so the game also works
 * when index.html is opened straight from `file://`.
 *
 * Exposes exactly the frozen API from CONTRACT.md section 3:
 *
 *   KanoAudio.register(opts)  -> Promise<void>   opts: {tap, end, err}
 *   KanoAudio.play(id, opts)  -> boolean         opts: {rate, volume}
 *   KanoAudio.setEnabled(on)  -> boolean         the new state
 *   KanoAudio.isEnabled()     -> boolean
 *   KanoAudio.unlock()        -> Promise<boolean>
 *   KanoAudio.debug()         -> plain status object (extra, tests may read it)
 *
 * Design notes / why it looks like this:
 *  - `<audio>` elements are the ONLY playback path that is guaranteed to work
 *    on `file://`, in private mode, and in every browser, so they are the
 *    backbone. Roughly six pooled nodes per sound id are round-robined so that
 *    rapid overlapping taps do not cut each other off.
 *  - Web Audio is a pure *upgrade*: only when `location.protocol !== 'file:'`
 *    (because `file://` blocks fetch/XHR to local files) AND AudioContext AND
 *    decodeAudioData all exist, we pull each clip as an ArrayBuffer over XHR
 *    and decode it. Web Audio gives sample-accurate, unlimited-voice playback
 *    with `playbackRate` — much better for a rhythm game. Any failure at all
 *    is swallowed and we keep using `<audio>`.
 *  - NOTHING in this file ever throws. Every entry point is wrapped; a broken
 *    audio layer must never break the game.
 */
(function (w, d) {
    'use strict';

    var VERSION = '1.0.0';

    /* ------------------------------------------------------------------ *
     * State
     * ------------------------------------------------------------------ */

    /** id -> { src, buffers:[HTMLAudioElement], index, webAudio:AudioBuffer|null } */
    var sounds = Object.create(null);
    var ids = [];
    var enabled = true;
    var registered = false;
    var registerPromise = null;

    var audioCtx = null;
    var audioCtxTried = false;

    var unlockPromise = null;
    var unlocked = false;

    /** Default character per sound id. `err` is deliberately pitched down and
     *  slightly quieter so that when tap.mp3 and err.mp3 are the same file (the
     *  user's build ships the same clip for both) the two are still audibly
     *  distinguishable, as the task requires. */
    var DEFAULTS = {
        tap: { rate: 1, volume: 1 },
        end: { rate: 1, volume: 1 },
        err: { rate: 0.82, volume: 0.85 }
    };

    var POOL_SIZE = 6;

    function num(v, fallback) {
        v = typeof v === 'number' ? v : parseFloat(v);
        return isFinite(v) ? v : fallback;
    }

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    /* ------------------------------------------------------------------ *
     * Web Audio (optional upgrade)
     * ------------------------------------------------------------------ */

    function canUseWebAudio() {
        // `file://` blocks XHR/fetch of sibling files in Chrome, so on file://
        // we deliberately never even try — the <audio> path covers it.
        if (location.protocol === 'file:') return false;
        var AC = w.AudioContext || w.webkitAudioContext;
        if (!AC || typeof AC !== 'function') return false;
        if (typeof ArrayBuffer === 'undefined' || typeof ArrayBuffer.prototype.slice !== 'function') return false;
        return true;
    }

    function getAudioContext() {
        if (audioCtx || audioCtxTried) return audioCtx;
        audioCtxTried = true;
        try {
            if (!canUseWebAudio()) return null;
            var AC = w.AudioContext || w.webkitAudioContext;
            audioCtx = new AC();
        } catch (e) {
            audioCtx = null;
        }
        return audioCtx;
    }

    /** Fetch one clip as an ArrayBuffer via XHR. Rejects on any problem. */
    function fetchArrayBuffer(url) {
        return new Promise(function (resolve, reject) {
            var xhr;
            try {
                xhr = new XMLHttpRequest();
            } catch (e) {
                reject(e);
                return;
            }
            var settled = false;
            function done(fn, arg) {
                if (settled) return;
                settled = true;
                fn(arg);
            }
            try {
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function () {
                    var okStatus = (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300));
                    if (!okStatus || !xhr.response) {
                        done(reject, new Error('xhr status ' + xhr.status));
                        return;
                    }
                    done(resolve, xhr.response);
                };
                xhr.onerror = function () { done(reject, new Error('xhr error')); };
                xhr.onabort = function () { done(reject, new Error('xhr abort')); };
                xhr.ontimeout = function () { done(reject, new Error('xhr timeout')); };
                xhr.send();
            } catch (e) {
                done(reject, e);
            }
        });
    }

    function decodeToBuffer(entry) {
        var ctx = getAudioContext();
        if (!ctx || !entry || !entry.src) return Promise.resolve(null);
        return fetchArrayBuffer(entry.src).then(function (ab) {
            return new Promise(function (resolve) {
                var settled = false;
                function finish(v) { if (!settled) { settled = true; resolve(v); } }
                try {
                    // `decodeAudioData` may be callback-based (older Safari) or
                    // promise-based; handle both without ever throwing.
                    var maybe = ctx.decodeAudioData(ab.slice(0), function (buf) { finish(buf); }, function () { finish(null); });
                    if (maybe && typeof maybe.then === 'function') {
                        maybe.then(function (buf) { finish(buf); }, function () { finish(null); });
                    }
                } catch (e) {
                    finish(null);
                }
            });
        }).catch(function () { return null; });
    }

    /* ------------------------------------------------------------------ *
     * <audio> element pool — the guaranteed path
     * ------------------------------------------------------------------ */

    function makeElement(src) {
        var el = null;
        try {
            el = new Audio();
            el.preload = 'auto';
            el.src = src;
            // Keep it out of the layout flow entirely.
            el.style.display = 'none';
            // A failed load must never surface as an unhandled error.
            el.addEventListener('error', function () { /* fall back silently */ });
        } catch (e) {
            el = null;
        }
        return el;
    }

    function buildPool(entry) {
        entry.buffers = [];
        for (var i = 0; i < POOL_SIZE; i++) {
            var el = makeElement(entry.src);
            if (el) entry.buffers.push(el);
        }
    }

    function playViaElements(entry, rate, volume) {
        if (!entry.buffers || !entry.buffers.length) return false;
        var el = entry.buffers[entry.index % entry.buffers.length];
        entry.index = (entry.index + 1) % entry.buffers.length;
        try {
            el.volume = clamp(volume, 0, 1);
            // playbackRate is not implemented for <audio> in every browser;
            // assigning an unsupported value is harmless.
            el.playbackRate = rate;
            el.currentTime = 0;
            var p = el.play();
            if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay policy */ });
            return true;
        } catch (e) {
            return false;
        }
    }

    function playViaWebAudio(entry, rate, volume) {
        var ctx = getAudioContext();
        if (!ctx || !entry.webAudio) return false;
        try {
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
            var source = ctx.createBufferSource();
            source.buffer = entry.webAudio;
            source.playbackRate.value = rate;
            var gain = ctx.createGain();
            gain.gain.value = clamp(volume, 0, 1);
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(0);
            return true;
        } catch (e) {
            return false;
        }
    }

    /* ------------------------------------------------------------------ *
     * Public API
     * ------------------------------------------------------------------ */

    function register(opts) {
        try {
            if (registerPromise) return registerPromise; // idempotent
            opts = opts || {};
            var wanted = { tap: 'tap', end: 'end', err: 'err' };
            var srcs = opts.sounds || opts;
            for (var key in wanted) {
                if (!Object.prototype.hasOwnProperty.call(wanted, key)) continue;
                var src = srcs[key];
                if (typeof src !== 'string' || !src) continue;
                if (sounds[key]) continue; // keep the first registration
                var entry = {
                    id: key,
                    src: src,
                    buffers: [],
                    index: 0,
                    webAudio: null,
                    decodeFailed: false
                };
                sounds[key] = entry;
                ids.push(key);
                buildPool(entry);
            }
            registered = ids.length > 0;

            var decodes = [];
            for (var i = 0; i < ids.length; i++) {
                var ent = sounds[ids[i]];
                if (!canUseWebAudio()) { ent.decodeFailed = true; continue; }
                decodes.push(decodeToBuffer(ent).then(function (entry) {
                    return function (buf) {
                        if (buf) entry.webAudio = buf;
                        else entry.decodeFailed = true;
                    };
                }(ent)));
            }

            registerPromise = Promise.all(decodes).then(function () {
                return undefined;
            }).catch(function () {
                return undefined;
            });
            return registerPromise;
        } catch (e) {
            registerPromise = Promise.resolve(undefined);
            return registerPromise;
        }
    }

    function play(id, opts) {
        try {
            if (!enabled) return false;
            var entry = sounds[id];
            if (!entry) return false;

            opts = opts || {};
            var def = DEFAULTS[id] || { rate: 1, volume: 1 };
            var rate = num(opts.rate, def.rate);
            var volume = num(opts.volume, def.volume);
            if (rate <= 0) rate = def.rate;

            var ok = false;
            if (entry.webAudio) ok = playViaWebAudio(entry, rate, volume);
            if (!ok) ok = playViaElements(entry, rate, volume);
            return ok === true;
        } catch (e) {
            return false;
        }
    }

    function setEnabled(on) {
        try {
            enabled = !!on;
            if (!enabled) {
                // Pause / release everything currently sounding.
                for (var i = 0; i < ids.length; i++) {
                    var entry = sounds[ids[i]];
                    if (!entry || !entry.buffers) continue;
                    for (var j = 0; j < entry.buffers.length; j++) {
                        try {
                            entry.buffers[j].pause();
                            entry.buffers[j].currentTime = 0;
                        } catch (e) { /* ignore */ }
                    }
                }
            }
        } catch (e) {
            /* never throw */
        }
        return enabled;
    }

    function isEnabled() {
        return enabled === true;
    }

    function unlock() {
        try {
            if (unlockPromise) return unlockPromise;
            unlockPromise = new Promise(function (resolve) {
                var ctx = getAudioContext();
                if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                    var p = ctx.resume();
                    if (p && typeof p.then === 'function') {
                        p.then(function () { unlocked = true; resolve(true); },
                            function () { resolve(false); });
                        return;
                    }
                }
                // Also prime the <audio> elements: a silent, near-zero-volume
                // play() inside a user gesture is what actually satisfies the
                // mobile autoplay policies.
                var primed = false;
                for (var i = 0; i < ids.length; i++) {
                    var entry = sounds[ids[i]];
                    if (!entry || !entry.buffers || !entry.buffers.length) continue;
                    try {
                        var el = entry.buffers[0];
                        var vol = el.volume;
                        el.volume = 0;
                        el.currentTime = 0;
                        var pr = el.play();
                        if (pr && typeof pr.then === 'function') {
                            pr.then(function (e) {
                                return function () {
                                    try { e.pause(); e.currentTime = 0; e.volume = vol; } catch (err) { /* ignore */ }
                                };
                            }(el), function () { try { el.volume = vol; } catch (err) { /* ignore */ } });
                        } else {
                            try { el.pause(); el.currentTime = 0; el.volume = vol; } catch (err) { /* ignore */ }
                        }
                        primed = true;
                    } catch (e) { /* ignore */ }
                }
                if (ctx) unlocked = true;
                resolve(primed || !!ctx);
            });
            return unlockPromise;
        } catch (e) {
            unlockPromise = Promise.resolve(false);
            return unlockPromise;
        }
    }

    /**
     * Small status object. Distinguishes the three failure reasons a caller
     * might care about: not registered yet / unknown id / disabled.
     */
    function debug() {
        var state = {};
        try {
            for (var i = 0; i < ids.length; i++) {
                var entry = sounds[ids[i]];
                state[ids[i]] = {
                    src: entry.src,
                    pool: entry.buffers ? entry.buffers.length : 0,
                    webAudio: !!entry.webAudio,
                    decodeFailed: !!entry.decodeFailed
                };
            }
            return {
                version: VERSION,
                registered: registered,
                enabled: enabled === true,
                // Explicit, ordered reason a play() call would be refused:
                // 'disabled' | 'unregistered' | 'ready'. Callers/tests can
                // distinguish the three cases without inferring them.
                state: !enabled ? 'disabled' : (registered ? 'ready' : 'unregistered'),
                unlocked: unlocked,
                protocol: location.protocol,
                webAudioAvailable: canUseWebAudio(),
                webAudioActive: !!(audioCtx && audioCtx.state === 'running'),
                audioContextState: audioCtx ? audioCtx.state : null,
                ids: ids.slice(),
                unknownId: function (id) { return !sounds[id]; },
                sounds: state
            };
        } catch (e) {
            return {
                version: VERSION,
                registered: registered,
                enabled: enabled === true,
                state: !enabled ? 'disabled' : (registered ? 'ready' : 'unregistered'),
                error: String(e)
            };
        }
    }

    function status(id) {
        // Convenience for tests / debugging: 'disabled' | 'unknown' | 'unregistered' | 'ready'
        try {
            if (!enabled) return 'disabled';
            if (!registered) return 'unregistered';
            if (!sounds[id]) return 'unknown';
            var e = sounds[id];
            return (e.webAudio || (e.buffers && e.buffers.length)) ? 'ready' : 'unavailable';
        } catch (err) {
            return 'unknown';
        }
    }

    w.KanoAudio = {
        version: VERSION,
        register: register,
        play: play,
        setEnabled: setEnabled,
        isEnabled: isEnabled,
        unlock: unlock,
        debug: debug,
        status: status
    };
}(window, document));
