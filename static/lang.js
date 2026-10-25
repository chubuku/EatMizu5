/**
 * Kano Beat — document language normalisation.
 *
 * Loaded as a CLASSIC script (not a module) BEFORE static/game.js.
 *
 * WHY THIS EXISTS
 *   index.html must ship a concrete `lang` attribute, but the game is
 *   trilingual. If the markup says lang="en" while game.js has swapped every
 *   visible string to Japanese or Chinese, assistive technology announces the
 *   page in the wrong language. game.js does set documentElement.lang once it
 *   resolves a locale — but under `file://` that can take a moment, and a
 *   stored user preference should win outright.
 *
 * WHAT IT DOES
 *   1. Uses the player's saved choice from localStorage['kanoBeat.lang'] when
 *      present (that is what the #lang selector writes).
 *   2. Otherwise mirrors the same navigator.language mapping game.js uses, so
 *      the markup is right even before game.js runs.
 *   3. Sets both `lang` and `dir` so it stays correct if an RTL locale is ever
 *      added.
 *
 * It never throws: a broken/blocked localStorage or an exotic navigator object
 * leaves the markup's own `lang` in place.
 */
(function (w, d) {
    'use strict';

    var STORAGE_KEY = 'kanoBeat.lang';
    var SUPPORTED = ['en', 'ja', 'zh'];

    // Same precedence as game.js so the two can never disagree.
    var LANGUAGES = [
        { regex: /^zh\b/i, lang: 'zh' },
        { regex: /^ja\b/i, lang: 'ja' }
    ];
    var DEFAULT_LANG = 'en';

    function normalise(value) {
        if (value == null) return null;
        var s = String(value).toLowerCase();
        // Accept both "ja" and "ja-JP".
        var base = s.split(/[-_]/)[0];
        return SUPPORTED.indexOf(base) !== -1 ? base : null;
    }

    function storedLang() {
        try {
            return normalise(w.localStorage.getItem(STORAGE_KEY));
        } catch (e) {
            // file:// with blocked storage, private mode, etc.
            return null;
        }
    }

    function navigatorLang() {
        try {
            var raw = (w.navigator && (w.navigator.language || w.navigator.userLanguage)) || '';
            for (var i = 0; i < LANGUAGES.length; i++) {
                if (LANGUAGES[i].regex.test(raw)) return LANGUAGES[i].lang;
            }
        } catch (e) { /* fall through */ }
        return DEFAULT_LANG;
    }

    function resolveLang() {
        return storedLang() || navigatorLang() || DEFAULT_LANG;
    }

    function apply(lang) {
        try {
            var el = d.documentElement;
            if (!el) return lang;
            el.setAttribute('lang', lang);
            // Only these three are shipped, all LTR. Kept explicit so adding an
            // RTL locale later is a one-line change rather than a mystery.
            el.setAttribute('dir', lang === 'ar' || lang === 'he' || lang === 'fa' ? 'rtl' : 'ltr');
        } catch (e) { /* never fatal */ }
        return lang;
    }

    var resolved = apply(resolveLang());

    // Public, so game.js and the #lang selector can keep it in one place.
    w.KanoLang = {
        storageKey: STORAGE_KEY,
        supported: SUPPORTED.slice(),
        current: resolved,
        /** Persist + apply a language; returns the language actually applied. */
        set: function (lang) {
            var next = normalise(lang) || DEFAULT_LANG;
            try { w.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
            this.current = apply(next);
            return this.current;
        },
        /** Re-apply the stored/navigator choice. Used after a settings reset. */
        refresh: function () {
            this.current = apply(resolveLang());
            return this.current;
        }
    };

    // If index.html's markup ever nests a translated subtree, this keeps it
    // honest. Cheap, and a no-op when nothing matches.
    try {
        if (d.readyState === 'loading') {
            d.addEventListener('DOMContentLoaded', function () {
                apply(w.KanoLang.current);
            });
        }
    } catch (e) { /* ignore */ }
}(window, document));
