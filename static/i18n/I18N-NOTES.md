# T2 — i18n locale files (en / ja / zh)

Owner: **T2** · Write scope: `kano-game/static/i18n/` only.
Source of truth for keys: `CONTRACT.md` §3, the T2 task spec, and the live runtime.

| File | Keys | Bytes | Notes |
|---|---|---|---|
| `static/i18n/en.json` | 52 | 1603 | UTF-8, no BOM, 2-space indent, LF, trailing newline |
| `static/i18n/ja.json` | 52 | 1955 | UTF-8, no BOM, 2-space indent, LF, trailing newline |
| `static/i18n/zh.json` | 52 | 1692 | UTF-8, no BOM, 2-space indent, LF, trailing newline |

All three files are **exactly** `JSON.stringify(obj, null, 2) + "\n"` with keys sorted
alphabetically, so diffs between locales line up row-for-row.

## Loader contract

`game.js` resolves strings through a `t(key)` helper whose dictionary starts as a copy of
its embedded English `DEFAULT_I18N` and is then overridden by
`./static/i18n/<lang>.json`, fetched via `fetch` with an `XMLHttpRequest` fallback (so
`file://` still works). `index.html` requests keys declaratively via
`data-i18n` / `data-placeholder-i18n` attributes, which `applyI18N()` fills in.
`lang` also sets `<html lang>`.

Requirements these files satisfy:

- Flat object, **no nested objects**, **no array values** — every value is a string.
- Key `lang` holds the locale code and is effectively the **only** key whose value differs
  by design (see the identical-value review list below for the three exceptions).
- The three key sets are kept identical by construction (check 3), so no locale silently
  falls back to the embedded English defaults for a key its siblings define.
- `time-over` is used as a **prefix**: `t('time-over') + (over/1000).toFixed(2) + 's'`.
  It therefore ends with a space in every locale, including ja/zh.

## Verification

Run from `kano-game/static/i18n/`:

```
node _gen.cjs            # regenerate the three files deterministically
node _verify.cjs         # structure: parse / shape / identical key sets / removed keys
node _runtime-keys.cjs   # every key the real runtime consumes exists in all 3 locales
node _baked-check.cjs    # index.html's baked copy deep-equals the files on disk
node tools/bake-i18n.mjs # REQUIRED after any edit: re-bake into index.html
node _xcheck.cjs         # assert this notes file still quotes the live output verbatim
node _build-notes.cjs    # regenerate this file from live output
```

### A. Structural checks — `node _verify.cjs`

```
=== 1. raw bytes ===
PASS  en.json: no BOM
PASS  en.json: valid UTF-8 round-trip (1603 bytes)
PASS  en.json: single trailing newline at EOF
PASS  en.json: canonical 2-space indent, one key per line, no trailing comma
PASS  en.json: byte-identical to JSON.stringify(obj, null, 2) + "\n"
PASS  ja.json: no BOM
PASS  ja.json: valid UTF-8 round-trip (1955 bytes)
PASS  ja.json: single trailing newline at EOF
PASS  ja.json: canonical 2-space indent, one key per line, no trailing comma
PASS  ja.json: byte-identical to JSON.stringify(obj, null, 2) + "\n"
PASS  zh.json: no BOM
PASS  zh.json: valid UTF-8 round-trip (1692 bytes)
PASS  zh.json: single trailing newline at EOF
PASS  zh.json: canonical 2-space indent, one key per line, no trailing comma
PASS  zh.json: byte-identical to JSON.stringify(obj, null, 2) + "\n"

=== 2. JSON.parse ===
PASS  en.json parses with JSON.parse
PASS  ja.json parses with JSON.parse
PASS  zh.json parses with JSON.parse

=== 3. key sets identical + alphabetical ===
PASS  en.json: keys sorted alphabetically
PASS  ja.json: keys sorted alphabetically
PASS  zh.json: keys sorted alphabetically
PASS  en key set === ja key set
PASS  en key set === zh key set
key count: 52 (en=52 ja=52 zh=52)
PASS  all three have the same key count

=== 4. removed keys absent (all locales) ===
PASS  25 removed keys absent everywhere

=== 5. time-over is a usable PREFIX (append "<sec>s") ===
PASS  en.json: time-over "You've cheated for " ends with whitespace -> renders as "You've cheated for 3.42s"
PASS  ja.json: time-over "カウントダウン偏差 " ends with whitespace -> renders as "カウントダウン偏差 3.42s"
PASS  zh.json: time-over "倒计时多了 " ends with whitespace -> renders as "倒计时多了 3.42s"

=== 6. values identical to English (review list, not an error) ===
  REVIEW ja.no-records = "—"
  REVIEW ja.ok = "OK"
  REVIEW zh.no-records = "—"

=== 7. no untranslated placeholder tokens / leftover en words in ja,zh ===
PASS  no "{placeholder}" tokens left in ja/zh

=== 8. every I18N key referenced by the runtime exists in all locales ===
scanned 3 runtime file(s); 1 distinct I18N[...] keys referenced
referenced: lang
PASS  all runtime-referenced keys present
keys not yet referenced by any scanned runtime file: 51
PASS  CONTRACT.md §3 references 7 keys (a11y-board, a11y-hint, calculating, eat-kano, records-clear, time-over, time-up) — all present
PASS  all 19 Lead-required keys present in all locales
PASS  en paused="Paused", resume="Resume"

=== FINAL KEY LIST (52) ===
 1. a11y-board
 2. a11y-hint
 3. accuracy
 4. again
 5. best
 6. calculating
 7. combo
 8. default-20s
 9. default-dfjk
10. eat-kano
11. endless
12. game-intro1
13. game-intro2
14. game-title
15. hits
16. home
17. img-after
18. img-before
19. key
20. kickoff
21. lang
22. max-combo
23. misses
24. mode-desc-endless
25. mode-desc-normal
26. mode-desc-practice
27. no-records
28. normal
29. ok
30. paused
31. practice
32. record
33. records
34. records-clear
35. records-cleared
36. records-empty
37. records-title
38. resume
39. score
40. settings
41. sound-off
42. sound-on
43. start
44. text-level-1
45. text-level-2
46. text-level-3
47. text-level-4
48. text-level-5
49. time
50. time-over
51. time-up
52. title

=== RESULT ===
ALL CHECKS PASSED
```

