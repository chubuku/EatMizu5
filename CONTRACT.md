# Kano Beat — Frozen Interface Contract v1

**Every writer must code against this file.** Do not change it; if something here
is unworkable, message the Lead instead of silently diverging.

Project root: `C:\Users\user\Documents\deepseek-harness\default-workspace\kano-game`

A reskin/rebuild of [arcxingye/EatKano](https://github.com/arcxingye/EatKano) (MIT),
using the user's own art and audio. Reference checkout for behavioural parity lives at
`..\eatkano-ref\` (read-only for everyone).

---

## 1. File ownership (do not write outside your scope)

| Path | Owner |
|---|---|
| `index.html` | T3 |
| `static/index.css` | T3 |
| `static/index.js` | T3 |
| `static/game.js` | T4 |
| `static/audio.js` | T4 |
| `static/i18n/*.json` | T2 |
| `static/image/**`, `static/music/**`, `tools/**` | T1 |
| `tests/**` | T5 |
| `README.md` | T6 |
| `CONTRACT.md` | Lead |

There is deliberately **no** `vendor/**` directory. The shipped site has zero
external dependencies, so there is nothing to vendor.

No CDN, no npm runtime dependencies. The site must work opened from `file://`
**and** over `http://localhost`.

---

## 2. `index.html` — required DOM contract

T3 owns the markup. Required ids/classes, which `game.js` and `audio.js` depend on:

### Board

```html
<div id="GameLayerBG">                 <!-- tap target; click/keyboard routed here -->
  <div id="GameLayer1" class="GameLayer"> <!-- 40 children -->
    <div id="GameLayer1-0" class="block" num="0"></div>   <!-- 0..39 -->
    ...
  </div>
  <div id="GameLayer2" class="GameLayer"> <!-- 40 children, ids GameLayer2-0..39 -->
    ...
  </div>
</div>
<div id="GameTimeLayer"></div>
```

**Exact child order is a contract.** Index `j` in `0..39` maps to:
`left = (j % 4) * blockSize`, `bottom = floor(j / 4) * blockSize`.
So index `0..3` is the bottom row, lanes 0..3 left→right, and index `39` is the top row.
Lane `k` of row `r` has index `r * 4 + k`.

Tiles are `<div>`, not `<button>` — the original relies on hit-testing `e.target`.

### Screens

- `#welcome` — title screen overlay (`class="SHADE BOX-M"`), contains `.welcome-bg`
- `#btn_group` — start / mode / records / settings buttons
- `#desc` — intro text block
- `#setting` — settings panel, `display:none` by default
- `#GameScoreLayer` — results overlay, `display:none` by default

### Settings inputs (exact ids)

| id | purpose | notes |
|---|---|---|
| `title` | page/board title | text |
| `keyboard` | 4 lane keys | `maxlength=4` |
| `gameTime` | seconds for normal mode | `maxlength=4` |
| `click-before-image` | `<input type=file>`, `class="d-none"` | |
| `click-after-image` | `<input type=file>`, `style="display:none"` | |
| `sound` | `<a id="sound">` sound toggle label | no onclick attribute — wired in JS |

### Score overlay values (exact ids)

`#GameScoreLayer-text`, `#cps`, `#score`, `#best`,
`#GameScoreLayer-CPS`, `#GameScoreLayer-score`, `#GameScoreLayer-bast`,
plus a focused-on-open button `#replay`.

New stat rows (ids fixed): `#maxCombo`, `#hits`, `#misses`, `#accuracy`.

### Records overlay (new, T3 builds, T4 renders)

```html
<div id="RecordsLayer" style="display:none">
  <div id="RecordsLayer-text"></div>      <!-- heading + subtitle go here -->
  <div id="RecordsLayer-list"></div>      <!-- T4 fills this with rows -->
  <button id="records-clear">…</button>   <!-- label from I18N['records-clear'] -->
  <button id="records-close">…</button>
</div>
```

`#RecordsLayer-list` stays empty until the user opens Records. `game.js` renders
`<div class="record-row">` elements into it. T3 must style `.record-row`,
`.record-row.top`, and `.record-rank`, `.record-score`, `.record-meta`.

### Accessibility

- `#GameLayerBG` gets `role="application"` and `aria-label` = `I18N['a11y-board']`.
- `#GameTimeLayer` gets `role="status"` and `aria-live="polite"`.
- The board also gets a visually-hidden hint `<p id="a11y-hint">` filled from `I18N['a11y-hint']`.

### Global functions index.html may call (all defined by T4 on `window`)

`init()`, `readyBtn()`, `replayBtn()`, `backBtn()`, `changeMode(m)`,
`show_setting()`, `show_btn()`, `show_records()`, `hide_records()`,
`save_cookie()`, `changeSoundMode()`, `getClickBeforeImage()`,
`saveClickBeforeImage()`, `getClickAfterImage()`, `saveClickAfterImage()`,
`clearRecords()`, `togglePause()`

`MODE_NORMAL = 1`, `MODE_ENDLESS = 2`, `MODE_PRACTICE = 3` are globals on `window`.

`<body onload="init()">` is kept. `oncontextmenu` is suppressed.

---

## 3. `static/game.js` — cross-module API

`static/game.js` is the **only** `<script>` that loads after `static/audio.js`.
Both are classic scripts (no `type="module"`) so `file://` works without CORS pain.

T4 defines `window.KanoAudio` (in `audio.js`) and consumes it in `game.js`.

### `window.KanoAudio` (T4)

```js
KanoAudio = {
  register(opts) // -> Promise<void>; opts: {tap:'./static/music/tap.mp3',
                 //   end:'./static/music/end.mp3', err:'./static/music/err.mp3'}
  play(id, opts) // -> boolean; id in 'tap'|'end'|'err'.
                 //    opts: {rate?:number, volume?:number}. rate 1 = normal.
                 //    Never throws. Returns false if sound is off or unavailable.
  setEnabled(on) // -> boolean, the new state
  isEnabled()    // -> boolean
  unlock()       // -> Promise<boolean>; call from a user gesture to satisfy iOS autoplay
}
```

Rules: must never throw on any input, including unknown ids and a
`file://` origin where `fetch`/XHR to local files is blocked. Because
`file://` blocks `fetch`, **do not** implement decoding via `fetch`+`decodeAudioData`
as the only path — prefer `<audio>` elements, which work everywhere, with
`currentTime` reset and/or `cloneNode` for overlapping taps. If Web Audio is
available, use it (via `decodeAudioData` on an `ArrayBuffer` obtained from
`XMLHttpRequest` with `responseType='arraybuffer'` **only when**
`location.protocol !== 'file:'`), otherwise fall back cleanly.

Sound mode persists in cookie `soundMode` = `'on'` (default) | `'off'`.

### `window.KanoGame` (T4, exposed for tests)

```js
KanoGame = {
  version,                       // string
  MODE_NORMAL, MODE_ENDLESS, MODE_PRACTICE,
  getMode(), setMode(m),
  getBest(mode?),                // number
  getState(),                    // see below — must be a fresh snapshot object
  press(lane),                   // lane 0..3 — headless/synthetic equivalent of a keypress
  start(),                       // begin a round (starts the clock)
  reset(),                       // back to the idle pre-round state
  gameOver(),                    // force end (used by tests for endless mode)
  loadRecords(),                 // array of records from localStorage
  clearRecords(),                // wipe them; returns true
  isOver(), isStarted(),
  blockSize(),                   // current pixel size of one tile
  activeTile()                   // -> {id, lane, row, index} | null
}
```

`getState()` returns a **new plain object every call** (never a live internal ref):

```js
{
  mode: 1|2|3,
  started: boolean,
  over: boolean,
  score: number,          // integer taps landed
  cps: number,            // 0 when not computable; 2dp-ready float
  best: number,
  timeLeft: number,       // seconds remaining (normal mode)
  timeSetting: number,    // configured seconds
  combo: number,
  maxCombo: number,
  hits: number,
  misses: number,
  accuracy: number,       // 0..100
  step: number,           // _gameBBListIndex: how many rows consumed
  lane: number|null,      // lane of the currently active tile
  soundOn: boolean
}
```

### Persistence (cookies, same names as the original where they exist)

| cookie | values | default |
|---|---|---|
| `gameMode` | `1`/`2`/`3` | `1` |
| `soundMode` | `on`/`off` | `on` |
| `title` | string | `I18N['eat-kano']` |
| `keyboard` | 4 chars, lowercased | `dfjk` |
| `gameTime` | integer seconds | `20` |
| `bast-score` | best for normal mode | `0` |
| `endless-best-score` | best for endless mode | `0` |
| `practice-best-score` | best for practice mode | `0` |

`bast-score` keeps the **original's typo** on purpose: it is a real user-visible
cookie name and changing it would silently discard existing players' best scores.
Add a comment saying so. Cookie writes expire in 100 days, like the original.

### `localStorage` keys (new — local leaderboard)

| key | shape |
|---|---|
| `kanoBeat.records.v1` | JSON `{"version":1,"records":[...]}`, newest first |

Record shape:

```js
{
  mode: 1|2|3,
  score: number,        // _gameScore (taps) for normal/practice; CPS for endless
  cps: number,          // always the raw CPS, 2 decimals when displayed
  combo: number, maxCombo: number,
  hits: number, misses: number,
  accuracy: number,     // 0..100, 1 decimal
  timeSetting: number,
  durationMs: number,
  endedAt: number,      // Date.now()
  complete: boolean,    // false if the player quit mid-round
  deviationMs: number   // round length overshoot vs. configured time
}
```

Cap at **20** records. Every read/write is wrapped in `try/catch` — `file://` and
private-mode browsers can throw on `localStorage` access, and that must never
break the game. If `localStorage` is unavailable, degrade to an in-memory array
and keep playing.

### Gameplay rules table (parity with the original — T4 implements, T5 tests)

| Rule | Value |
|---|---|
| Lanes | 4, left→right = indices 0..3 at `left = lane * blockSize` |
| Default keys | `d`→lane 0, `f`→1, `j`→2, `k`→3 (lowercased; configurable) |
| Visible rows | 10 per layer, 2 layers, 40 children each |
| Row cycle | each layer scrolls 10 rows then wraps to the top |
| Tap zone | `y` must satisfy `innerHeight - 3*blockSize < y < innerHeight` |
| Correct tap | `e.target` **is** the active tile, or the `x` position falls in the active tile's lane |
| Correct tap effect | sfx `tap`; score+1; combo+1; row advances by one `blockSize`; scroll transitions `150ms` |
| Wrong tap | sfx `err`; if `gameMode === MODE_PRACTICE` → `.bad` for 500 ms then continue; else **immediate game over** |
| "Wrong tap" definition | tapping an empty tile after the round started |
| Taps before round start | the first valid tap starts the clock; taps while `!started` on empty tiles do nothing |
| Normal mode | countdown from `gameTime` (default 20 s), tick every 1000 ms; at 0 → `#GameTimeLayer` shows `I18N['time-up']!`, `#GameLayerBG` gets `.flash`, sfx `end`, results after 1500 ms; score = taps; best in `bast-score` |
| Endless mode | no timer; HUD shows `CPS:<value 2dp or I18N['calculating']>`; score = CPS; best in `endless-best-score` |
| Practice mode | HUD shows `SCORE:<n>`; never game-overs on a miss; **no** record is written |
| CPS | `score / ((now - startTime) / 1000)`, and **0** when `NaN`, `Infinity`, or `elapsedSeconds < 2` |
| Combo | resets to 0 on a wrong tap and on game over |
| Accuracy | `hits / (hits + misses) * 100`, `100` when there are no misses and no hits is **0** |
| Anti-cheat `time-over` | if a normal round lasted longer than `(timeSetting + 3) * 1000` ms, the results text becomes `I18N['time-over'] + overshootSeconds.toFixed(2) + 's'` and no record is saved. Reproduce it; it is part of the original. |
| Final rating | `cps <= 5` → `text-level-1`; `<= 8` → 2; `<= 10` → 3; `<= 15` → 4; else 5 |

### Records (new)

- Written on game over for `MODE_NORMAL` and `MODE_ENDLESS` only, and only when
  the `time-over` check passes. Practice never writes.
- `show_records()` must work **while a round is in progress**: it pauses the game
  (clears the clock interval, ignores taps), and `hide_records()` resumes it
  without disturbing score, combo, or the active tile.
- `clearRecords()` wipes storage and re-renders an empty list.

---

## 4. `static/index.css` — theme

Original palette is a pale blue game area (`#b8dfe6` grid lines on white) with a
coral HUD (`rgb(233, 138, 131)`). Shift it to match the user's art — a warm
crimson/salmon anime illustration. Required custom properties on `:root`:

```css
--kb-bg:        /* page backdrop, dark */
--kb-board:     /* game area fill */
--kb-grid:      /* grid line colour */
--kb-accent:    /* HUD + primary buttons, warm coral/crimson */
--kb-accent-2:  /* secondary accent */
--kb-text:      /* body text */
--kb-tile:      /* tile art background-size basis */
```

Required class names preserved from the original, because behaviour and the
reskin both depend on them: `.SHADE`, `.BOX-M`, `.FILL`, `.GameLayer`, `.block`,
`.bl`, `.t1`..`.t5`, `.tt1`..`.tt5`, `.bad`, `.flash`, `.loading`, `.welcome-bg`,
`#gameBody`, `#btn_group`, `#setting`.

`.t1`..`.t5` must set `background-image: url(./image/ClickBefore.png)` and
`background-size: auto 100%`; `.tt1`..`.tt5` must set
`background-image: url(./image/ClickAfter.png)` and `background-size: auto 86%`.
T4 relies on the class name alone carrying the visual, exactly like the original.

New required classes: `.record-row`, `.record-row.top`, `.record-rank`,
`.record-score`, `.record-meta`, `.visually-hidden`, `.mode-desc`, `.paused`.

No `@import`, no remote `url()`. Use system font stacks only.

---

## 5. Definition of done for every task

1. Files written at the exact paths above.
2. You ran something that proves it works, and you paste the raw output.
3. `node --check` passes on any `.js` you wrote.
4. You did not touch another owner's paths.
5. You report: what you changed, the evidence, and anything you could not verify.
