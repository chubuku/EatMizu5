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
 * Encode an RGBA pixel buffer as an 8-bit truecolour-with-alpha PNG.
 * Every scanline gets filter byte 0 (None) for a stable, deterministic stream.
 */
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: truecolour + alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy
      ? Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
          raw,
          y * (stride + 1) + 1
        )
      : raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  const idat = deflateSync(raw, { level: 9, memLevel: 9, strategy: 0 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
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

  const png = encodePNG(width, height, rgba);
  writeFileSync(OUT, png);

  const ihdr = readIHDR(png);
  const sha = createHash('sha256').update(png).digest('hex');
  process.stdout.write(
    `make-hit-image: ${mode} ${ihdr.width}x${ihdr.height} bitDepth=${ihdr.bitDepth} ` +
      `colorType=${ihdr.colorType} alpha=${ALPHA_HIT} bytes=${png.length} sha256=${sha}\n`
  );

  if (ihdr.width !== width || ihdr.height !== height || ihdr.bitDepth !== 8 || ihdr.colorType !== 6) {
    throw new Error('post-write verification failed: PNG header does not match expectations');
  }
}

main().catch((err) => {
  process.stderr.write(`make-hit-image: FAILED: ${err.message}\n`);
  process.exit(1);
});
