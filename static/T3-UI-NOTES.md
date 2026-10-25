# T3 — UI notes, deviations and acceptance evidence

Owner: **T3** (`ui-dev`). Write scope: `index.html`, `static/index.css`,
`static/T3-UI-NOTES.md`, `tests/artifacts/`.

Files shipped:

| File | Purpose |
|---|---|
| `index.html` | all markup: board, screens, score/records overlays, settings |
| `static/index.css` | warm crimson/salmon theme, responsive, no CDN |
| `tests/artifacts/t3-checks.cjs` | static contract verification (exit 0 = pass) |
| `tests/artifacts/t3-visual.cjs` | headless layout + screenshots via `tests/harness.cjs` |
| `tests/artifacts/t3-checks-output.txt` | captured passing output |
| `tests/artifacts/ui-480x800.png`, `ui-1280x800.png` | screenshots |

---

## 1. Zero external resources

`node tests/artifacts/t3-checks.cjs`, section 1:

```
== 1. Zero external resources ========================================
  [PASS] index.html contains zero "http://" or "https://" — count=0
  [PASS] index.html contains zero type="module" — count=0
  [PASS] all src/href values are relative, data: or javascript:void — ./static/index.css, data:,, ./static/audio.js, ./static/game.js
  [PASS] scripts load audio.js then game.js, in that order — ./static/audio.js -> ./static/game.js
```

Independent one-liner (PowerShell):

```
PS> (Select-String -Path index.html -Pattern 'https?://' -AllMatches).Count
0
PS> (Select-String -Path index.html -Pattern 'type="module"' -AllMatches).Count
0
```

There is no `xmlns` attribute anywhere, so the doctype/namespace false positives
called out in the task do not arise. The only non-relative attribute values are
`href="data:,"` (favicon) and `href="javascript: void(0);"` on the `#mode`
anchor, which is the reference's own non-navigating idiom and performs no
network request.

## 2. Board tiles — ids, order, num, classes

```
== 2. Board tiles (80 static divs, exact ids/order/classes) ==========
  [PASS] exactly 80 static tile divs present — count=80
  [PASS] exactly 80 GameLayerN-j ids in document order — count=80
  [PASS] #GameLayer1-0..39 then #GameLayer2-0..39 in that exact order
  [PASS] every num attribute equals the tile index
  [PASS] class is "block", plus " bl" exactly when index % 4 !== 0
  [PASS] tile classes drawn only from {block, block bl}

  --- first 8 tiles, in document order ---
    idx  0  GameLayer1-0  num=0  class="block"
    idx  1  GameLayer1-1  num=1  class="block bl"
    idx  2  GameLayer1-2  num=2  class="block bl"
    idx  3  GameLayer1-3  num=3  class="block bl"
    idx  4  GameLayer1-4  num=4  class="block"
    idx  5  GameLayer1-5  num=5  class="block bl"
    idx  6  GameLayer1-6  num=6  class="block bl"
    idx  7  GameLayer1-7  num=7  class="block bl"
  --- bottom row of each layer (the 0..3 row) ---
    layer1 row0: GameLayer1-0(0), GameLayer1-1(1), GameLayer1-2(2), GameLayer1-3(3)
    layer2 row0: GameLayer2-0(0), GameLayer2-1(1), GameLayer2-2(2), GameLayer2-3(3)
  --- contended index 39 (top row, last tile) ---
    GameLayer1-39 num=39 class="block bl"
```

`#GameLayer1-0` is the **first child** of `#GameLayer1`, so it is the bottom-left
tile; index `39` is the last child, i.e. the top row. Indices `0..3` are the
bottom row, lanes 0..3 left→right.

**The `bl` rule matches the reference exactly.** `eatkano-ref/static/index.js:399`
builds the class as `'block' + (k ? ' bl' : '')`, where the inner loop variable
`k` is the lane and the index is `k + j*4`. Therefore `bl` is present iff
`index % 4 !== 0` — lane 0 of every row has no left border. My generator uses
`" bl" if j % 4 != 0`, and the checker re-derives the rule from `num`:

```
[PASS] class is "block", plus " bl" exactly when index % 4 !== 0
```

There are **no** duplicate ids anywhere in the document (checked, 123 unique).

## 3. Every id required by CONTRACT.md §2

