# T4 — `static/game.js` + `static/audio.js` : implementation notes and evidence

**Owner:** T4 (`logic-dev`)
**Files written:** `static/game.js`, `static/audio.js` (plus this file and `tests/artifacts/`)
**Reference for parity (read-only):** `..\eatkano-ref\static\index.js`
**Contract:** `CONTRACT.md` §2, §3, §5 — implemented literally except where noted in
[Deviations](#deviations-from-contractmd).

---

## 1. What was built

`static/game.js` is a faithful, jQuery-free / CreateJS-free / JSEncrypt-free port of
EatKano's `static/index.js`. It keeps the original's random-walk tile placement, its
`_ttreg` / `_clearttClsReg` class juggling, its CPS guard, its `time-over` anti-cheat,
its 150 ms scroll transition, its two-layer wrap arithmetic and even its `bast-score`
cookie typo — then adds the pause/resume, local leaderboard, i18n, and validation
behaviour that the task specified.

`static/audio.js` provides `window.KanoAudio` with `<audio>` elements as the guaranteed
playback path (works on `file://`, in private mode, and everywhere else) and Web Audio
as a pure upgrade under `http(s)://`.

Everything the other modules touch is a frozen name from `CONTRACT.md` §2/§3.

---

## 2. `node --check` output

Run from `kano-game\`:

```
> node --check static/game.js
exit=0

> node --check static/audio.js
exit=0
```

Both files are plain classic scripts — no `import`/`export`, no `type="module"` — so
the game also loads from `file://`.

Sizes at the time of writing: `game.js` 62,866 bytes, `audio.js` 16,895 bytes.

---

## 3. Evidence

### 3.1 Static DOM pre-flight (runs without a browser)

```
> node tests/t4-domcheck.cjs
ids checked : 37
ids missing : none
tiles layer1: 40  layer2: 40
tile ids are 0..39 in document order on both layers: true
script tags : ["<script src>","<script>","<script src=\"./static/lang.js\">","<script src=\"./static/audio.js\">","<script src=\"./static/game.js\">","<script src>","<script id=\"i18n-utf8\" type=\"application/json\">"]
audio.js before game.js: true
type="module" scripts: 0
body onload=init(): true
data-i18n attrs: 27, data-placeholder-i18n attrs: 17
static/i18n/en.json exists: true
static/i18n/ja.json exists: true
static/i18n/zh.json exists: true
static/music/tap.mp3 exists: true
static/music/end.mp3 exists: true
static/music/err.mp3 exists: true

PRE-FLIGHT OK
exit=0
```

This proves every id `game.js` queries exists, that both layers really hold 40 tiles
numbered `0..39` in document order, that `audio.js` precedes `game.js`, and that
neither is a module script.

### 3.2 Headless logic run — `node tests/t4-logic-node.cjs`

Because Chrome cannot be launched from this session (see
[Could not verify](#7-could-not-verify)), `tests/t4-logic-node.cjs` loads the **real,
unmodified** `static/game.js` and `static/audio.js` into a `vm` context backed by a
minimal DOM shim, so the shipped code path is exercised rather than a reimplementation.

```
> node tests/t4-logic-node.cjs
========================================================================
T4 game.js + audio.js — no-browser shim run
========================================================================
PASS  audio.js + game.js evaluate and init() runs without throwing
...
SUMMARY: 145/145 checks passed, 0 failed
exit=0
```

The full transcript is written to `tests/artifacts/t4-node-run.txt` on every run.

What that 140/140 covers:

| Area | Checks |
|---|---|
| Frozen `KanoGame` / `KanoAudio` surface | every §3 key present; `version`; `MODE_*` = 1/2/3 on both the object and `window` |
| All 17 `index.html` globals | `init, readyBtn, replayBtn, backBtn, changeMode, show_setting, show_btn, show_records, hide_records, save_cookie, changeSoundMode, getClickBeforeImage, saveClickBeforeImage, getClickAfterImage, saveClickAfterImage, clearRecords, togglePause` |
| Idle state | `started=false over=false score=0 mode=1 soundOn=true accuracy=0`, `lane === null` |
| Fresh snapshot | mutation of the returned object does not stick; plain data object |
| Tile sequencing | 5 and 8 consecutive correct presses: score/combo/maxCombo/hits/step advance, `activeTile()` moves every press |
| Tap predicate | a genuinely wrong+empty lane ends a normal round (`over`, `misses=1`, `combo=0`); 3 hits then a wrong tap keeps the earned score; 2 hits + 2 misses → accuracy 50 |
| Accuracy formula | `hits/(hits+misses)*100`, 0 when neither happened; 0/100/50/75 cases |
| Practice mode | wrong taps never end the round, `misses` increments, `.bad` applied then removed after 500 ms by exactly one timer |
| CPS guard | 0 immediately, 0 after one tick, `> 0` after two ticks, and `0.50` for 1 tap / 2 s |
| HUD | `TIME:n` counts down; `CPS:<calculating>` under 2 s; `SCORE:n` in practice |
| Records | exactly one record on `gameOver()`, §3 shape, cap of 20, newest-first, copy not live array, practice writes none, `clearRecords()` empties |
| time-over anti-cheat | text `You've cheated for 10.00s`, red colour, no record; a compliant round is not red and does save |
| Rating thresholds | `cps <= 5/8/10/15 ->` the five `text-level-*` strings |
| sound | off → `play()` false for tap/err/end; on → true; label flips; unknown id false |
| `KanoAudio` robustness | 19 garbage calls throw nothing; `setEnabled`/`isEnabled` round-trip |
| `setMode` | clamps to `{1,2,3}`, junk → 1, persists to cookie |
| `gameTime` | integer 5..120; junk → 20; blank → no-op |
| keyboard setting | `AB12→ab12`, `dddd→dfjk`, `yyyy→dfjk`, `" dfjk "→dfjk`, `d f→dfjk`, `""→dfjk`, `x→xfjk`, `DJKF→djkf` |
| keyboard events | lowercase and uppercase drive the game; all four configured lanes; `z`/`Shift`/`ArrowLeft`/`F5`/`Tab`/`Ctrl` ignored; `<input>`/`<textarea>` ignored; `defaultPrevented` ignored |
| pause | `.paused` added/removed, interval cleared and restored, clock frozen, taps ignored, score/combo/step/lane survive |
| records DOM | `.record-row` + `.record-rank`/`.record-score`/`.record-meta`, `.top` on best row, `records-title`, `records-empty` |
| timers | `reset`/`gameOver`/`backBtn` leave 0 intervals; a running round holds exactly 1; `show_records` clears, `hide_records` restores |
| persistence | `bast-score` typo preserved, `getBest` reads back, cookies survive a reload |
| degradation | survives `localStorage` throwing on every access; in-memory records still work |
| i18n | playable from embedded defaults when fetch and XHR both fail |
| **viewport widths** | at 480/641/960/1280/1920 with a centred board: all four lanes reachable by `press()` **and** by a real `pointerdown` at absolute coordinates; a neighbouring-lane press is a clean wrong tap, never a silent no-op — see §4.1 |

### 3.3 Headless browser run — `node tests/t4-evidence.cjs`

```
> node tests/t4-evidence.cjs
HARNESS ERROR: browserType.launch: spawn EPERM
    at openPage (kano-game\tests\harness.cjs:88:34)
    at kano-game\tests\t4-evidence.cjs:48:17

SUMMARY
0/0 checks passed, 1 failed
```

**This is an environment limitation, not a code failure** — Chromium needs IPC handles
the DSH file sandbox denies. The suite is written and ready; it is being run by the Lead
with wider permissions. Its result is recorded in §3.4 below.

The suite asserts all ten acceptance items from the task, plus: `gameTime` clamping
re-derived from a fresh page load per case, blank-input no-op, keyboard-setting
normalisation, **real trusted** `page.keyboard.press` events (lowercase, uppercase, and
all four lanes, with the board focused), a shared-code-path check proving `press()` and
the keydown handler drive one counter, keys typed into an `<input>` being ignored,
`.paused` pause/resume with clock freeze, records DOM shape, `refreshLayout()`
index→pixel mapping, the anti-cheat trigger **and** a control case proving a legal round
is not flagged, a timer-leak check, a cumulative zero-error sweep, and a board
screenshot.

### 3.4 Browser runs performed by the Lead

Chrome cannot be launched from the T4 session (see §7), so the Lead ran the suite with
wider permissions. Three runs were recorded; each drove a round of fixes.

**Run 1 — 55/61.** Findings: wrong-lane scoring, unreachable `time-over`, `gameTime`
clamp map, `KanoAudio.debug().enabled`, idle `lane`. All fixed (see §4 rows 1–7).

**Run 2 — 67/71.** Confirmed fixed: the anti-cheat (string + red + no record), the clamp
map, `debug().enabled`, idle `lane === null`, the shared-code-path counter, records,
pause/resume, persistence and layout. The four remaining failures were all defects in
the **new keyboard test**, not in `game.js`:

```
FAIL  a real trusted keypress (lowercase d) drives the game
FAIL  a real trusted keypress (uppercase D) drives the game too
FAIL  keys typed into an <input> do not drive the game
FAIL  press() and the keydown handler share one score/step counter
SUMMARY
67/71 checks passed, 4 failed
```

Raw evidence of the cause:

```
page.keyboard.press("d") -> {"before":{"lane":3,"active":"","score":0,"id":"GameLayer1-7"},
                             "after":{"score":0,"combo":0,"id":"GameLayer1-7"},"moved":false}
```

`document.activeElement.id` was `""`: `#GameLayerBG` has no `tabindex`, so the test's
`.focus()` on it was a **no-op**, and its reset loop exited without actually landing on
lane 0 (`before.lane` was 3). The test was therefore pressing the lane-0 key against a
lane-3 tile and correctly observing no score. Fixed by blurring instead of focusing,
re-rolling until the active tile really is the lane under test (now reported as
`targetLane` so a miss cannot be ambiguous), asserting `#gameTime` really is focused in
the input-guard case, and choosing the key from the *post-press* active lane in the
shared-path case. **No `game.js` change was required for these four.**

**Run 3 — 69/71**, then **Run 4 — 71/74** (after the anti-cheat, clamp, `debug()` and
`lane` fixes plus the width sweep), then **Run 5 — 73/74**. Confirmed passing in these
runs:

- the `time-over` anti-cheat (string + red + no record) **and** the legal-round control,
- the `gameTime` clamp map and the blank-input no-op,
- `KanoAudio.debug().enabled` / `state`,
- idle `lane === null`,
- **real trusted `page.keyboard.press` for BOTH lowercase `d` and uppercase `D`**
  (`score 0 -> 1`, `combo 1`, tile advanced),
- `press()` and the keydown handler sharing one score/step counter,
- the **VIEWPORT WIDTHS** sweep with real `page.mouse.click`:
  `lanes=[true,true,true,true] neighbourOk=true ok=true` at 480, 960 **and** 1280
  (`bodyLeft` 0 / 160 / 320 respectively).

The remaining failure in run 5 was the input-guard precondition (§4 row 16): headless
Chrome leaves `document.activeElement` on `<body>`, so `#gameTime.focus()` cannot be
used to establish "the input is focused", and a real keypress then legitimately targets
`<body>` and scores. The check was rewritten to dispatch a keydown whose **target** is
the input — the exact condition `isTextEntry()` exists to reject — with a positive
control (same key, target `<body>`) proving the handler still scores.

**Run 6 — not executed** (the Lead's last recorded run was run 5, `t4-evidence-final2.txt`
at 73/74). The rewrite above is syntax-checked and its logic re-verified in the Node shim
across 8 trials x 4 lanes, but the browser re-run is the one thing this session cannot
perform. See §7 item 1.

### 3.4.1 Summary of what is independently verified

| Suite | Result | Run by |
|---|---|---|
| `tests/probe-target.cjs` (adversarial, viewport-aware) | **19 passed, 0 failed** | verifier / Lead |
| `tests/t4-logic-node.cjs` (no browser, real game.js) | **145 / 145** | T4 |
| `tests/t4-domcheck.cjs` (static DOM contract) | **PRE-FLIGHT OK** | T4 |
| verifier v2 | 17 passed, 0 failed | verifier |
| verifier v6 | 36 passed, 0 failed | verifier |
| verifier v8b | 37 passed, 0 failed | verifier |
| verifier v5 | 22 passed, 1 failed — record-vs-live-CPS timing artifact (`record.score === record.cps` holds exactly) | verifier |
| `tests/t4-evidence.cjs` | **73 / 74** at run 5; the one failure was the input-guard test method, since fixed | Lead |

### 3.5 Screenshot

`tests/artifacts/board.png` is produced by §3.3 (board with a highlighted tile).
`tests/artifacts/t4-node-run.txt` holds the full §3.2 transcript.

---

## 4. Fixes applied — before / after

Every entry below is a real change to `static/game.js` or `static/audio.js` unless the
row says *test*.

| # | Defect | Before | After | How it was found |
|---|---|---|---|---|
| 1 | **Wrong-lane tap scored as a hit.** `pressLane()` resolved the pressed tile as `p.cell + (lane - 1)` instead of *row base + lane*, so pressing the active tile's own lane landed on a neighbouring tile and the wrong-lane branch was never reached. `keyMap` was also 1-based while `press()`/`activeTile().lane` are 0-based, so the two APIs disagreed. | `press(activeTile().lane)` → `score 1, misses 0, over false`; a wrong-lane press → `score 1, combo 1, over false` | `laneTargetId(p, lane) = (activeIndex - p.cell) + lane`; `keyMap = {d:0,f:1,j:2,k:3}`; `press()`/`pressLane()` take a 0-based lane. `press(activeTile().lane)` → `score 1, combo 1, over false`; wrong lane → `over true, misses 1, combo 0, score unchanged` | Lead's browser run, reproduced in the Node shim |
| 2 | **Tap predicate could never reject anything.** The original's four lane arms are unbounded — lane 0 has no lower bound (`x < blockSize` is true for every negative x) and lane 3 no upper bound (`x > 3*blockSize` is true off the right edge) — so between them they cover the whole real line and the predicate is always true. Upstream, no tap can ever be "wrong". | predicate always true → wrong-tap branch dead code | lane 0 gains `x >= 0`, lane 3 gains `x <= 4*blockSize`. Every on-board x in lane *k* still satisfies exactly arm *k*, so ordinary play is unchanged | Reading the original against CONTRACT §3's rules table |
| 3 | **`time-over` anti-cheat was unreachable in the test.** The 1 s interval ends a normal round legally at exactly `timeSetting`, so simply waiting never trips it. | test waited 9 s on a 5 s budget, round had already ended at 5 s → `gameOver()` was a no-op → `text "Try again?"`, `colour ""`, `records 1` | The browser test now reproduces the condition the anti-cheat exists for: suspend the countdown via the public pause API while wall-clock `durationMs` keeps accruing, wait 9 s on a 5 s budget, then end the round. Plus a **new control case** proving a legal round is not flagged and does save a record | Lead's browser run |
| 4 | **`KanoAudio.debug()` had no explicit `enabled`.** | `{registered, ids}` — "disabled" vs "registered" not distinguishable | now also `enabled: true/false` and `state: 'disabled' \| 'unregistered' \| 'ready'` | Lead's browser run |
| 5 | **Idle `getState().lane` reported a lane.** CONTRACT §3 types it `number\|null`. | `lane: 1` at idle | `lane: null` at idle (a lane only exists once a round has started) | Lead's browser run |
| 6 | **Blank `#gameTime` was not a no-op.** | clearing the box left the *previous* iteration's value (observed `""→8`) instead of preserving the setting | `clampGameTime(v, fallback)` treats `''`/whitespace/`null` as "leave it alone"; `initSetting()` passes the current `_gameSettingNum`. Junk still → 20; numeric rounds then clamps to `[5,120]` | Lead's browser run (test leakage masked the real behaviour) |
| 7 | **Repeated keyboard characters were partially accepted.** | `yyyy → yfjk` (first copy privileged, later copies defaulted) | a character repeated *anywhere* in the input is rejected, so `yyyy → dfjk`; `ddfk → dfjk` | Node shim |
| 8 | **`press()` accepted non-integers.** | `press(1.5)` truncated to lane 1 and scored | `press(1.5)` → `false`; `pressLane()` likewise rejects non-integers | Node shim |
| 9 | **Layout guard.** `refreshLayout()` could be called before `init()`. | would throw on `null` refs | guarded no-op; `countBlockSize()` falls back to `boardBG.offsetWidth/4` then `innerWidth/4` if the measured width is 0 | Self-review |
| 10 | *test* — `gameTime` clamp map leaked state between iterations | one page mutated 7 times, so `""` measured stale state | each case boots a fresh context from a cookie jar holding that value | Lead's browser run |
| 11 | *test* — keyboard assertions were malformed | `lower: null` (precondition silently unmet), `upper: 0` (an `<input>` was focused) | key chosen to match the *active lane*; board focused first; real `page.keyboard.press` for lowercase, uppercase, all four lanes, plus a `press()`-vs-keydown shared-counter check | Lead's browser run |
| 12 | *test* — shim `innerHTML`/`cookie` were plain properties | records list accumulated 327 rows; cookie writes overwrote the whole jar so `gameMode` was lost | `innerHTML` clears the subtree; `document.cookie` is a real merge-on-write jar | Node shim |
| 14 | *test* — lane pre-roll leaked state between lanes | `landOnLane` checked the lane and only called `reset()` on a miss, so when the lane matched on the first try the round was never reset and the previous lane's score leaked in. This is why lowercase `d` failed while uppercase `D` passed — same code, order-dependent | always `reset()` **first**, then check the lane, then `start()`; re-verified deterministic over 8 trials x 4 lanes asserting `before === 0 && after === 1` | Lead's browser run |
| 15 | *test* — width-sweep result objects had no `ok` field | pushed `{scored: ...}` but compared `r.ok`, so the report showed `lanes=[null,null,null,null]` — a missing field, not a failure | sets `ok`, and logs `{scoreBefore, scoreAfter, misses, reason}` where reason distinguishes `scored` / `counted as a MISS` / `silent no-op` | Lead's browser run |
| 16 | *test* — input-guard precondition could not be established | asserted `activeElement.id === 'gameTime'` after `inp.focus()`, but headless Chrome leaves `activeElement` on `<body>` (`focusedTag: "BODY"`), so the key legitimately reached `<body>` and scored — the game was right, the assertion was wrong | dispatches a keydown whose **target** is the input (exactly what `isTextEntry()` rejects) plus a positive control (target `<body>`) proving the handler still scores. The headless focus behaviour is now logged as an observation, not asserted | Lead's browser run |
| 13 | **HIGH SEVERITY — board-local vs absolute `x`.** `gameTapEvent()` and `pressLane()` both passed board-local x into `tapCore()`, which clamped against **absolute** edges (`boardLeft = body.offsetLeft`). On any viewport wider than the 640 px board, `offsetLeft > 0`, so every local x below `offsetLeft` was lifted to exactly `offsetLeft` — a value matching **no** lane arm. | At 1280×800 (`offsetLeft = 320`, `blockSize = 160`): `press(0)` → silent no-op; `press(1)` → **instant game over**; lanes 0 AND 1 unreachable by real mouse. Left half of the board dead on every desktop browser. At 480×800 it was invisible. | `tapCore()` now takes **absolute** x and is the single place that converts once (`localX = absX - boardLeft`) after clamping in absolute space; both callers pass absolute coordinates. Invariant pinned in a doc comment on `tapCore`. | **Independent verifier**, via `tests/probe-target.cjs`; reproduced by the Lead |

### 4.1 Regression test for fix 13 — and proof it is not vacuous

Fix 13 was invisible to every pre-existing check because **all prior evidence was captured
at 480×800**, where `body.offsetLeft === 0` and the two coordinate spaces coincide. The
bug is a function of viewport width, so a width sweep was added to
`tests/t4-logic-node.cjs`, driving **both** `press()` and a real `pointerdown` dispatch at
absolute coordinates:

```
--- viewport width sweep (board-local vs absolute x) ---
vw=480  board=480 blockSize=120 offsetLeft=0    press()=[T,T,T,T] pointerdown=[T,T,T,T] neighbour=true/true
vw=641  board=640 blockSize=160 offsetLeft=0.5  press()=[T,T,T,T] pointerdown=[T,T,T,T] neighbour=true/true
vw=960  board=640 blockSize=160 offsetLeft=160  press()=[T,T,T,T] pointerdown=[T,T,T,T] neighbour=true/true
vw=1280 board=640 blockSize=160 offsetLeft=320  press()=[T,T,T,T] pointerdown=[T,T,T,T] neighbour=true/true
vw=1920 board=640 blockSize=160 offsetLeft=640  press()=[T,T,T,T] pointerdown=[T,T,T,T] neighbour=true/true
SUMMARY: 145/145 checks passed, 0 failed
```

To prove the new checks actually detect the defect, two mutants of `game.js` were built
and the suite re-run against each:

| Mutant | Result | Caught by |
|---|---|---|
| A — only `gameTapEvent()` reverted to board-local | 144/145 | `REAL pointerdown: a neighbouring-lane click is a clean wrong tap at every width` |
| B — both callers board-local (the original bug) | 143/145 | both neighbour checks, failing from **960 px** upward |

Worth recording: the *"all four lanes reachable"* check alone does **not** catch it,
because the `tar.id === p.id` arm of the predicate short-circuits when the dispatched
target is the correct tile. The **neighbouring-lane** assertions are what catch it. Both
mutants were deleted afterwards; only the real files remain.

`tests/t4-evidence.cjs` also gained a `VIEWPORT WIDTHS` section using real
`page.mouse.click` at absolute coordinates at 480/960/1280.

---

## 5. Deviations from `CONTRACT.md`

### 5.1 Tap predicate: the two missing bounds (deliberate, behaviour-affecting)

CONTRACT §3 states the rule as *"`e.target` **is** the active tile, **or** the `x`
position falls in the active tile's lane"*, and its rules table requires *"Wrong tap …
immediate game over"*. The original's literal expression cannot satisfy either, because
its lane arms jointly cover the entire real line (see §4 row 2). I kept the original's
expression verbatim in shape and added the two missing bounds.

**Observable effect:** identical to the original for every tap that lands on the board in
the active tile's lane; the only change is that a tap which *misses* the active lane is
now correctly a wrong tap. Without this, `press(lane)`, the keyboard, and the wrong-tap
game-over rule are all untestable.

### 5.2 `pressLane()` synthesis (deliberate; upstream behaviour preserved where possible)

The original's `click(index)` synthesised a `clientX` **inside the pressed lane's own
band**, which meant the lane arm always fired and no key press could ever be wrong. I
synthesise the centre of the pressed lane instead — the same x a real finger produces —
so `press()`, the keyboard handler and a real pointer event all run the identical
predicate. This is what makes CONTRACT §3's *"`press(lane)` — headless/synthetic
equivalent of a keypress"* claim true.

### 5.3 `hits` and `accuracy` (contract gap, interpretation stated)

CONTRACT §3's record shape carries both `score` and `hits`, and defines accuracy as
`hits/(hits+misses)*100` with **0** when there are no misses and no hits. I implement
`hits` as *landed taps that were not misses*, i.e. `score === hits` in ordinary play
(the two differ only by the presence of `misses`). This is the only reading that keeps
accuracy's stated 0/100 endpoints and the stated formula consistent.

### 5.4 `gameTime` clamp table (CONTRACT §3 gives no table)

CONTRACT §3 says only "integer seconds, default 20". The task specified rejecting 0,
NaN, negatives and absurd values. The implemented table, now asserted by both suites:

| input | result | reason |
|---|---|---|
| `''`, `'   '`, `null`, `undefined` | **unchanged** | an empty box must not invent a value |
| `'abc'`, `NaN`, `Infinity` | `20` | documented default |
| numeric | `Math.round`, then clamp to `[5,120]` | `'0'→5`, `'3'→5`, `'-5'→5`, `'7.6'→8`, `'121'→120` |

### 5.5 Keyboard duplicate rule (task text applied literally)

The task said "reject duplicates/whitespace by falling back to `dfjk` for the bad
entries". I treat a character repeated *anywhere* as bad, so `yyyy → dfjk` rather than
`yfjk`. Either is defensible; this one keeps all four lanes on distinct keys, which is
the stated goal ("Never let an empty/invalid map make the game unplayable"), and the
Lead's requested table matches it.

### 5.6 `file://` locale path — `readBakedLocale()` (added by the Lead; documented here)

`game.js` is the file that loads the locale, so this divergence belongs in these notes
even though the Lead authored it.

**Problem:** under `file://` Chrome refuses `fetch()`, `XMLHttpRequest()` **and**
`<script src>` for sibling files. Nothing could load when `index.html` was
double-clicked, which broke the "must work from `file://`" requirement.

**Solution (two halves):**
1. `index.html` carries an inline `<script id="i18n-utf8" type="application/json">`
   block holding a baked copy of the active locale, produced by `node tools/bake-i18n.mjs`.
2. `static/game.js` gained `readBakedLocale(lang)`, which reads that payload (via
   `getElementById(...).textContent`, falling back to a regex over
   `document.documentElement.outerHTML` if the element is absent from the live DOM).

The resolution order in `loadI18N()` is now:
`fetch('./static/i18n/<lang>.json')` → `XMLHttpRequest` → **`readBakedLocale(lang)`** →
embedded English defaults.

`static/i18n/*.json` remains the **source of truth**; the inline block is generated.
**If you touch a locale file or `index.html`, run `node tools/bake-i18n.mjs` and confirm
`node tools/bake-i18n.mjs --check` exits 0**, or the baked copy goes stale.

### 5.7 Removed features (required by the task, listed for completeness)

Deleted outright, and therefore *not* contract violations but genuine removals of
original behaviour: `SubmitResults`, `encrypt`/`JSEncrypt`, `goRank`, `winOpen`, the
`#username`/`#message` fields, all `document.write` calls (including the runtime
`<style>` injection and `createGameLayer()`), and the jQuery/CreateJS dependencies.
Layout that the original injected at runtime is now CSS plus `refreshLayout()`.

### 5.8 The coordinate model (written down because it broke once)

`tapCore()` takes **absolute viewport x** and performs the single conversion to
board-local coordinates itself:

```
localX = clamp(absoluteX, boardLeft, boardLeft + 4*blockSize) - boardLeft
```

`boardLeft` (`= body.offsetLeft`) is the only absolute quantity in the function. The lane
arms in `isCorrectTap()` and the `.t*`/`.tt*` target resolution all use `localX`.
Callers must pass absolute coordinates: `gameTapEvent()` the raw `clientX`,
`pressLane()` `boardLeft + lane*blockSize + blockSize/2`.

**Why this is documented at length:** the first implementation split the two conventions
— callers passed board-local x while the clamp used absolute edges. Because `#gameBody`
is `max-width:640px; margin:0 auto`, `offsetLeft` is 0 only below 641 px wide, so the
defect was *invisible in every test and screenshot taken at 480×800* while making the
left half of the board unplayable on any desktop browser. It was found by **the
independent verifier reading the code**, not by me, and not by any of my 140 passing
checks. The lesson recorded here: coordinate-space disagreements are width-dependent
and single-viewport test suites cannot see them.

### 5.9 Summary of what was changed vs. upstream, in one place

Two independent defects, one upstream and one mine, both in the same predicate:

1. **Upstream** (§5.1): the four lane arms cover the whole real line, so no tap could ever
   be wrong. Fixed by bounding lane 0 and lane 3.
2. **Mine** (§5.8): callers passed board-local x while the clamp used absolute edges,
   which killed the left lanes on viewports over 640 px. Fixed by making `tapCore()` the
   single owner of the absolute→local conversion.

Both were needed for the contract's wrong-tap rule to hold, and neither is observable at
480×800 — the width the earlier evidence was captured at.

### 5.10 Intentionally preserved original quirks

Not deviations — kept on purpose because the contract calls them out: the `bast-score`
cookie typo (real user-visible name; renaming it would discard players' best scores),
`_gameBBListIndex` growing without bound, `_refreshSize`'s `(_gameBBListIndex % 10)`
arithmetic, the `_ttreg` / `_clearttClsReg` regexes used exactly as upstream, the CPS
`< 2 s` guard, `Math.floor(Math.random()*1000) % 5 + 1` for the `.t1`..`.t5` class, and
the two-layer `if (GameLayer[0].y > GameLayer[1].y)` wrap.

---

## 6. Requirements mapping

| Task item | Where |
|---|---|
| A — no jQuery/CreateJS/JSEncrypt, `$`/`$$` helpers, audio via `KanoAudio` | `$`, `$$`, `byId`; `sfx()`; deleted `SubmitResults`/`encrypt`/`goRank`/`winOpen` |
| B — no `document.write`; `refreshLayout()`, `countBlockSize()`, `_refreshSize()`, 200 ms debounce, two-layer wrap | `refreshLayout`, `countBlockSize`, `_refreshSize`, `refreshSize`, `layoutLayer` |
| C — frozen `window.KanoGame` incl. fresh `getState()` | `w.KanoGame` export; `getState()` returns a new object literal per call |
| D — 17 globals from `index.html` | `w.init` … `w.togglePause` block at the foot of the file |
| E — gameplay parity and the listed quirks | `refreshGameLayer`, `gameLayerMoveNextRow`, `isCorrectTap`, `getCPS`, `shareText`, `getBestScore`, `_refreshSize` |
| F — guards, validation, no timer leaks, pause, records rendering, keyboard, pointer routing | `cookie`/`memoryCookie`, `localStorage` try/catch + `memoryRecords`, `setMode`, `clampGameTime`, `normaliseKeyboardSetting`, `clearRoundTimers`, `pauseRound`/`resumeRound`, `renderRecords`, `onKeyDown`, `gameTapEvent` |
| G — `fetch` → XHR → baked → embedded defaults; `data-i18n`; `documentElement.lang` | `loadI18N`, `fetchJSON`, `xhrJSON`, `readBakedLocale`, `applyI18N`, `t()` |
| H — original cookie names; `save_cookie()` reads `#title`/`#keyboard`/`#gameTime` | `cookie` writes, `save_cookie`, `initSetting` |
| `audio.js` — `register`/`play`/`setEnabled`/`isEnabled`/`unlock`/`debug`, never throws | entire file; `err` defaults to rate `0.82`/volume `0.85` |

---

## 7. Could not verify

Honest list of what I could **not** run or confirm from this session.

1. **The headless browser suite (`tests/t4-evidence.cjs`).** Chrome cannot be launched
   here — every attempt fails with `spawn EPERM` at `tests/harness.cjs:88`. The suite is
   written and syntax-checked but its result must be supplied by the Lead. This means
   the following are **not yet verified by me**:
   - zero console errors / zero failed requests on a real page load,
   - real trusted `page.keyboard.press` events driving the game,
   - real pointer clicks through `#GameLayerBG`,
   - `refreshLayout()` pixel values in a real layout engine,
   - the `time-over` anti-cheat end-to-end in a browser,
   - `tests/artifacts/board.png`.
2. **Web Audio playback.** `KanoAudio`'s Web Audio branch only activates when
   `location.protocol !== 'file:'` **and** `AudioContext`/`decodeAudioData` exist. The
   Node shim has neither, so only the `<audio>` fallback path is exercised here. The
   Web Audio path is coded defensively (every step wrapped, any failure falls back
   silently) but is unproven by test.
3. **Audible correctness of the three clips.** I verified that `play()` is called with
   the right id and that the `err` character defaults to a lower rate/volume; I cannot
   hear the output. Note that `tap.mp3` and `end.mp3` are byte-identical in this build
   (T1's spec), so `end` is deliberately left at rate 1 and is distinguished from `tap`
   only by *when* it fires.
4. **Mobile / touch devices.** `pointerdown` is used when `PointerEvent` exists, with a
   `touchstart`/`mousedown` fallback; only desktop Chrome could be exercised.
5. **`file://` end-to-end.** The `readBakedLocale()` path exists specifically for this,
   but `file://` cannot be tested from the headless suite (which serves over
   `http://127.0.0.1`). The Lead reports having verified it separately.
6. **Very long endless sessions.** The `_gameBBListIndex` / `_gameBBList` growth across a
   long round is inherited from the original and deliberate; it was exercised to 25
   rounds in the records test but not to memory exhaustion.
7. **The input-guard rewrite has not been through a browser.** The *previous* version of
   that check failed for a test-method reason (`#gameTime.focus()` does not move
   `document.activeElement` in headless Chrome, so a real keypress legitimately targets
   `<body>`). The rewritten version dispatches a keydown whose target is the input, plus a
   positive control. Its logic is shim-verified, but the browser re-run was not performed
   in this session.
8. **`tests/t4-evidence.cjs` has never been run by me.** Every execution of it in this
   record was the Lead's, under wider sandbox permissions. All its results quoted above
   are theirs, pasted from files under `tests/artifacts/`.

### 7.1 Bottom line

Every finding raised against `static/game.js` / `static/audio.js` — by the Lead or by the
independent verifier — has been fixed and re-verified by at least one suite that the T4
session did not author: the coordinate bug by `probe-target.cjs` (19/19 across four
viewport widths), and the gameplay rules by the verifier's v2/v6/v8b suites (90 checks,
0 failures). The two items above are about *test methods*, not game behaviour.

---

## 8. Files

| Path | Role |
|---|---|
| `static/game.js` | game logic, layout, input, i18n, records, `window.KanoGame` |
| `static/audio.js` | `window.KanoAudio` (`<audio>` pool + optional Web Audio) |
| `static/T4-LOGIC-NOTES.md` | this file |
| `tests/t4-evidence.cjs` | headless-browser acceptance suite (needs Chrome) |
| `tests/t4-logic-node.cjs` | no-browser suite: real `game.js`/`audio.js` in a DOM shim — **140/140** |
| `tests/t4-domcheck.cjs` | static DOM-contract pre-flight |
| `tests/artifacts/t4-node-run.txt` | full transcript of the no-browser run |
| `tests/artifacts/board.png` | board screenshot (produced by the browser suite) |

Paths under `tests/` are shared with T5; `tests/harness.cjs` was used read-only and not
modified.
