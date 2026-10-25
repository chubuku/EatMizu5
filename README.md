# Kano Beat

A 4-lane tap rhythm game for the browser. Hit the highlighted tile on the bottom
row as fast as you can. No server, no bundler, no CDN — it runs offline, straight
from `file://` with nothing to install.

![Kano Beat](static/image/ClickBefore.png)

A reskin and rebuild of [arcxingye/EatKano](https://github.com/arcxingye/EatKano) (MIT),
using the user's own art and audio. See [Provenance & licence](#provenance--licence).

---

## Quick start

There is nothing to install and nothing to compile.

**Option 1 — just open it.** Double-click `index.html` (or drag it into a browser
window). That loads over `file://` and everything works: the game logic, the
audio, the translations, and the local leaderboard.

Four things to know about `file://`:

- Some browsers (Safari, and Chrome on iOS) block audio until the first user
  gesture. `audio.js` handles this by priming playback on the first tap; if you
  hear nothing at first, tap once and try again.
- A `file://` page is origin-less, so the browser blocks it from loading the
  locale JSON files over the network. The translations you see on this path come
  from a copy baked into `index.html` at build time — see
  [the baked locale payload](#the-baked-locale-payload-and-why-it-exists). It is
  fully translated, but it is a copy, so keep it in sync if you edit a locale.
- Chrome refuses **all cookies** on a `file://` origin, so your **sound on/off
  choice does not survive a reload** there. It holds for the current session and
  the game degrades gracefully, but if you want settings to persist, serve the
  game over `http://` (Option 2). This is browser policy, not a defect.
- The local leaderboard uses `localStorage`, which works on `file://` but is
  scoped to that browsing context. Records are per-browser and per-file-path —
  move the folder and the records do not follow.

**Option 2 — serve it.** Useful if you want a stable origin for your records, or
you are testing on a phone.

```bash
npx serve .
# or
python -m http.server 8080
```

Then open <http://localhost:8080>.

> Both protocols are supported by design, and the verification suite checks each
> one — see [Testing](#testing). Do not expect them to behave identically: off
> `file://` the audio layer deliberately switches to a different, lower-latency
> playback path.

---

## How to play

The board is four lanes wide. Tiles scroll up from the bottom lane; you only ever
hit the highlighted tile when it is in the bottom row.

```
┌────┬────┬────┬────┐
│    │    │    │    │  ← tiles scroll up from the bottom lane
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│    │    │    │    │
├────┼────┼────┼────┤
│ ▓  │    │    │    │  ← the active tile: hit this one
└────┴────┴────┴────┘
  D    F    J    K
```

- **Hit the highlighted tile in the bottom lane.** Press the lane's key
  (`D F J K` by default, left to right) or tap/click anywhere inside that lane's
  bottom strip.
- **The first hit starts the clock.** Before that, the round is idle and taps on
  empty tiles do nothing.
- **A wrong hit ends the round** — immediately, in Normal and Endless. In
  Practice a wrong hit only flashes the tile red and play continues.
- **Your lane keys are configurable** in Settings. See [Settings](#settings).

### The tap zone

A tap counts as a hit only if it lands in the bottom strip of the board — the
region within one tile-height of the bottom edge. Taps higher up the board are
ignored. A tap in the correct lane's bottom strip counts even if it does not land
exactly on the tile graphic, which is what makes the game feel forgiving on
mobile.

---

## Game modes

Pick a mode from the title screen. The choice persists in a cookie.

| | **Normal** | **Endless** | **Practice** |
|---|---|---|---|
| HUD shows | countdown timer | `CPS:<value>` | `SCORE:<n>` |
| Score means | number of tiles hit | your CPS | number of tiles hit |
| Round ends | timer reaches 0 | a wrong hit | only when you quit |
| Wrong hit | immediate game over | immediate game over | flash only, play on |
| Best score | `bast-score` cookie | `endless-best-score` cookie | `practice-best-score` cookie |
| Saved to leaderboard | yes | yes | **no** |

**Normal** counts down from the configured time (20 seconds by default). Every
second the HUD ticks down; at zero the HUD shows the time-up message, the board
flashes, the end sound plays, and the results panel appears shortly afterwards.

**Endless** has no timer at all — the countdown does not run and cannot go
negative; the round ends only when you miss. It is scored on CPS — tiles hit per
second — so speed is the whole game. Right after you start, CPS shows the waiting
label because CPS is not meaningful until a little time has passed.

**Practice** never ends on a miss; wrong hits just flash. It is the mode for
learning the lanes. It deliberately writes no record, so it cannot pollute your
leaderboard.

### Rating thresholds

At the end of a round you get a rating line based on CPS:

| CPS | Rating |
|---|---|
| `<= 5` | level 1 |
| `<= 8` | level 2 |
| `<= 10` | level 3 |
| `<= 15` | level 4 |
| anything higher | level 5 |

The exact wording of each level comes from the locale file, so it is translated.

### CPS and accuracy

- **CPS** is `score / elapsedSeconds`, and is reported as `0` when it is not
  computable — i.e. right after the round starts, before there is enough elapsed
  time for the number to mean anything. Endless mode displays "waiting" instead
  of a bogus zero.
- **Accuracy** is `hits / (hits + misses) * 100`. With no taps at all it is `0`,
  not `100`.
- **Combo** resets to `0` on a wrong hit and at game over. Max combo is kept for
  the results panel.

### The anti-cheat guard

The original game defends its high-score table against players who pause the tab
or otherwise stall the timer. If a Normal round ends up lasting more than three
seconds longer than the configured time, the results screen shows a "you've
cheated for N.NNs" message instead of a score, and **no record is saved**.

This is preserved on purpose — it is part of the original's behaviour, and
removing it would make the leaderboard trivially fakeable.

---

## Settings

Open **Settings** from the title screen. Everything here is stored in a cookie
(100-day expiry, same as the original), so settings survive a reload and a
browser restart.

| Setting | Control | Cookie | Default | Validation |
|---|---|---|---|---|
| Title | `#title` text field | `title` | the game title from the locale | any text; applied to the browser tab on load |
| Lane keys | `#keyboard`, max 4 chars | `keyboard` | `dfjk` | exactly 4 single characters, lowercased; duplicates, whitespace and invalid entries fall back to `dfjk` |
| Game time | `#gameTime`, max 4 chars | `gameTime` | `20` | integer seconds, clamped to `5`–`120`; `0`, negative, `NaN` and absurd values are rejected |
| Sound | `#sound` toggle (`role="button"`, `aria-pressed`) | `soundMode` | `on` | `on` / `off`; turns all sfx on or off immediately |
| Mode | title-screen mode picker | `gameMode` | `1` (Normal) | `1` / `2` / `3` |
| Best — Normal | results panel | `bast-score` | `0` | managed by the game |
| Best — Endless | results panel | `endless-best-score` | `0` | managed by the game |
| Best — Practice | results panel | `practice-best-score` | `0` | managed by the game |

> ### `bast-score` is a typo, and it is staying
>
> The best score for Normal mode is stored under the cookie named **`bast-score`**
> — misspelled, exactly as it is in the original EatKano. It is preserved
> deliberately. It is a real, user-visible cookie name, and renaming it would
> silently discard the best scores of everyone upgrading from the original. The
> code carries a comment saying so.

### Custom tile art (session only)

Settings has two file pickers — **Img-before** and **Img-after** — that let you
swap the tile artwork for your own images without editing any files. Pick an
image and the board updates immediately.

**This is session-only and is not persisted.** The picks are read with
`FileReader.readAsDataURL` and injected into a `<style>` tag for the current
page load, exactly as the original did. A reload restores the shipped
`ClickBefore.png` / `ClickAfter.png` art. If you want your art to stick, replace
the files on disk instead — see [Customising](#customising).

---

## Local leaderboard

There is no server and no online ranking. Instead the game keeps a local
leaderboard in `localStorage` under the key:

```
kanoBeat.records.v1
```

Open it with **Records** on the title screen, or from the results panel.

**Records are written for Normal and Endless only.** Practice never writes. A
round suppressed by the anti-cheat guard also writes nothing.

The list is **capped at 20 records**, newest first. Records survive a reload,
and `clearRecords()` wipes the store and re-renders an empty list.

Each record looks like this:

```js
{
  mode: 1,              // 1 Normal | 2 Endless | 3 Practice
  score: 0,             // taps for Normal/Practice; CPS for Endless
  cps: 0,               // always the raw CPS; shown with 2 decimals
  combo: 0,
  maxCombo: 0,
  hits: 0,
  misses: 0,
  accuracy: 0,          // 0..100, one decimal when displayed
  timeSetting: 0,       // the configured round length in seconds
  durationMs: 0,        // how long the round actually took
  endedAt: 0,           // Date.now() when it ended
  complete: true,       // false if you quit mid-round
  deviationMs: 0        // overshoot against the configured time
}
```

**Records may be unavailable.** Browsers in private mode, and some `file://`
contexts, throw on `localStorage` access. Every read and write is wrapped, and if
storage is unusable the game degrades to an in-memory list: the leaderboard works
for the current session and is simply forgotten when you close the tab. The game
itself always keeps playing.

**Records are per-browser.** They live in one browser profile on one machine.
Clearing site data, using private mode, or opening the game from a different path
means a different — usually empty — leaderboard.

---

## Project layout

```
kano-game/
├── index.html                  markup, the 80 board tiles, all overlays
├── CONTRACT.md                 the frozen interface contract every file is written against
├── README.md                   this file
├── static/
│   ├── index.css               the theme: palette, board, HUD, overlays
│   ├── lang.js                 sets <html lang/dir> before the game starts
│   ├── game.js                 all gameplay: board, clock, scoring, records, i18n
│   ├── audio.js                window.KanoAudio — pooled <audio> + optional Web Audio
│   ├── i18n/
│   │   ├── en.json             English strings
│   │   ├── ja.json             Japanese strings
│   │   └── zh.json             Chinese strings
│   ├── image/
│   │   ├── ClickBefore.png     tile art, normal state
│   │   └── ClickAfter.png      tile art, hit state
│   └── music/
│       ├── tap.mp3             correct-hit sound
│       ├── end.mp3             round-ended sound
│       └── err.mp3             wrong-hit sound
├── tools/
│   ├── make-hit-image.mjs      regenerates ClickAfter.png from ClickBefore.png
│   └── bake-i18n.mjs           regenerates the baked locale payload in index.html
└── tests/                      verification suite and its report
```

There is no `vendor/` directory and none is needed: the build has **zero**
external dependencies, and no CDN, jQuery, Bootstrap or CreateJS is loaded at
runtime.

### How the scripts load

`static/lang.js`, `static/audio.js` and `static/game.js` are **classic scripts**,
not ES modules, and they load in that order. `game.js` is the only script that may
consume `window.KanoAudio`. This is not a style preference — `type="module"`
breaks under `file://` because module fetches are subject to CORS, and supporting
`file://` is a hard requirement.

`index.html` therefore ends with five script elements, in this order:

1. a small **inline helper** that toggles the mode dropdown (the markup owns this
   because no global for *opening* the menu is otherwise defined),
2. `<script src="./static/lang.js">` — settles the document's `lang` attribute
   *first*, before anything else runs,
3. `<script src="./static/audio.js">`,
4. `<script src="./static/game.js">`,
5. the **baked locale payload** — a `<script type="application/json">` block, see
   below.

Still zero external URLs and zero `type="module"` anywhere in the page.

### `static/lang.js` — an honest `lang` attribute

The markup has to ship *some* concrete `lang` attribute, but the game is
trilingual: without help the page would announce `lang="en"` while displaying
Japanese, which misleads screen readers, translation tools and search engines.

`static/lang.js` loads **before** `game.js` and sets `documentElement.lang` (and
`dir`) from:

1. the player's saved choice in `localStorage['kanoBeat.lang']` when present,
   otherwise
2. the same `navigator.language` mapping `game.js` uses — `zh` → Chinese,
   `ja` → Japanese, anything else → English.

It is a classic script with zero dependencies, and it never throws if storage is
blocked: a browser that refuses `localStorage` simply falls through to step 2. It
exposes `window.KanoLang` with `set(lang)` and `refresh()`, so a language change
can be applied immediately instead of waiting for a reload.

### The baked locale payload, and why it exists

When `index.html` is opened directly from disk, the page is *origin-less*, and
Chrome refuses `fetch()`, `XMLHttpRequest()` **and** `<script src>` for sibling
files alike. That would leave the game untranslated exactly in the double-click
case that the Quick start recommends.

So `index.html` also carries a `<script id="i18n-utf8" type="application/json">`
block containing all three locales, each stored as a JSON *string* so the payload
survives even if the page is not served as UTF-8. `game.js` prefers that copy on
`file://` and falls back to the network load otherwise.

**`static/i18n/*.json` is the source of truth.** The inline copy is generated:

```bash
node tools/bake-i18n.mjs           # regenerate the baked copy
node tools/bake-i18n.mjs --check   # exit non-zero if it is stale
```

Editing a locale file without re-running the bake script leaves the baked copy —
and therefore the `file://` experience — out of date. `--check` is the guard
against that.

---

## Customising

### Swapping the art and audio

Drop your own files in and keep the **exact filenames** — the CSS and the JS
reference them by name, so a renamed file is simply not found.

| File | Used for | Notes |
|---|---|---|
| `static/image/ClickBefore.png` | tile art, normal state | must be named `.png` |
| `static/image/ClickAfter.png` | tile art, hit state | must be named `.png` |
| `static/music/tap.mp3` | correct hit | must be named `.mp3` |
| `static/music/end.mp3` | round ended | must be named `.mp3` |
| `static/music/err.mp3` | wrong hit | must be named `.mp3` |

The `.png` requirement is inherited from the original and enforced by the
stylesheets, which reference the files by that exact path. Browsers sniff image
content rather than trusting the extension, so the shipped `ClickBefore.png` is
in fact a JPEG named `.png` and renders fine.

This build ships `tap.mp3` and `end.mp3` as the **same clip**. To keep a wrong
hit audibly distinct, the `err` sound is played pitched down and slightly
quieter by default.

`ClickAfter.png` is generated from `ClickBefore.png` by a dependency-free Node
script, which posterises the source into flat, high-contrast colour blocks:

```bash
node tools/make-hit-image.mjs
```

The script is idempotent — running it twice produces a byte-identical file. It is
deterministic by construction (no timestamps, fixed compression settings), so the
output is safe to commit and to diff.

### Adding a language

Four steps — miss the last one and the new language will not appear when the game
is opened from disk:

1. Copy `static/i18n/en.json` to `static/i18n/<lang>.json` and translate the
   values. **Do not change the key set** — every locale must have exactly the
   same keys, and a missing key falls back to its own name.
2. Extend the `navigator.language` mapping in **both** places that read it, so the
   locale choice and the document's `lang` attribute agree:
   - `static/game.js` — decides which strings to load,
   - `static/lang.js` — sets `<html lang>` and `dir` before the game starts.

   Each uses one regex per language.
3. **Re-run the bake script** so the new locale is included in the copy baked
   into `index.html`:

   ```bash
   node tools/bake-i18n.mjs
   ```

   Then confirm it is in sync:

   ```bash
   node tools/bake-i18n.mjs --check
   ```

Without step 3 the locale works when served over `http://` but not when
`index.html` is opened directly from disk — which is the default way to run this
game. Without step 2's `lang.js` half, the page would display your language while
still claiming `lang="en"`.

Plurals and formatting are not handled by the loader; every string is a plain
value.

---

## Testing

The verification suite lives in `tests/` and is driven by `playwright-core`,
which is a **devDependency only**. It drives system Chrome, is not bundled with
the game, and is not needed to play.

```bash
node tests/<name>.cjs
```

Run these from the `kano-game/` directory so relative paths resolve.

The suite covers, among other things:

- a clean load under **both** `file://` and `http://`, with zero console errors
  and zero failed requests — `file://` is the interesting case, because that is
  where `fetch()` is blocked
- that the page makes no network request outside its own origin
- that the shipped assets actually load and decode
- gameplay parity: scoring, combos, the tap zone, wrong-hit game over, practice
  mode's leniency, and the CPS rule
- the record store: one record per round, none for practice, the 20-record cap,
  and the anti-cheat guard suppressing writes
- pausing via the Records panel mid-round, and resuming without losing state
- persistence of every setting across a reload
- adversarial robustness: bad settings values, a throwing `localStorage`,
  out-of-range lane indices, and viewport resizes

The written report is **[`tests/VERIFICATION.md`](tests/VERIFICATION.md)** — a
full independent verification, written by a verifier who did not author any of
the implementation. It records every test as PASS / FAIL / UNVERIFIED with its
raw evidence, lists the claims that could not be verified, and carries its own
residual-risk section. It is the authoritative statement of what works; this
README describes intended behaviour.

At the time of writing the suite is **green** — every runnable check passes:

```
v0-static 58/0   v1-load 26/0      v2-network 17/0   v4-gameplay 81/0
v5-modes 25/0    v6-records 36/0   v7-persist 33/0  v9-leaks 30/0
v11-audio 40/0   v8b-node 37/0     probe-target 19/0
d1-regression 55/0   probe-visual 15/0   v10-visual 118/0
t4-logic-node 145/145
```

(each figure is `passed/failed`). The verifier's own report also documents that
19 of its first-round "failures" were defects in the *tests*, not the game — the
kind of detail worth reading before trusting any single number.

> **Sandbox caveat.** In a constrained environment, launching Chrome from a
> scripted shell can fail with `spawn EPERM`. That is an environment permission
> limit, not a bug in the game. Run the tests from a normal terminal where the
> browser can be launched.

---

## Accessibility

- The board is exposed with `role="application"` and a translated label.
- The timer/HUD is a live region (`role="status"`, `aria-live="polite"`), so
  screen readers announce the countdown.
- **The `lang` attribute is honest.** `static/lang.js` sets `<html lang>` (and
  `dir`) from the saved choice or `navigator.language` *before* the game starts,
  so a Japanese or Chinese player's page is announced in the right language
  instead of the `lang="en"` the markup ships with.
- A visually-hidden hint (`#a11y-hint`) describes the controls to assistive
  technology without cluttering the screen.
- **The whole game is playable by keyboard** — four keys, configurable, and no
  mouse-only interaction is required to play a round.
- `prefers-reduced-motion: reduce` disables the board flash and wrong-hit
  animations.
- `<noscript>` warns if scripting is disabled, since the game cannot run without
  it.

---

## Provenance & licence

**Upstream code.** Kano Beat is a reskin and rebuild of
[arcxingye/EatKano](https://github.com/arcxingye/EatKano), which is MIT-licensed.
The gameplay logic in `static/game.js`, the board layout, the cookie names and
the CSS class names are derived from that project. The MIT notice is reproduced
below, and the original licence text is also at `..\eatkano-ref\LICENSE`.

**Removed from the original.** The PHP/MySQL server-side ranking backend
(`rank.php`, `SubmitResults.php`, `conn.php`, `kano.sql`) is gone, along with all
CDN dependencies (CreateJS, jsEncrypt, Bootstrap, jQuery) and the
`document.write` layout hacks that went with them. The original had no
server-independent leaderboard, so this build adds a local one.

**The art and audio are the user's own.** `static/image/ClickBefore.png`,
`static/image/ClickAfter.png` and the three files in `static/music/` come from
the user's own files. **They are not covered by the upstream MIT licence**, and
this repository does not relicense them. If you reuse this project, treat those
five assets separately from the code.

**MIT notice for the upstream project:**

```
Copyright © 2022-present Seiya

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Deploying

The game is a **static site with zero runtime dependencies**: no backend, no
database, no build toolchain, and no CDN. Any static host can serve it, including
GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3, or a plain nginx directory.

### Why not just serve the repository root

The repository root doubles as the development workspace, so it holds far more
than the game:

| Path | Size | Ship it? |
|---|---|---|
| `index.html` + `static/` | ~1.0 MB / 13 files | **Yes — this is the game** |
| `tests/` | ~6.5 MB | No — verification suites and screenshots |
| `node_modules/` | ~13 MB | **Never** — `playwright-core`, dev only |
| `tools/`, `CONTRACT.md`, notes | small | No |

Publishing the root would push ~41 MB instead of ~1 MB, and would expose your
verification suite and screenshots. So build a clean payload first:

```bash
node tools/build-dist.mjs --verify
```

That copies exactly the 13 files a browser needs into `dist/`, and then
**asserts the payload is self-contained**: no external URLs, no
`type="module"`, and every `./static/...` reference resolves to a file that is
actually in the publish set. It exits non-zero if anything is missing, so a
broken deploy fails loudly instead of shipping a half-empty site.

```
BUILT  dist/  (13 files, 1.01 MB)
VERIFY OK  no external URLs, no module scripts, every asset reference resolves
```

Deploy the **contents of `dist/`**. Nothing else.

### GitHub Pages

A workflow is included at `.github/workflows/deploy-pages.yml`.

1. Push the project to a GitHub repository.
2. **Settings → Pages → Source: "GitHub Actions"** (not "Deploy from a branch" —
   the workflow publishes `dist/`, which does not exist in git).
3. Push to `main`, or run the workflow manually from the Actions tab.

Your URL will be `https://<username>.github.io/<repository>/`, and because every
path in the game is relative (`./static/...`), it works correctly in a
subdirectory — no configuration needed.

> If you prefer the classic branch-based flow instead: run
> `node tools/build-dist.mjs`, commit the `dist/` folder, and set
> **Settings → Pages → Source: "Deploy from a branch"** with the folder
> `/docs` or a dedicated `gh-pages` branch. The workflow approach is cleaner
> because the built output never enters your git history.

### Netlify / Cloudflare Pages / Vercel

A `netlify.toml` is included. For any of these:

| Setting | Value |
|---|---|
| Build command | `node tools/build-dist.mjs --verify` |
| Publish / output directory | `dist` |

Cloudflare Pages and Vercel use the same two values (Vercel calls it "Output
Directory"). None of them need an install step, because the build script imports
only `node:` built-ins.

### Anywhere else, including a USB stick

Because there is no server component, `file://` works: copy `dist/` wherever you
like and open `dist/index.html`. That path is verified — see
`tests/dist-acceptance.cjs`, which serves the built output as a site root and
plays a round at two viewport sizes, then re-checks the `file://` route.

```bash
node tests/dist-acceptance.cjs
```

### Deploy checklist

- [ ] `node tools/build-dist.mjs --verify` exits 0
- [ ] `node tests/dist-acceptance.cjs` passes
- [ ] Only `dist/` is published (never the repository root)
- [ ] `node_modules/`, `tests/` and `static/i18n/_*` are not reachable at the URL
- [ ] Open the deployed URL on a phone and confirm the board fills the screen

### What deployment does *not* give you

No shared leaderboard. The original EatKano shipped `index.php`, `rank.php`,
`conn.php` and `kano.sql` for a MySQL ranking table; all of that was removed
deliberately. Scores live in each player's `localStorage`, so a public URL gives
every visitor their own private high-score list. If you want a global ranking you
must add a backend — that is a new feature, not a deployment step.

---

## Known limitations

These are real and deliberate, not oversights:

- **No online ranking.** There is no server and no backend. The leaderboard is
  local to one browser.
- **Records are per-browser and per-origin.** Different browser, different
  profile, private mode, or a different file path means a different leaderboard.
  `localStorage` can be unavailable entirely, in which case records are
  in-memory for the session only.
- **Custom tile art is not persisted.** Images chosen in Settings last until you
  reload. To make them permanent, replace the files in `static/image/`.
- **`bast-score` keeps the original's typo.** Intentional, for backwards
  compatibility with existing players' best scores.
- **The anti-cheat guard can misfire.** A round that genuinely runs more than
  three seconds long — for example on a heavily loaded machine — is treated as
  cheating and saves no record. The threshold is inherited from the original.
- **Settings validation is forgiving rather than strict.** Out-of-range values
  are clamped, not rejected, so an entry you typed may not be exactly what the
  game keeps.
- **The tap zone is defined relative to the board's bottom edge**, and the board
  is capped in width on wide screens — a tap far to the right of a centred board
  is outside it and will not score.
- **Two sounds are the same clip by default.** `tap.mp3` and `end.mp3` ship as
  identical files; only the pitched-down error cue distinguishes a miss.
- **The baked locale copy can go stale.** `index.html` carries a generated copy of
  all three locales so that `file://` works. If you edit `static/i18n/*.json`
  without re-running `node tools/bake-i18n.mjs`, the served build updates but the
  double-clicked build keeps the old strings. Run
  `node tools/bake-i18n.mjs --check` to detect it.
- **Some locale strings are currently unconsumed.** The `paused` and `resume`
  keys exist in all three locales for a pause overlay that the game does not yet
  display. They are dead strings today, kept for the feature they were written
  for.
- **No sounds have been heard by a human.** Automated checks confirm that the
  audio layer registers, enables, disables and returns the right values, but the
  test browser runs muted. That the three clips *sound* correct — and in
  particular that the pitched-down error cue is distinguishable from the hit cue
  when both come from the same file — has not been listened to. Check it by ear.
- **Chromium and Edge only.** The suite drives system Chrome; Firefox and Safari
  have not been tested. The `file://` restrictions documented in
  [Quick start](#quick-start) are known to differ between engines, so treat other
  browsers as untested rather than broken.
- **The `file://` settings caveat.** Chrome refuses all cookies on a `file://`
  origin, so sound (and other cookie-backed settings) do not survive a reload
  there. Serve over `http://` if persistence matters.
- **Gameplay correctness is asserted by the test suite, not by this README.**
  Scoring, combo, the tap zone, wrong-tap handling, mode differences, the record
  store and the persistence layer are all covered by `tests/`, and the suite is
  currently green. Treat [`tests/VERIFICATION.md`](tests/VERIFICATION.md) as the
  authoritative statement of what passes; this document describes intended
  behaviour.

  If you are evaluating a build for release, re-run the suite yourself rather than
  trusting either document.

---

## Development notes

- `CONTRACT.md` is the authoritative description of the architecture, the DOM
  ids, the cross-module APIs, the persistence keys and the gameplay rules. Every
  file in this project was written against it. **Read it before changing
  anything**, especially `static/game.js`, which depends on exact element ids
  from `index.html`.
- The 80 board tiles are written out explicitly in `index.html` — 40 per layer,
  two layers. Their order is a contract: index `j` maps to
  `left = (j % 4) * blockSize` and `bottom = floor(j / 4) * blockSize`, so index
  `0..3` is the bottom row.
- There is no bundler and no runtime dependency. Edit a source file and reload
  the page. The one generated artifact is the baked locale payload inside
  `index.html`; after editing anything in `static/i18n/`, re-run
  `node tools/bake-i18n.mjs` (and `--check` to verify).