```
== 3. Every id required by CONTRACT.md §2 exists =====================
  [PASS] CONTRACT §2 id count present in index.html — checking 38 ids
    [PASS] #GameLayerBG   [PASS] #GameLayer1     [PASS] #GameLayer2
    [PASS] #welcome       [PASS] #btn_group      [PASS] #desc
    [PASS] #setting       [PASS] #GameScoreLayer [PASS] #gameBody
    [PASS] #title         [PASS] #keyboard       [PASS] #gameTime
    [PASS] #click-before-image  [PASS] #click-after-image  [PASS] #sound
    [PASS] #GameScoreLayer-text [PASS] #cps      [PASS] #score    [PASS] #best
    [PASS] #GameScoreLayer-CPS  [PASS] #GameScoreLayer-score
    [PASS] #GameScoreLayer-bast [PASS] #replay
    [PASS] #maxCombo      [PASS] #hits           [PASS] #misses   [PASS] #accuracy
    [PASS] #RecordsLayer  [PASS] #RecordsLayer-text  [PASS] #RecordsLayer-list
    [PASS] #records-clear [PASS] #records-close
    [PASS] #mode          [PASS] #mode-menu      [PASS] #mode-desc
    [PASS] #a11y-hint     [PASS] #GameTimeLayer  [PASS] #landscape
  [PASS] all CONTRACT §2 ids present — 38/38
  [PASS] no duplicate ids — 123 unique ids
```

## 4. Attributes, handlers, i18n hooks

```
== 4. Required attributes, handlers and i18n hooks ===================
  [PASS] <body onLoad="init()">
  [PASS] oncontextmenu suppressed
  [PASS] <html lang="en">
  [PASS] favicon data: link
  [PASS] theme-color meta
  [PASS] meta description
  [PASS] noscript warning
  [PASS] #GameLayerBG role="application"
  [PASS] #GameLayerBG has empty aria-label (JS fills it)
  [PASS] #GameTimeLayer role="status"
  [PASS] #GameTimeLayer aria-live="polite"
  [PASS] #a11y-hint.visually-hidden inside board
  [PASS] #RecordsLayer display:none
  [PASS] #setting display:none
  [PASS] #GameScoreLayer display:none
  [PASS] #mode-menu is a <ul>
  [PASS] 3 .dropdown-item mode entries
  [PASS] #replay calls replayBtn()
  [PASS] #records-clear calls clearRecords()
  [PASS] #records-close calls hide_records()
  [PASS] records-clear i18n key
  [PASS] settings OK button
  [PASS] no username/message inputs
  [PASS] no Bootstrap class soup
  [PASS] all reference data-i18n keys preserved — 27 keys
  [PASS] data-placeholder-i18n keys preserved — eat-kano, default-dfjk, default-20s
  [PASS] #GameScoreLayer-score wrapped in #score-row-wrapper
  [PASS] .score-row / .score-row .label / .score-row .value present — 7 rows
======================================================================
RESULT: ALL CHECKS PASSED
```

## 5. CSS contract coverage

Checked mechanically in section 5 of the run (all PASS):

- `:root` defines `--kb-bg`, `--kb-board`, `--kb-grid`, `--kb-accent`,
  `--kb-accent-2`, `--kb-text`, `--kb-tile` with exactly those names.
- Preserved selectors: `.SHADE`, `.BOX-M`, `.BOX-V`, `.BOX-D`, `.BOX-S`,
  `.BBOX`, `.FILL`, `#welcome`, `.welcome-bg`, `#GameLayerBG`,
  `#GameTimeLayer`, `.GameLayer`, `.block`, `.bl`, `.flash`, `.bad`,
  `.loading`, `#gameBody`, `#btn_group`, `#setting`, `#GameScoreLayer`,
  `#landscape`, `@keyframes flash`, and the global
  `* { -webkit-tap-highlight-color: rgba(0,0,0,0); user-select: none; }`.
- New classes: `.record-row`, `.record-row.top`, `.record-rank`,
  `.record-score`, `.record-meta`, `.mode-desc`, `.visually-hidden`,
  `.paused`, `.dropdown-menu`, `.dropdown-menu.show`, `.dropdown-item`,
  `.score-row`, `.label`, `.value`.
- `.t1..t5` → `background-image: url(./image/ClickBefore.png)`,
  `background-size: auto 100%`; `.tt1..tt5` → `url(./image/ClickAfter.png)`,
  `auto 86%`; `.block` carries `background-repeat: no-repeat` and
  `background-position: center`. Paths are relative (`./image/`), never absolute.
- Zero `@import` rules (the only textual match is the comment saying there are
  none), zero remote `url()`, zero `!important`, system font stack only,
  balanced braces/parens.
- `@media (prefers-reduced-motion: reduce)` disables the `.flash`/`.bad`
  animations and the button transition.
- `clamp()` used for font sizes; `100dvh` with a `100vh` fallback; overlays are
  `position: fixed` so they cover the viewport at every width.

## 5b. DOM structure validity

The document parses as correctly nested with **zero** mismatches (script/style
element *content* stripped first so the walker sees only markup):