### B. Runtime-consumption checks — `node _runtime-keys.cjs`

```
keys consumed by index.html / game.js / audio.js: 45
consumed: a11y-board, a11y-hint, accuracy, again, best, calculating, default-20s, default-dfjk, eat-kano, endless, game-intro1, game-intro2, game-title, hits, home, img-after, img-before, key, lang, max-combo, misses, mode-desc-endless, mode-desc-normal, mode-desc-practice, normal, ok, practice, record, records-clear, records-empty, records-title, score, settings, sound-off, sound-on, start, text-level-1, text-level-2, text-level-3, text-level-4, text-level-5, time, time-over, time-up, title
PASS  en.json defines all 45 consumed keys
PASS  ja.json defines all 45 consumed keys
PASS  zh.json defines all 45 consumed keys

keys defined but not consumed by these files: 7 -> combo, kickoff, no-records, paused, records, records-cleared, resume

DEFAULT_I18N in game.js: 49 keys; en.json: 52 keys
  in en.json but not in DEFAULT_I18N: paused, records, resume
  in DEFAULT_I18N but not in en.json: (none)
  same key, different English value: mode-desc-endless (game.js="Three misses and it's over. Scored on CPS." en.json="One wrong tile ends the run. Scored on CPS.")

RESULT: ALL CONSUMED KEYS PRESENT
```

### C. Baked-payload sync — `node _baked-check.cjs`

Chrome blocks `fetch`, `XMLHttpRequest` **and** `<script src>` for sibling files under
`file://`, so the locales are also baked into `index.html` as an inline
`<script id="i18n-utf8" type="application/json">` payload by the Lead-owned
`tools/bake-i18n.mjs`. **`static/i18n/*.json` remains the single source of truth**; after
editing them the baker must be re-run or the `file://` build serves stale strings.

```
PASS  baked "en" matches static/i18n/en.json (52 keys, deep-equal)
PASS  baked "ja" matches static/i18n/ja.json (52 keys, deep-equal)
PASS  baked "zh" matches static/i18n/zh.json (52 keys, deep-equal)
PASS  all 3 on-disk locale(s) baked: en, ja, zh

RESULT: BAKED PAYLOAD IN SYNC
```

## Key-name conflict with `index.html` (resolved)

The T2 spec freezes the Records button key as `record` (singular); the T3 spec freezes the
markup as `data-i18n="records"` (plural, used on both the title-screen and results-screen
buttons). Neither writer could change the other's file, and `game.js` reads **neither**
(it uses `records-title`, `records-empty`, `records-clear` only), so **both keys are
defined with the same value in all three locales**. `record` satisfies the T2 spec;
`records` makes the shipped markup render correctly. This is why the count is 52
rather than the spec's 51.

