# T1 — Asset acceptance evidence

Task: `task-1` (T1 — Vendor assets and build image tooling)
Owner: assets-dev
Project root: `C:\Users\user\Documents\deepseek-harness\default-workspace\kano-game`

All six required files are on disk. Every claim below is backed by raw command output.

---

## 1. File listing

```text
PS> Get-ChildItem -Recurse kano-game\static -File | Select-Object FullName,Length

FullName                                                                                        Length
--------                                                                                        ------
...\kano-game\static\image\ClickAfter.png                                                       768119
...\kano-game\static\image\ClickBefore.png                                                       92149
...\kano-game\static\music\end.mp3                                                               21552
...\kano-game\static\music\err.mp3                                                               14472
...\kano-game\static\music\tap.mp3                                                               21552
```

(The listing above is filtered to the T1-owned files; the full recursive listing also
contains other owners' `.js`/`.css`/`.json`/`.md` files, which are outside this scope.)

Tools owned by T1:

```text
...\kano-game\tools\make-hit-image.mjs          8006
...\kano-game\tools\jpeg-decode.mjs            20105
...\kano-game\tools\_bit-stuffing-test.mjs      1626
...\kano-game\tools\_validate-decode.mjs         708
```

---

## 2. SHA256 of all six assets

```text
FA4D45FBF5645C2A0A065178FCD0474A809A96507E1B71CC8BC34C6D26EA2EC3  static\image\ClickBefore.png
BB5082005B62CDB4B5954F083C145D2BCBAE3AEEB2387CD31065E551B67BC74D  static\image\ClickAfter.png
CC45910545391B65535CCD0D9167A342A466996674A3E86CBE0180CDBC78A71F  static\music\tap.mp3
CC45910545391B65535CCD0D9167A342A466996674A3E86CBE0180CDBC78A71F  static\music\end.mp3
7775CB6FA7570307682D684CC89676AB73C322987F3F5BBF97E9DB9109BFCFC7  static\music\err.mp3
6B550A14876F5A7788E41B114B2DE76FD1FB707FF10D4804C821B0D3422FEF4C  tools\make-hit-image.mjs
```

Supporting tool hashes:

```text
799FBBC043626B0F24F85E7F33F86496F725335E4A25812C89A022BDDAF5F14D  tools\jpeg-decode.mjs
```

---

## 3. tap.mp3 === end.mp3, and both differ from err.mp3

```text
CC45910545391B65535CCD0D9167A342A466996674A3E86CBE0180CDBC78A71F  static\music\tap.mp3
CC45910545391B65535CCD0D9167A342A466996674A3E86CBE0180CDBC78A71F  static\music\end.mp3
7775CB6FA7570307682D684CC89676AB73C322987F3F5BBF97E9DB9109BFCFC7  static\music\err.mp3
```

- `tap.mp3` and `end.mp3` hashes are **identical** -> byte-identical, as the user specified
  ("end sound = the same gomen file"). Both are 21552 bytes.
- `err.mp3` hash differs from both -> it is a distinct file (`mizukii.mp3`, 14472 bytes).

Container check (first three bytes are the `ID3` tag magic, `49 44 33`):

```text
tap.mp3 : 49 44 33 len=21552
end.mp3 : 49 44 33 len=21552
err.mp3 : 49 44 33 len=14472
```

---

## 4. ClickAfter.png is a valid 8-bit RGBA PNG

First 8 bytes are the PNG signature:

```text
first 8 bytes: 89 50 4E 47 0D 0A 1A 0A
```

Parsed IHDR (bytes 16..28 of the file):

```text
chunk1 type : IHDR
width       : 720
height      : 720
bitDepth    : 8
colorType   : 6      (truecolour + alpha)
compression : 0      (deflate)
filter      : 0      (adaptive)
interlace   : 0      (none)
```

Stream terminates with IEND (last 8 bytes `49 45 4E 44 AE 42 60 82`, a valid CRC):

```text
last 8 bytes: 49 45 4E 44 AE 42 60 82
final chunk : IEND
```

The generator re-parses its own output after writing and exits non-zero if any of
width/height/bitDepth/colorType do not match expectations.

---

## 5. ClickAfter.png differs materially from ClickBefore.png

Measured with Pillow over the full 720x720 grid (518,400 pixels), comparing decoded RGB:

```text
mean abs per-pixel diff before vs after: 26.11
max diff: 110
fraction of pixels differing: 100.0 %
```

Mean absolute per-pixel difference is **26.11** (out of 255), i.e. ~10% of full scale,
with **100%** of pixels changed -> unambiguously a different image, and visually it
reads as the dimmed/desaturated "spent" hit state. Not a trivial or accidental delta.

---

## 6. How ClickAfter.png is generated

`tools/make-hit-image.mjs` — pure Node, **zero dependencies**, uses only
`node:fs`, `node:path`, `node:zlib`, `node:crypto`, `node:url`.

It decodes `static/image/ClickBefore.png` with the bundled pure-Node baseline JPEG
decoder in `tools/jpeg-decode.mjs`, applies the hit-state treatment per pixel
(desaturate 0.55 toward Rec.601 luma, multiply by 0.62, blend 30% of the coral tint
`rgb(255,122,107)`, set alpha to 150), and writes an 8-bit RGBA PNG with filter type 0
on every scanline and `deflateSync({level:9, memLevel:9, strategy:0})`.

### Exact command and stdout

```text
PS> node tools\make-hit-image.mjs
make-hit-image: decoded-source 720x720 bitDepth=8 colorType=6 alpha=150 bytes=768119 sha256=bb5082005b62cdb4b5954f083c145d2bcbae3aeeb2387cd31065e551b67bc74d
```

Exit code 0.

### Idempotency (run twice, byte-identical)

```text
PS> node tools\make-hit-image.mjs
make-hit-image: decoded-source 720x720 bitDepth=8 colorType=6 alpha=150 bytes=768119 sha256=bb5082005b62cdb4b5954f083c145d2bcbae3aeeb2387cd31065e551b67bc74d

PS> node tools\make-hit-image.mjs
make-hit-image: decoded-source 720x720 bitDepth=8 colorType=6 alpha=150 bytes=768119 sha256=bb5082005b62cdb4b5954f083c145d2bcbae3aeeb2387cd31065e551b67bc74d

PS> Get-FileHash static\image\ClickAfter.png -Algorithm SHA256
BB5082005B62CDB4B5954F083C145D2BCBAE3AEEB2387CD31065E551B67BC74D
```

Identical hash and byte count on every run — no timestamps, no randomness, fixed
zlib parameters and fixed PNG filter. Re-running is a no-op on content.

### Fallback behaviour

If the JPEG decode ever fails, the script logs a note to stderr and emits a flat
720x720 coral RGBA tile instead, so a valid PNG always lands. `--solid` forces that
path. This fallback was exercised and worked, but **is not** what shipped: the current
`ClickAfter.png` is the real decoded-source version (`mode=decoded-source`).

---

## 7. JPEG decoder correctness

`tools/jpeg-decode.mjs` is a self-contained baseline JPEG decoder (SOF0/SOF1, DHT,
DQT 8- and 16-bit, DRI restart markers, 4:4:4 / 4:2:2 / 4:2:0 via libjpeg-style
fancy upsampling, YCbCr and greyscale). It is on the delivery path: it is what
produces the hit-state art.

Verified against **Pillow 12.3.0** as an independent ground-truth decoder, comparing
raw RGB over the whole 720x720 image:

```text
pillow: (720, 720, 3) 1555200 bytes
node:   720x720 -> ours.rgb (1555200 bytes)
mean abs diff: 0.0252 | max: 3 | exact: 97.83 % | within +/-2: 100.0 %
```

- 100% of channel samples are within **±2** of Pillow.
- Mean absolute difference **0.0252 / 255**; max 3 (rounding only).

Bit-reader un-stuffing and multi-bit read test:

```text
PS> node tools\_bit-stuffing-test.mjs
expect: 101010111111111111001101111111111111111100010010
got   : 101010111111111111001101111111111111111100010010
PASS un-stuffing
PASS multi-bit reads
```

Also exercised against Pillow-generated 4:4:4 (subsampling=0), 4:2:2 (1) and 4:2:0 (2)
test files, plus a 720x720 re-encode of the source — all decode correctly.

### Bugs found and fixed during development

These are recorded because each was caught by validation rather than by inspection:

1. **Entropy stream started 6 bytes early.** The SOS header offset was computed as
   `sos + 8` instead of `sos + 2 + segmentLength`, so decoding began inside the SOS
   header. This was the bug that made the user's file fail while simpler files passed.
2. **Missing JPEG level shift.** IDCT output was stored raw instead of `+128`, which
   clamped R and B to 0 and produced Y-only grey output.
3. **32-bit bit-accumulator overflow.** `bitBuf << 8` silently discarded the oldest
   byte once the accumulator held more than 24 bits, corrupting the stream. Fill is now
   capped at 24 bits.
4. **Huffman canonical-code table construction** was rebuilt per T.81 Annex C.
5. **AC run-length overrun** (`k > 63`) now ends the block like libjpeg instead of
   throwing, so slightly-overrunning blocks decode rather than aborting the file.

---

## 8. Scope compliance

Written by T1 (this task): `static/image/**`, `static/music/**`, `tools/**` (T1-specific files).

Not touched: `index.html`, `static/index.css`, `static/index.js`, `static/game.js`,
`static/audio.js`, `static/i18n/**`, `tests/**`, `README.md`, `CONTRACT.md`.
`tools/bake-i18n.mjs` belongs to T2 and was left alone.

`node --check` passes on all T1 `.mjs` files:

```text
jpeg-decode.mjs : exit=0
make-hit-image.mjs : exit=0
_validate-decode.mjs : exit=0
_bit-stuffing-test.mjs : exit=0
```

---

## 9. Deviations from the original task text

1. **`ClickAfter.png` is a dimmed/desaturated copy, not a posterised flat-colour
   variant.** The original T1 spec asked for HSV saturation >= 0.85, hue quantised to
   12 buckets and value posterised to 4 levels. The Lead changed this mid-task to a
   "spent/faded" treatment: RGB kept, alpha 150, plus desaturation/dim/coral tint. The
   shipped file follows the Lead's revised design. The posterise approach was **not**
   implemented.

2. **A `tools/jpeg-decode.mjs` helper module was added**, beyond the exact file list in
   the task text (which named only `make-hit-image.mjs`). It is required by
   `make-hit-image.mjs` and lives inside the T1 write scope.

3. **The source is 4:4:4, not 4:2:0.** The task text anticipated a 4:2:0 file, but
   `ClickBefore.png` is SOF0 with all three components at h=1,v=1. The decoder handles
   both; no subsampling is actually exercised by this file.

4. **`ClickBefore.png` was deliberately left as raw JPEG bytes with a `.png`
   extension**, per explicit Lead instruction, even though a `.png` file containing
   JPEG data will fail strict image-type checks. It is 92149 bytes and renders in
   browsers. Documented by the Lead in the final report rather than transcoded here.

---

## 10. Not verified by T1

- **Actual rendering in a real browser.** Headless Chrome could not be launched in this
  sandbox (`browserType.launch: spawn EPERM` on piped stdio), so the tile art was not
  displayed in a live page. Correctness was established via Pillow cross-validation of
  the pixels instead, which is a stronger check of the image content but does not prove
  CSS layout.
- **`ClickAfter.png` at `background-size: auto 86%`** — the CONTRACT.md section 4 CSS
  expectations are T3's concern; T1 only guarantees the file's pixels, dimensions,
  format and alpha.