```
script/style content stripped: 5685 chars
leftover unclosed: (none)
nesting mismatches: 0

first 6 id-bearing elements in document order: gameBody, GameLayerBG, GameLayer1, GameLayer1-0, GameLayer1-1, GameLayer1-2
contains gameBody before GameLayerBG: true
a11y-hint appears after GameLayer2: true
GameTimeLayer appears after a11y-hint: true
```

So the required containment/order is exact:
`#gameBody > #GameLayerBG > (#GameLayer1, #GameLayer2, #a11y-hint)`, then
`#GameTimeLayer` as the next sibling inside `#gameBody`.

The one inline `<script>` (the mode-dropdown toggle) syntax-checks clean under
`vm.Script`. (`node --check` cannot be used on it because it is embedded in HTML,
not a `.js` file; the contract's `node --check` requirement applies to standalone
`.js` files, and I wrote none.)

## 5c. Cross-checks against T4's real `game.js`

Once `game.js` landed I grepped it to confirm the markup matches what it actually
measures:

- `game.js:1224` — `body = byId('gameBody') || d.body`
- `game.js:532` — `blockSize = body.offsetWidth / 4`
- `game.js:246` — `board.setAttribute('aria-label', t('a11y-board'))`
- `game.js:247-248` — fills `#a11y-hint` from `a11y-hint`

My `#gameBody` is the element being measured, and both a11y hooks resolve. The
Lead independently confirmed geometry at a 480px viewport: `blockSize` is exactly
120, and `GameLayer1-0/1/2/3` sit at x = 0/120/240/360, y = 680 = 800 − 120, all
120×120 — the bottom row, correctly placed, over both `http://localhost` and
`file://`.

Also verified: `game.js` does **not** read `I18N['records']` (it consumes
`records-title`, `records-empty`, `records-clear`), so the key rename in 6.2
needed no change on T4's side.

---

## 6. Deviations from CONTRACT.md / task text

Everything in CONTRACT §2 is implemented literally. Four judgement calls:

### 6.1 Added `<div id="gameBody">` and the `kbToggleModeMenu()` helper (additive)

CONTRACT §4 requires the `#gameBody` rule be preserved, and the reference
creates that element at runtime with `document.write('<div id="gameBody">')`
before doing `body = document.getElementById('gameBody') || document.body` and
`blockSize = body.offsetWidth / 4` (`eatkano-ref/static/index.js:47,67,167`).

My task text forbids `document.write` and requires plain-CSS responsiveness. To
satisfy both, `#gameBody` is now a **real static element** wrapping
`#GameLayerBG` and `#GameTimeLayer`, styled `max-width: 640px; margin: 0 auto;
width: 100%; height: 100dvh` with **no padding or border**, and `#GameLayerBG`
is `position: absolute; width: 100%` inside it.

Consequence (`#gameBody.offsetWidth` == `#GameLayerBG.offsetWidth` ==
`document.body.offsetWidth` for block-size purposes): T4's
`getElementById('gameBody') || document.body` fallback yields the correct
640px-column tile size on desktop and full-bleed on mobile, and
`#GameLayerBG.offsetWidth / 4` agrees too. This was raised with the Lead and T4.

`kbToggleModeMenu(event)` is a second additive helper, and it was **required to
make the mode picker work at all**. The contract lists `changeMode(m)` for
*selecting* a mode but provides no function for *opening* the menu, while
requiring `#mode` to toggle it. I originally wired `#mode` to a global named
`toggleModeMenu` and asked T4 to define it; T4 never did (its 21 `window`
exports are `init`, `readyBtn`, `replayBtn`, `backBtn`, `changeMode`,
`show_setting`, `show_btn`, `show_records`, `hide_records`, `save_cookie`,
`changeSoundMode`, `getClickBeforeImage`, `saveClickBeforeImage`,
`getClickAfterImage`, `saveClickAfterImage`, `clearRecords`, `togglePause`,
`MODE_*` — no toggle and nothing that adds `.show` to `#mode-menu`). Clicking
`#mode` therefore threw `ReferenceError: toggleModeMenu is not defined` and the
dropdown could never open.

Fix, entirely inside my own file: `#mode`'s onclick is now
`kbToggleModeMenu(event)`, defined in a small inline `<script>` before the
`<script src>` tags. It toggles `.show` on `#mode-menu`, flips `aria-expanded`
on `#mode`, and closes on outside-click/Escape. `audio.js` and `game.js` remain
plain `<script src>` and are **not** inlined, as the task requires. Verified with
`vm.Script` (syntax clean) and re-confirmed by the Lead's integration smoke run.
T4 was asked not to add a competing toggle, which would cancel this one out.

Both are additive only: no contract id, class or ordering was renamed.

### 6.1b `static/lang.js` added by the Lead (not mine, left intact)

