/**
 * make-hit-image.mjs — generates static/image/ClickAfter.png (the "hit" tile art).
 *
 * Zero dependencies. Uses only Node built-ins (`node:fs`, `node:path`, `node:zlib`).
 *
 * WHAT IT PRODUCES
 *   A 720x720 8-bit RGBA PNG: the user's source artwork (ClickBefore.png, really a
 *   baseline JPEG) with a warm crimson "spent/faded" treatment applied — the hit
 *   state reads as a dimmed, desaturated version of the vivid un-hit tile.
 *
 *   The RGB treatment is: desaturate toward luminance, then multiply by the dim
 *   factor, then blend a coral tint in. Alpha is set to ALPHA_HIT so the CSS behind
 *   the tile shows through. If the JPEG decode is unavailable for any reason the
 *   script falls back to a flat coral tile of the same dimensions, so a valid PNG
 *   is always produced.
 *
 * DETERMINISM
 *   No timestamps, no randomness, fixed zlib level/strategy/memLevel, and a fixed
 *   PNG filter type (0 = None) on every scanline. Running it twice produces
 *   byte-identical output.
 *
 * USAGE
 *   node tools/make-hit-image.mjs
 *   node tools/make-hit-image.mjs --solid     # force the flat-colour fallback
 *   node tools/make-hit-image.mjs --check     # verify existing output is current
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'static', 'image', 'ClickBefore.png');
const OUT = join(ROOT, 'static', 'image', 'ClickAfter.png');

/* ------------------------------------------------------------------ */
/* Tunables — the whole look of the hit state lives here.              */
/* ------------------------------------------------------------------ */

const ALPHA_HIT = 150;      // 0..255 — on-hit opacity (~59%)
const DESATURATE = 0.55;    // 0 = untouched, 1 = fully grey
const DIM = 0.62;           // value multiplier, darkens the tile
const TINT = [255, 122, 107]; // warm coral, matches --kb-accent
const TINT_MIX = 0.30;      // how much coral is blended back in
const FORCE_SOLID = process.argv.includes('--solid');

/**
 * Largest edge length the generated art is allowed to ship at.
 *
 * A tile is at most 160 CSS px (640px board / 4 lanes), and 480 device px on a
 * 3x display, so 512 is the smallest power-of-two-ish size that still covers
 * every real case. The 720x720 original produced a 768 KB PNG whose download
 * dominated the whole page on a slow connection.
 */
const MAX_DIM = 512;