## Values deliberately left identical to English

| ja | `no-records` | `—` | see note below |
| ja | `ok` | `OK` | see note below |
| zh | `no-records` | `—` | see note below |

- `ok` → `OK`: eatkano-ref `ja.json` also uses the Latin `OK`; Japanese UIs commonly keep it.
- `no-records` → `—`: a typographic em dash, not a translatable word.

No other ja/zh value equals its English counterpart — no key was left untranslated, and no
`{placeholder}` token survives from the reference.

## Keys removed (25, all locales)

`rank`, `rank-title`, `query-record`, `day-rank`, `week-rank`, `month-rank`, `all-rank`,
`navbar-brand`, `daily-ranking`, `weekly-ranking`, `monthly-ranking`, `all-ranking`,
`source-code`, `query-input`, `search-btn`, `no-data`, `no-message`, `self-record`,
`no-self-record`, `no-name-tip`, `name`, `comment`, `record-rank`, `no-ad-bad-lang`, `repo`
— the server-side ranking page has no counterpart here; the local leaderboard replaces it.

## Translation notes (ja / zh)

Terms are aligned with eatkano-ref where the concept is unchanged; new strings are
idiomatic rather than literal.

- **`hits` / `misses` / `accuracy`** — ja `成功` / `ミス` / `精度`; zh `命中` / `失误` / `准确率`.
  `misses` kept as the loanword `ミス` in ja, matching how JP rhythm games label it.
- **`combo` / `max-combo`** — ja `コンボ` / `最大コンボ`; zh `连击` / `最高连击`.
- **`record` / `records`** (button) vs **`records-title`** (panel heading) — zh uses `本地记录`
  for both the button and the heading, since it reads naturally in both roles; ja uses the
  short button label `記録` and the heading `ローカル記録`.
- **`mode-desc-*`** — ja uses the casual imperative `〜しよう` for normal and the polite
  `〜で競います` for endless; zh uses a parallel short-clause style. `mode-desc-endless` was
  corrected to "One wrong tile ends the run" because `game.js` implements an immediate
  game-over on a wrong tap in Endless exactly as in Normal — there is no 3-miss life system,
  so the originally specified "Three misses and it's over" was factually wrong.
- **`a11y-hint`** — polite ください register in ja (screen-reader string) while `kickoff`
  stays casual, mirroring the original's informal in-game tone.
- **ja `again`** — `もう一度` ("one more time") rather than the ref's curt `再び`.
- **zh `sound-on` / `sound-off`** — `音效: 开启` / `音效: 关闭`, keeping the ref's ASCII colon.
- **`a11y-board`** — ja `ゲーム盤、4レーン`; zh `游戏面板，共4条轨道`.

ASCII `!` / `?` are used instead of full-width `！`/`？` throughout, matching the reference
files' existing convention rather than mixing both widths.

## Final key list (52)

```
 1. a11y-board
 2. a11y-hint
 3. accuracy
 4. again
 5. best
 6. calculating
 7. combo
 8. default-20s
 9. default-dfjk
10. eat-kano
11. endless
12. game-intro1
13. game-intro2
14. game-title
15. hits
16. home
17. img-after
18. img-before
19. key
20. kickoff
21. lang
22. max-combo
23. misses
24. mode-desc-endless
25. mode-desc-normal
26. mode-desc-practice
27. no-records
28. normal
29. ok
30. paused
31. practice
32. record
33. records
34. records-clear
35. records-cleared
36. records-empty
37. records-title
38. resume
39. score
40. settings
41. sound-off
42. sound-on
43. start
44. text-level-1
45. text-level-2
46. text-level-3
47. text-level-4
48. text-level-5
49. time
50. time-over
51. time-up
52. title
```

## Files in this directory

- `en.json`, `ja.json`, `zh.json` — the deliverables.
- `_gen.cjs` — deterministic generator; fails loudly if a removed key reappears, a key set
  diverges, or `time-over` loses its trailing space.
- `_verify.cjs` / `_verify-output.txt` — structural checks and their captured raw output.
- `_runtime-keys.cjs` / `_runtime-keys-output.txt` — runtime-consumption checks + output.
- `_xcheck.cjs` — asserts the raw output above is quoted here verbatim.
- `_build-notes.cjs` — regenerates this notes file from live output.
- `I18N-NOTES.md` — this file (generated).