The Lead added `<script src="./static/lang.js"></script>` as the first of the
three script tags, to normalize `documentElement.lang` from
`localStorage`/`navigator.language` *before* `game.js` runs (the markup ships
`<html lang="en">` while the visible UI may be ja/zh). I did not write it and did
not modify it. Final script order, verified:

```
./static/lang.js -> ./static/audio.js -> ./static/game.js
```

The contract only pins that `audio.js` loads before `game.js`; the checker now
asserts exactly that invariant (audio before game, `game.js` last) rather than a
script count, so the Lead's addition does not invalidate the contract check.

### 6.1c `#lang` — investigated, does not exist (no deviation)

The Lead reported an unreadable `<select id="lang">` as a defect and asked me to
style it. **No such element exists anywhere in the project**, and I never added
one:

```
PS> Select-String -Path index.html -Pattern '<select|<option'      -> 0 matches
PS> (repo-wide) 'id="lang"|getElementById\("lang")|#lang'          -> 0 matches
```

I also inspected both screenshots directly: there is no empty box, no
dark-on-dark control and no missing-image placeholder in either render. The
confusion comes from `lang` being **I18N data, not a DOM element**:
`game.js:260` does `documentElement.setAttribute('lang', String(I18N['lang']))`,
`game.js:43` defaults `'lang': 'en'`, and all three locales carry a `lang` value.
That is the page-language attribute — which is exactly what `lang.js` (6.1b)
now normalizes — and is unrelated to any picker UI.

No user-facing language switcher was requested by CONTRACT.md §2 or by my task
spec, so none was invented; adding one would be an unauthorized new control
needing its own spec, T4 wiring and i18n surface. Flagged to the Lead.

### 6.2 RESOLVED — Records button key is `record` (singular)

**Ruled by the Lead; implemented.** The original spec tension was: my T3 task text
mandated `data-i18n="records"` on the Records buttons, while T2's task text froze
`"record": "Records"` (singular) and the shipped locales guarantee only that key.
T2 and I found this independently and escalated it rather than diverging.

Lead ruling: the singular is the correct call site, consistent with CONTRACT.md.
Both occurrences in `index.html` now read `data-i18n="record"`:

```
155: <button type="button" class="kb-btn kb-btn-lg" onclick="show_records()" data-i18n="record">RECORDS-I18N</button>
196: <a class="kb-btn kb-btn-lg" onclick="show_records()" data-i18n="record">RECORDS-I18N</a>
```

`#records-clear` keeps `data-i18n="records-clear"`, which was always correct.
T2 additionally added a `records` alias as belt-and-braces, so either name now
resolves. All 27 `data-i18n` keys and all 3 `data-placeholder-i18n` keys used by
the markup resolve in all three locales.

### 6.3 `#landscape` message text is my own copy

The reference leaves `#landscape` empty and only reveals it via CSS in
landscape. I gave it the literal text "Please rotate your device to portrait."
and reveal it with `@media (orientation: landscape) and (max-height: 450px)`
instead of the original's runtime `document.write` media-query injection. The id
and its contract behaviour (hidden by default, `display: none`) are unchanged.

### 6.4 Bootstrap replacements use a `.kb-btn` / `.kb-input` family

The task asks that Bootstrap classes be replaced with equivalent custom CSS.
Rather than reuse the literal Bootstrap names, I used `.kb-btn`, `.kb-btn-lg`,
`.kb-btn-sm`, `.kb-btn-primary`, `.kb-input`, `.btn-stack`, `.setting-row`,
`.setting-label`, `.score-panel`, `.btn-row`, `.panel`, `.records-list`. The
original visual language is preserved: big stacked buttons on the title screen,
a results panel of label/value rows, and a settings form of label+input rows.
File inputs use `class="visually-hidden"` (clip-rect, still clickable
programmatically) rather than Bootstrap's `d-none`/`display:none`.

### 6.5 Test scripts live in `tests/artifacts/`

`tests/harness.cjs` is owned by T5 and was not modified. My two verification
scripts go in `tests/artifacts/` (inside my declared write scope) and only
`require` the harness read-only.

### 6.6 The baked locale block is generated — never hand-edit it

The Lead added `<script id="i18n-utf8" type="application/json">` just before
`</body>`, containing all three locales as JSON *strings*. It exists because
under `file://` Chrome refuses `fetch()`, `XMLHttpRequest()` **and**
`<script src>` for sibling files, so the locale JSONs cannot be loaded when the
page is opened from disk. `game.js` reads the baked copy via `readBakedLocale()`.

`static/i18n/*.json` remains the source of truth. After any edit to
`index.html`, the generated block must still match those JSONs:

```
PS> node tools/bake-i18n.mjs --check
UP TO DATE  index.html (en, ja, zh)
bake --check exit=0
```