/* ------------------------------------------------------------------ */
/* PNG encoder                                                         */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: length, type, data, CRC over (type + data). */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode a pixel buffer as an 8-bit PNG.
 *
 * Two deliberate choices keep the file small, because this image previously
 * dominated the whole page load on a slow connection:
 *
 *  1. FILTERING. The original encoder wrote filter byte 0 (None) on every
 *     scanline, so deflate had to compress 1 MB of unfiltered pixels from
 *     scratch and managed only ~5:1. We use the minimum-sum-of-absolute-
 *     differences heuristic from the PNG spec: try all five filters per
 *     scanline and keep whichever produces the smallest byte sum. On a
 *     box-filtered photograph that typically halves the file.
 *
 *  2. COLOUR TYPE. If every pixel shares one alpha value the alpha channel is
 *     pure waste -- 25% of the raw stream. We detect that and emit colour
 *     type 2 (truecolour) plus a tRNS chunk carrying the single alpha, instead
 *     of type 6 (truecolour+alpha). Browsers honour tRNS identically for
 *     rendering. This asset is a flat-alpha overlay, so it always takes this
 *     path; a future image with real transparency still encodes correctly.
 *
 * Output is deterministic: the filter choice depends only on pixel values, and
 * zlib is called with fixed settings.
 */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // --- is the alpha channel constant? -----------------------------------
  let alpha0 = rgba[3];
  let alphaConstant = true;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== alpha0) { alphaConstant = false; break; }
  }
  if (!alphaConstant) alpha0 = 0; // unused

  const bpp = alphaConstant ? 3 : 4;        // bytes per pixel actually stored
  const colorType = alphaConstant ? 2 : 6;  // 2 = truecolour, 6 = truecolour+alpha

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;             // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0;            // compression: deflate
  ihdr[11] = 0;            // filter method: adaptive
  ihdr[12] = 0;            // interlace: none

  // --- flatten to the stored pixel width --------------------------------
  const stride = width * bpp;
  const srcStride = width * 4;
  const flat = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    let s = y * srcStride;
    let o = y * stride;
    for (let x = 0; x < width; x++) {
      flat[o] = rgba[s];
      flat[o + 1] = rgba[s + 1];
      flat[o + 2] = rgba[s + 2];
      if (!alphaConstant) flat[o + 3] = rgba[s + 3];
      s += 4;
      o += bpp;
    }
  }

  // --- adaptive filtering ------------------------------------------------
  const raw = Buffer.alloc((stride + 1) * height);
  const prior = Buffer.alloc(stride);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride),
                Buffer.alloc(stride), Buffer.alloc(stride)];

  for (let y = 0; y < height; y++) {
    const line = flat.subarray(y * stride, y * stride + stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;      // left
      const b = prior[x];                           // up
      const c = x >= bpp ? prior[x - bpp] : 0;      // up-left
      const v = line[x];

      cand[0][x] = v;
      cand[1][x] = (v - a) & 0xff;
      cand[2][x] = (v - b) & 0xff;
      cand[3][x] = (v - ((a + b) >> 1)) & 0xff;

      // Paeth predictor, straight from the PNG spec.
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      cand[4][x] = (v - pred) & 0xff;
    }

    // Minimum sum of absolute differences (treating bytes as signed).
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      const buf = cand[f];
      for (let x = 0; x < stride; x++) {
        const s = buf[x];
        sum += s < 128 ? s : 256 - s;
      }
      if (sum < bestScore) { bestScore = sum; best = f; }
    }

    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
    line.copy(prior);
  }

  const idat = deflateSync(raw, { level: 9, memLevel: 9, strategy: 0 });

  const parts = [sig, chunk('IHDR', ihdr)];
  if (alphaConstant) {
    // tRNS for colour type 2 holds one 16-bit grey/alpha sample.
    const trns = Buffer.alloc(2);
    trns.writeUInt16BE(alpha0, 0);
    parts.push(chunk('tRNS', trns));
  }
  parts.push(chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Parse a PNG's IHDR back out, for the verification step. */
export function readIHDR(buf) {
  const sigOk =
    buf.length > 33 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  if (!sigOk) throw new Error('not a PNG: bad signature');
  const type = buf.subarray(12, 16).toString('latin1');
  if (type !== 'IHDR') throw new Error(`first chunk is ${type}, expected IHDR`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    compression: buf[26],
    filter: buf[27],
    interlace: buf[28],
  };
}

/* ------------------------------------------------------------------ */
/* Hit-state colour treatment                                          */
/* ------------------------------------------------------------------ */

/**
 * Turn one source RGB pixel into the faded hit-state RGBA pixel.
 * Rec. 601 luma, desaturate toward grey, dim, then blend coral back in.
 */
function hitPixel(r, g, b, out, o) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  let nr = r + (y - r) * DESATURATE;
  let ng = g + (y - g) * DESATURATE;
  let nb = b + (y - b) * DESATURATE;
  nr *= DIM;
  ng *= DIM;
  nb *= DIM;
  nr += (TINT[0] - nr) * TINT_MIX;
  ng += (TINT[1] - ng) * TINT_MIX;
  nb += (TINT[2] - nb) * TINT_MIX;
  out[o] = nr < 0 ? 0 : nr > 255 ? 255 : Math.round(nr);
  out[o + 1] = ng < 0 ? 0 : ng > 255 ? 255 : Math.round(ng);
  out[o + 2] = nb < 0 ? 0 : nb > 255 ? 255 : Math.round(nb);
  out[o + 3] = ALPHA_HIT;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function buildSolid(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = TINT[0];
    rgba[i * 4 + 1] = TINT[1];
    rgba[i * 4 + 2] = TINT[2];
    rgba[i * 4 + 3] = ALPHA_HIT;
  }
  return rgba;
}