Exit code **0** confirmed after my `record` rename — my edits did not disturb the
generated block. If the JSONs change, regenerate with
`node tools/bake-i18n.mjs`. Do not hand-edit the payload.

---

## 7. Screenshots and positional proof

`tests/artifacts/t3-visual.cjs` loads `index.html` through `tests/harness.cjs`
at 480×800 and 1280×800, screenshots to `tests/artifacts/ui-480x800.png` and
`ui-1280x800.png`, and prints the tile geometry for `j = 0, 3, 4, 7, 39`. It
applies the tile geometry itself with the same formula as `game.js`
(`left = (j%4)*blockSize`, `bottom = floor(j/4)*blockSize`) so the positional
proof does not depend on T4 being finished.

**Status: RUN AND VERIFIED.** Launching Chrome from a normal `pwsh` call fails
with `browserType.launch: spawn EPERM`, exactly the condition documented in
`tests/harness.cjs`'s header — an environment limitation, not a defect in this
code or in the harness. The Lead ran it with wider permissions:

```
node tests/artifacts/t3-visual.cjs      # EXIT 0, ZERO console/network errors, errors: []
```

### Positional proof (tile geometry), 480×800

`#gameBody` 480px, `blockSize` = 120, `#GameLayerBG` 480px `position:absolute`,
80 tiles, `dupIds: []`.

| j | id | left | bottom | expected `(j%4)*bs`, `floor(j/4)*bs` |
|---|---|---|---|---|
| 0 | `GameLayer1-0` | 0px | 0px | 0, 0 ✓ |
| 3 | `GameLayer1-3` | 360px | 0px | 360, 0 ✓ |
| 4 | `GameLayer1-4` | 0px | 120px | 0, 120 ✓ |
| 7 | `GameLayer1-7` | 360px | 120px | 360, 120 ✓ |
| 39 | `GameLayer1-39` | 360px | 1080px | 360, 1080 ✓ |

Indices 0..3 form the bottom row (`bottom: 0`) with lanes left→right, and 39 is
the top row — exactly the mapping CONTRACT §2 freezes. `#GameLayer1-4` measures
120×120 at `y = 560` (= 800 − 3·120 + 120), i.e. the second row up.

### Desktop vs mobile, 1280×800

`#gameBody` width becomes exactly **640px** at `x = 320` (centred),
`#GameLayerBG` 640px at `x = 320`, `blockSize` = 160, body font-size 20px
(vs 16.32px at 480 wide — `clamp()` working). Geometry again exact:
j=0/3/4/7/39 → left 0/480/0/480/480, bottom 0/0/160/160/1440. So the
`max-width: 640px` column holds on desktop while narrow screens stay full-bleed.

### Overlays and a11y (both viewports)

`welcome=block/fixed`, `score=none`, `setting=none`, `records=none`,
`menu=none`; `html lang=en`; `boardAria="Game board, 4 lanes"` (filled by
`game.js` from `a11y-board`); `#GameTimeLayer` `role=status`,
`aria-live=polite`. The `.t1` tile background resolves to the real asset
`url(".../static/image/ClickBefore.png")`, so the `./image/` relative paths are
correct. `requests needing static/game.js: 0` — the real code path was exercised.

### Screenshots

- `tests/artifacts/ui-480x800.png`
- `tests/artifacts/ui-1280x800.png`

Both render the title screen: dark maroon near-black backdrop, the anime
illustration faintly bleeding through as `.welcome-bg` at low opacity, board tile
art visible behind as soft crimson vertical bands, "Kano Beat" in coral/salmon,
two white intro lines, and a clean stack of four buttons — Start (coral primary),
Normal, Records, Settings (dark maroon). No clipping, nothing off-screen, no
missing-image boxes, no overlapping text. The 1280 shot shows the same content
correctly centred in the 640px column with board art either side.

**Inspection attribution.** The description above is *my own* reading of both
PNGs, which I opened and examined directly (T3, `ui-dev`). The Lead separately
opened the same two files and independently reported the same appearance: dark
maroon backdrop, the anime illustration as a faint `.welcome-bg`, crimson tile
bands behind, translucent `TIME:20` HUD, coral "Kano Beat" title, white intro
lines, and the clean Start (coral) / Normal / Records / Settings stack with no
clipping, nothing off-screen and no missing-image boxes. Two independent
observations agreeing is stronger evidence than either alone — but they are two
observations, and neither is presented as the other's.

### Two cosmetic follow-ups applied after that run

1. `.mode-desc` now groups with the mode picker it describes: `.mode-picker`
   `margin-bottom` `.55em → .1em`, `.mode-desc` margin `-.15em 0 .6em 0 →
   -.05em 0 .85em 0` plus `padding: 0 .4em`. Previously the caption sat
   mid-way between "Normal" and "Records" and read like a label for Records.
2. `#GameTimeLayer` HUD contrast: text-shadow changed from a white halo to a
   dark one (`rgba(20,8,11,.95)` + `.85` + black). Under the welcome overlay the
   white halo washed `TIME:20` into a muddy dark-red ghost; the dark halo makes
   it read as a deliberate HUD element there and stays legible over bright tile
   art in play. Cosmetic only — both are pure CSS, no markup or contract change.

### 7b. Bleed-through / HUD defects found by the verifier — FIXED

The verifier measured two real defects in my CSS that the earlier screenshot
review had judged "intended design". Their measurements were right and the
original judgement (mine and the Lead's) was unmeasured. Fixed in
`static/index.css` only; `index.html` and `game.js` untouched.

**Defect 1 — `#welcome` was 86% opaque, so board art bled through.**
The composited board region had a luminance spread of **28.2** (1280×800) and
**15.2** (480×800) where an opaque overlay must render flat, showing as four
vertical bands of bright tile art plus a dim `TIME:20` ghost behind the title.

There were **two** sources, which is why fixing one was not enough:

- the base `#welcome` rule — `rgba(20, 8, 11, .86)`
- `@media (min-width: 641px)` — separately set `rgba(20, 8, 11, .92)`, i.e. the
  bleed-through was *worst on desktop*, the very viewport measured at 28.2

Both are now `rgba(20, 8, 11, 1)` — fully opaque. The value is written longhand
rather than as a hex literal so the alpha being fixed is explicit; note the
comment text deliberately avoids containing a literal `rgba(20,8,11,…)` string,
because `probe-visual.cjs` regex-scans the whole `#welcome` block and would
otherwise parse the comment instead of the declaration (see 7c).

**Defect 2 — `.welcome-bg` was an inert rule.**
It declared `background-size: 100% 100%` with no `background-image`, so it did
nothing at all. Rather than delete it, it now carries the user's illustration
deliberately: `background-image: url(./image/ClickBefore.png)`,
`background-size: cover`, `background-repeat: no-repeat`,
`background-position: center`, `opacity: .28`, `pointer-events: none`,
`z-index: 1`. It sits below `.welcome-inner` (z-index 5), and `#welcome` behind
it is fully opaque, so the decorative art can no longer modulate the board and
cannot compete with the title or buttons for contrast.

**Defect 3 — the HUD was visible behind the title screen.**
`#GameTimeLayer` showed `TIME:20` while `#welcome` was up. Fixed **purely in
CSS with no `game.js` change**, because a suitable hook already existed:
`game.js` drives `#welcome`'s inline `display` (`closeWelcomeLayer` → `'none'`,
`showWelcomeLayer` → `'block'`, both via `setDisplay`, which assigns
`el.style.display`). So:

```css
body:has(#welcome[style*="block"]) #GameTimeLayer {
    display: none;
}
```

`display: none` was chosen over `visibility: hidden` so the element is genuinely
not displayed and cheap display-state probes agree. `:has()` is supported in the
Chrome/Edge targeted here; where it is unsupported the rule is simply ignored
and the HUD remains visible, so it degrades safely rather than breaking.
`game.js` was **not** modified — no hook needed to be requested from T4.

### 7c. Two bugs in `tests/probe-visual.cjs` itself (reported, not worked around)

Both were found while making the fixes above and were reported to the Lead with
reproduction. They live in `tests/`, outside my write scope.

**Bug A — the D1 alpha check is unsatisfiable.** `probe-visual.cjs:47-48`:

```js
const alpha = /rgba\(\s*20\s*,\s*8\s*,\s*11\s*,\s*\.?(\d*\.?\d+)\s*\)/.exec(welcomeBg);
const a = alpha ? parseFloat(alpha[1].startsWith('.') ? alpha[1] : '0.' + alpha[1]) : null;
r.check(a !== null && a >= 1, 'D1: #welcome overlay is FULLY OPAQUE …');
```

It prepends `"0."` to any capture not starting with `.`. Measured against the
real CSS:

```
raw match        : "rgba(20, 8, 11, 1)"
captured group1  : "1"
prepended string : "0.1"
parseFloat(...)  : 0.1      -> a >= 1 is FALSE
```

Written instead as `1.0` it becomes `parseFloat("0.1.0")` = `0.1` — still false.
No string can satisfy this: alpha is necessarily within [0,1], the prepend forces
anything not starting with `.` below 1, and anything starting with `.` is < 1 by
construction. The parser assumes alpha is always < 1, which is exactly the
condition the fix removes. It needs `parseFloat(alpha[1]) >= 1`, or an explicit
branch handling `1` / `1.0`.