/**
 * Downscale RGBA with a box filter.
 *
 * WHY THIS IS NEEDED
 *   The source artwork is 720x720, but a tile is at most 160 CSS px (the board
 *   is capped at 640px and has four lanes) -- and only ~480 device px even on a
 *   3x display. Shipping the hit state at 720x720 RGBA made it 768 KB, eight
 *   times larger than the un-hit artwork and by far the biggest asset in the
 *   project. On a throttled connection it took over 30 seconds to download,
 *   which is what made the board visibly fill in late during play.
 *
 *   A box filter (average every source pixel that maps into a destination pixel)
 *   is exactly right for integer downscales: no ringing, no kernel to tune, and
 *   deterministic.
 */
function downscaleBox(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yRatio);
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.ceil((dy + 1) * yRatio)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xRatio);
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.ceil((dx + 1) * xRatio)));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let idx = (sy * sw + x0) * 4;
        for (let sx = x0; sx < x1; sx++) {
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
          n++;
          idx += 4;
        }
      }
      const o = (dy * dw + dx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

async function main() {
  let width = 720;
  let height = 720;
  let rgba;
  let mode = 'solid-fallback';

  if (!FORCE_SOLID && existsSync(SRC)) {
    try {
      const { decodeJPEG } = await import('./jpeg-decode.mjs');
      const src = decodeJPEG(readFileSync(SRC));
      width = src.width;
      height = src.height;
      rgba = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        hitPixel(src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2], rgba, i * 4);
      }
      mode = 'decoded-source';
    } catch (err) {
      process.stderr.write(`note: JPEG decode unavailable (${err.message}); using solid fallback\n`);
      rgba = buildSolid(width, height);
    }
  } else {
    rgba = buildSolid(width, height);
  }

  // Shrink to the largest size the art can actually be displayed at, so the
  // payload is proportional to what is on screen. 512 comfortably covers a
  // 160-CSS-px tile at 3x DPR (480 device px) without shipping discarded detail.
  // Applies to the solid fallback too -- the fallback must also stay small.
  if (width > MAX_DIM || height > MAX_DIM) {
    const dw = Math.min(width, MAX_DIM);
    const dh = Math.min(height, MAX_DIM);
    process.stdout.write(`make-hit-image: downscaling ${width}x${height} -> ${dw}x${dh} (box filter)\n`);
    rgba = downscaleBox(rgba, width, height, dw, dh);
    width = dw;
    height = dh;
  }

  const png = encodePNG(width, height, rgba);
  writeFileSync(OUT, png);

  const ihdr = readIHDR(png);
  const sha = createHash('sha256').update(png).digest('hex');
  process.stdout.write(
    `make-hit-image: ${mode} ${ihdr.width}x${ihdr.height} bitDepth=${ihdr.bitDepth} ` +
      `colorType=${ihdr.colorType} alpha=${ALPHA_HIT} bytes=${png.length} sha256=${sha}\n`
  );

  // Colour type 6 (truecolour+alpha) is used when the alpha channel genuinely
  // varies; type 2 (truecolour) plus a tRNS chunk when it is a single flat
  // value, which is the normal case for this asset and roughly a third smaller.
  // Both render identically in every browser.
  const legalColorType = ihdr.colorType === 6 || ihdr.colorType === 2;
  if (ihdr.width !== width || ihdr.height !== height || ihdr.bitDepth !== 8 || !legalColorType) {
    throw new Error(
      `post-write verification failed: expected ${width}x${height} bitDepth=8 ` +
      `colorType=2|6, got ${ihdr.width}x${ihdr.height} bitDepth=${ihdr.bitDepth} colorType=${ihdr.colorType}`
    );
  }
}

main().catch((err) => {
  process.stderr.write(`make-hit-image: FAILED: ${err.message}\n`);
  process.exit(1);
});