**Bug B — the computed-colour check asserts the opposite of the fix.**
`probe-visual.cjs:145-147`:

```js
r.check(under.welcomeBgColor !== 'rgb(20, 8, 11)',
  `${tag}: #welcome is NOT fully opaque (this is the bleed-through cause)`, …);
```

This passes only when `#welcome` is **not** opaque. With `rgba(20,8,11,1)` the
computed colour is exactly `rgb(20, 8, 11)`, so the check flips to FAIL *because
the defect is fixed*. The label and the intent both read as wanting the opposite
of what is asserted; it should be `===` (or a computed-alpha test).

Consequence for anyone re-running the suite: expect D3 and D2 to pass and the
pixel-spread check to pass, while these two lines stay red until corrected.
A red run after these fixes does **not** mean the CSS is still defective.

**Both bugs were confirmed and fixed by the Lead** (`parseFloat(alpha[1])`, and
`===` for the computed colour). The D1 check was also strengthened to scan
*every* `#welcome` rule, not just the first — which matters, because the
desktop `@media` override was a second alpha source. Post-fix it reads
`PASS D1: #welcome overlay is FULLY OPAQUE :: alpha = 1`.

### 7d. Probe bug C — the HUD assertion tests a state that was never set up

`probe-visual.cjs:93` sets up the "title screen" like this:

```js
await page.evaluate(() => { window.KanoGame.reset(); window.show_btn(); });
```

The comment says "Fresh title screen", but **neither call re-shows `#welcome`**:

- `reset()` (game.js:1644) → `clearRoundTimers(); hideGameScoreLayer();
  setDisplay(RecordsLayer,'none'); gameRestart();` — nothing restores `#welcome`.
- `show_btn()` (game.js:1479) only touches `#btn_group`, `#desc`, `#setting`.
- `start()` (game.js:1657-1658) is what hides it:
  `setDisplay(byId('welcome'), 'none')`.

So at measurement time `#welcome` is `display: none`, i.e. the title screen is
**not** up — while the assertion claims "the HUD is not displayed while the title
screen is up". The probe's own raw output shows the contradiction directly:

```
"welcomeDisplay": "none",     <-- title screen NOT up
"hudText": "TIME:20",
"hudVisible": true
```

My rule is `body:has(#welcome[style*="block"]) #GameTimeLayer { display: none }`.
With `#welcome` at `display:none` the selector correctly does **not** match, and
the HUD is correctly shown. The hook is behaving exactly as designed; the
assertion's premise is false. **No game.js hook is needed**, and the fix is one
line of test setup (set `#welcome`'s inline display to `block` before measuring,
or reload the page for a genuine title screen).

`tests/artifacts/t3-hud-hook.cjs` (my scope) was written to test both real states
so the hook is judged on its own merits rather than on this inconsistent setup:

- **A.** `#welcome` `display:block` (title genuinely up) → HUD must be `none`
- **B.** `#welcome` `display:none` (closed) → HUD must be restored
- **C.** exactly what `probe-visual.cjs` does → prints the state, exposing the
  false premise

It also prints `CSS.supports('selector(body:has(#welcome))')` to confirm `:has()`
support empirically. Running it needs a browser launch, which the DSH sandbox
blocks for T3 (`spawn EPERM`), so it was handed to the Lead to run.

### 7e. Mid-band spread 15.2 → 9.3 is the new feature, not residual bleed-through

With `#welcome` opaque the measured central spread fell from 15.2 to 9.3 at
480×800 and reads 30.0 at 1280×800. That residual is **`.welcome-bg` painting
`ClickBefore.png` at `opacity: .28`** — the deliberate decorative layer described
in 7b, i.e. the intended design. The probe's flatness assertion samples the
band where that layer now lives, so it measures the feature. Confirmed safe to
reinterpret: the outer bands read exactly 16 (the fully opaque backdrop) while
the brighter values are the `#welcome` content column and buttons, not tile art.
The tile art is still painted underneath (19 art tiles) — it is simply covered.

### 7f. FINAL VERIFIED RESULT — `probe-visual.cjs`: 15 passed, 0 failed

After T5 fixed the probe's setup (using the exported `backBtn()` and adding a
precondition assertion) and the Lead fixed the two static-section bugs, the
composited re-run is fully green at both viewports:

```
PASS  D1: #welcome overlay is FULLY OPAQUE so board art cannot bleed through  :: alpha = 1
PASS  D3: .welcome-bg either sets a background-image or declares no background-size  :: has an image
PASS  D2: the HUD is behind the welcome overlay in z-order (11)  :: z-index 5 < 11
PASS  480x800: PRECONDITION — the title screen really is up before measuring the HUD  :: #welcome computed display = block
PASS  480x800: the overlay band stays within its luminance budget (no harsh banding)  :: central spread 14.0 < budget 60 with 19 art tiles painted underneath
PASS  480x800: the overlay itself is fully opaque, so nothing shows through it  :: background=rgb(20, 8, 11) opacity=1
PASS  480x800: #welcome really is above the board in z-order  :: welcome z-index=11, hud z-index=5
PASS  480x800: #welcome computed background IS fully opaque  :: computed background = rgb(20, 8, 11)
PASS  480x800: the HUD is not displayed while the title screen is up  :: HUD innerHTML="TIME:20" visible=false
PASS  1280x800: PRECONDITION — the title screen really is up before measuring the HUD  :: #welcome computed display = block
PASS  1280x800: the overlay band stays within its luminance budget (no harsh banding)  :: central spread 7.0 < budget 60 with 19 art tiles painted underneath
PASS  1280x800: the overlay itself is fully opaque, so nothing shows through it  :: background=rgb(20, 8, 11) opacity=1
PASS  1280x800: #welcome really is above the board in z-order  :: welcome z-index=11, hud z-index=5
PASS  1280x800: #welcome computed background IS fully opaque  :: computed background = rgb(20, 8, 11)
PASS  1280x800: the HUD is not displayed while the title screen is up  :: HUD innerHTML="TIME:20" visible=false
===== pvisual RESULT: 15 passed, 0 failed =====
```

**Outcome of the §7d question:** the `:has()` hook was correct all along. With the
precondition genuinely established (`#welcome` computed display `block`), the HUD
reads `visible=false` at both viewports. **No CSS change and no `game.js` hook
were required**, so T4's file was never touched.

Raw evidence retained at `tests/artifacts/pvisual-output.txt`, and refreshed
screenshots at `tests/artifacts/ui-480x800.png` / `ui-1280x800.png`.

Independent corroboration on my side of the fence: T5's `d2-check.cjs` reports
**9 passed / 0 failed**, statically verifying the opaque-overlay fix including
*every* `@media` override — the regression path I flagged, since the old desktop
rule re-set alpha .92 and re-introduced the bleed-through at the viewport where
the measured spread was worst.

### `file://` note (Lead's fix, not mine)

Opening `index.html` from disk makes the page origin-less, and Chrome then
refuses `fetch()`, `XMLHttpRequest()` **and** `<script src>` for sibling files
alike. That is why the Lead baked `<script id="i18n-utf8" type="application/json">`
into the page (6.6) and added `static/lang.js` (6.1b). Under `file://` the page
now runs with zero console errors.

### `.t1`..`.t5` / `.tt1`..`.tt5` — settled, CSS is correct as written

The Lead briefly flagged that he might rewrite these to make `.t1` a photo
background and `.tt1` a hit ring. **Final decision: no change.** T1 is delivering
`ClickAfter.png` as a genuine second asset (a translucent hit-state tile), so the
original class-based two-image design stays intact, and the Lead confirmed the
CSS should keep `.t1`..`.t5` → `url(./image/ClickBefore.png)` at `auto 100%` and
`.tt1`..`.tt5` → `url(./image/ClickAfter.png)` at `auto 86%`, exactly as written
and exactly as CONTRACT §4 requires. Nothing in `static/index.css` on this point
needs revisiting.

---

## 8. Summary of what T3 delivered

- `index.html` — 80 static tiles with the frozen ids/order/classes, all 38
  contract ids, custom (non-Bootstrap) markup, a11y attributes, `<noscript>`, the
  baked-locale block preserved, scripts as plain `<script src>`.
- `static/index.css` — warm crimson/salmon theme, the seven `--kb-*` custom
  properties, every preserved structural class, all new classes, relative
  `./image/` tile art, `clamp()`/`dvh` responsiveness, reduced-motion support,
  no `@import`, no remote `url()`, no `!important`.
- Verification and evidence in `tests/artifacts/` (my scope): `t3-checks.cjs`
  (static contract, exit 0), `t3-visual.cjs` (layout + screenshots),
  `t3-checks-output.txt`, `t3-visual-output.txt`, `ui-480x800.png`,
  `ui-1280x800.png`.
- Not touched: `static/game.js`, `static/audio.js`, `static/lang.js`,
  `static/i18n/*`, `static/image/*`, `static/music/*`, `tools/*`,
  `tests/harness.cjs`, `README.md`, `CONTRACT.md`.

### Things I could not verify myself

Browser-based checks (screenshots, live geometry, console-error count) were run
by the Lead, not by me: Chrome launch is blocked for my session by the DSH
sandbox (`spawn EPERM`). Every number in §7 comes from that run's raw output,
which is stored verbatim in `tests/artifacts/t3-visual-output.txt` so it can be
re-checked. The static checks in §1–§5 I ran myself and they exit 0.

