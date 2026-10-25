/**
 * jpeg-decode.mjs — minimal baseline JPEG decoder, ZERO dependencies.
 *
 * Scope: the subset of ITU-T T.81 needed for the Kano Beat source art
 * (ClickBefore.png, really a baseline JFIF 8-bit JPEG).
 *
 * Supports:
 *   - SOF0 (baseline DCT, Huffman) and SOF1 (extended sequential, 8-bit precision)
 *   - any component sampling factor (4:4:4, 4:2:2, 4:2:0, 4:1:1 ...) via
 *     separable "fancy" upsampling with clamped triangular weights
 *   - DHT (multiple tables, redefinable), DQT 8-bit and 16-bit
 *   - DRI + RSTn restart markers
 *   - JPEG colour transform: 3-component YCbCr and 1-component greyscale
 *
 * Does NOT support: progressive (SOF2), arithmetic coding, 12-bit precision,
 * CMYK/YCCK 4-component files. Those throw a descriptive error.
 *
 * The decoder is deliberately allocation-light and deterministic: no Date,
 * no Math.random, no floating point in the sample path.
 */

/* ------------------------------------------------------------------ */
/* Bit reader over the entropy-coded segment                           */
/* ------------------------------------------------------------------ */

class BitReader {
  constructor(data, pos) {
    this.data = data;
    this.pos = pos;
    this.bitBuf = 0;
    this.bitCnt = 0;
    this.markerHit = 0; // 0 none, else the marker byte found
  }

  /**
   * Top up the accumulator so at least 16 bits are available.
   *
   * `bitBuf` is a 32-bit int: `bitBuf << 8` silently drops the oldest byte, so
   * the accumulator must never hold more than 24 bits of history. Filling while
   * `bitCnt <= 16` yields at most 16 + 8 = 24 bits, and since `getBits` is only
   * ever called with n <= 16, every requested bit is present and none is lost.
   */
  fill() {
    while (this.bitCnt <= 16) {
      let b;
      if (this.markerHit !== 0) {
        b = 0xff; // pad with 1-bits so a trailing Huffman code stays decodable
      } else if (this.pos >= this.data.length) {
        b = 0xff;
        this.markerHit = 0xd9;
      } else {
        b = this.data[this.pos];
        if (b === 0xff) {
          // A 0xFF in entropy data is either a stuffed 0xFF00 pair or a marker.
          // q scans the run of 0xFF bytes to find the deciding byte.
          let q = this.pos + 1;
          while (q < this.data.length && this.data[q] === 0xff) q++;
          const next = q < this.data.length ? this.data[q] : 0x00;
          if (next === 0x00) {
            this.pos = q + 1; // consume 0xFF 00 .. 00 and emit one 0xFF
          } else {
            // A real marker: stop here and pad, without consuming the marker.
            this.markerHit = next;
            b = 0xff;
          }
        } else {
          this.pos++;
        }
      }
      this.bitBuf = ((this.bitBuf << 8) | b) >>> 0;
      this.bitCnt += 8;
      if (this.bitCnt > 24) {
        // Invariant guard: more than 24 bits of history risks silent truncation.
        throw new Error('JPEG: bit accumulator overflow');
      }
    }
  }

  getBits(n) {
    if (n === 0) return 0;
    if (this.bitCnt < n) this.fill();
    this.bitCnt -= n;
    return (this.bitBuf >>> this.bitCnt) & ((1 << n) - 1);
  }

  /** Advance to the next RSTn marker. Returns the marker byte, or 0 if absent. */
  resync() {
    this.bitBuf = 0;
    this.bitCnt = 0;
    this.markerHit = 0;
    while (this.pos < this.data.length) {
      const b = this.data[this.pos];
      if (b === 0xff) {
        const n = this.pos + 1 < this.data.length ? this.data[this.pos + 1] : 0xff;
        if (n !== 0x00 && n !== 0xff) {
          this.pos += 2;
          return n;
        }
      }
      this.pos++;
    }
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Huffman table                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the canonical JPEG Huffman decoding tables (T.81 Annex C).
 *
 * codes[len] and firstCode[len] give, for each code length, the smallest code of
 * that length and the index into `vals` where its values begin. A length with no
 * codes gets firstCode[len] = -1 so the decoder skips straight past it.
 */
function buildHuffTable(bits, vals) {
  const minCode = new Int32Array(17).fill(-1);
  const maxCode = new Int32Array(17).fill(-1);
  const valPtr = new Int32Array(17).fill(0);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    const n = bits[len - 1] || 0;
    valPtr[len] = k;
    if (n > 0) {
      minCode[len] = code;
      maxCode[len] = code + n - 1;
      k += n;
    }
    code = (code + n) << 1;
  }
  if (k !== vals.length) {
    throw new Error(`JPEG: Huffman table length mismatch (codes=${k}, values=${vals.length})`);
  }
  return { bits, vals, minCode, maxCode, valPtr };
}

function decodeHuff(br, tbl) {
  let code = br.getBits(1);
  for (let len = 1; len <= 16; len++) {
    if (tbl.maxCode[len] >= 0 && code <= tbl.maxCode[len]) {
      const idx = tbl.valPtr[len] + (code - tbl.minCode[len]);
      if (idx < 0 || idx >= tbl.vals.length) {
        throw new Error('JPEG: Huffman value out of range');
      }
      return tbl.vals[idx];
    }
    code = (code << 1) | br.getBits(1);
  }
  throw new Error('JPEG: invalid Huffman code (ran past 16 bits)');
}

/** Extend a magnitude-coded value per T.81 F.2.2.1 (EXTEND). */
function extend(v, t) {
  return t === 0 ? 0 : v < 1 << (t - 1) ? v + (-1 << t) + 1 : v;
}

/* ------------------------------------------------------------------ */
/* Zig-zag + dequantisation + IDCT                                     */
/* ------------------------------------------------------------------ */

const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

// Precomputed cosine table: cosT[u][x] = cos((2x+1) * u * PI / 16)
const COS_T = new Float64Array(64);
for (let u = 0; u < 8; u++) {
  for (let x = 0; x < 8; x++) {
    COS_T[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

/**
 * Separable float IDCT: rows then columns. Results are rounded to integers by
 * the caller. Correctness over speed - 720x720 is a one-off build step.
 */
const IDCT_TMP = new Float64Array(64);

function idct8x8(blk, out) {
  // rows
  for (let y = 0; y < 8; y++) {
    const r = y * 8;
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        const cu = u === 0 ? Math.SQRT1_2 : 1;
        sum += cu * blk[r + u] * COS_T[u * 8 + x];
      }
      IDCT_TMP[r + x] = 0.5 * sum;
    }
  }
  // columns
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) {
        const cv = v === 0 ? Math.SQRT1_2 : 1;
        sum += cv * IDCT_TMP[v * 8 + x] * COS_T[v * 8 + y];
      }
      out[y * 8 + x] = 0.5 * sum;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Component planes                                                    */
/* ------------------------------------------------------------------ */

class Component {
  constructor(spec) {
    this.id = spec.id;
    this.h = spec.h;
    this.v = spec.v;
    this.tq = spec.tq;
    this.dcTable = null;
    this.acTable = null;
    this.blocksPerLine = 0;
    this.blocksPerCol = 0;
    this.blocksPerLineAlloc = 0;
    this.blocks = null; // Int16Array, blocksPerLineAlloc * blocksPerCol * 64
    this.quant = null; // Int32Array(64) in natural (de-zigzagged) order
    this.dcPred = 0;
    this.huffTableId = -1; // which table index was used last, to reset predictors
  }

  /** Pointer to the start of block (bx, by), as a typed-array offset. */
  blockOffset(bx, by) {
    return (by * this.blocksPerLineAlloc + bx) * 64;
  }
}

/* ------------------------------------------------------------------ */
/* Marker parse + decode                                               */
/* ------------------------------------------------------------------ */

function parseSegments(buf) {
  const segs = { dqt: [], dht: [], sof: null, dri: 0, sos: -1, app: [], com: null };
  let i = 2; // skip SOI
  const n = buf.length;
  while (i < n - 1) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m === 0xff || m === 0x00) {
      i++;
      continue;
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    if (m === 0xd9) break;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const start = i + 4;
    if (m === 0xdb) {
      let p = start;
      const end = i + 2 + len;
      while (p < end) {
        const pq = buf[p] >> 4;
        const tq = buf[p] & 15;
        p++;
        const tbl = new Int32Array(64);
        for (let k = 0; k < 64; k++) {
          if (pq === 0) {
            tbl[ZIGZAG[k]] = buf[p++];
          } else {
            tbl[ZIGZAG[k]] = (buf[p] << 8) | buf[p + 1];
            p += 2;
          }
        }
        segs.dqt[tq] = tbl;
      }
    } else if (m === 0xc4) {
      let p = start;
      const end = i + 2 + len;
      while (p < end) {
        const tc = buf[p] >> 4;
        const th = buf[p] & 15;
        p++;
        const bits = new Array(16);
        let total = 0;
        for (let k = 0; k < 16; k++) {
          bits[k] = buf[p + k];
          total += bits[k];
        }
        p += 16;
        const vals = buf.subarray(p, p + total);
        p += total;
        const tbl = buildHuffTable(bits, vals);
        if (tc === 0) segs.dht[th] = tbl;
        else segs.dht[th + 4] = tbl; // AC tables live at index 4..7
      }
    } else if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const prec = buf[start];
      const height = (buf[start + 1] << 8) | buf[start + 2];
      const width = (buf[start + 3] << 8) | buf[start + 4];
      const ncomp = buf[start + 5];
      const comps = [];
      for (let c = 0; c < ncomp; c++) {
        const o = start + 6 + c * 3;
        comps.push({
          id: buf[o],
          h: buf[o + 1] >> 4,
          v: buf[o + 1] & 15,
          tq: buf[o + 2],
        });
      }
      segs.sof = { marker: m, progressive: m === 0xc2, prec, width, height, comps };
    } else if (m === 0xdd) {
      segs.dri = (buf[start] << 8) | buf[start + 1];
    } else if (m === 0xda) {
      segs.sos = i;
      break;
    } else if (m >= 0xe0 && m <= 0xef) {
      segs.app.push({ marker: m, data: buf.subarray(start, i + 2 + len) });
    } else if (m === 0xfe) {
      segs.com = buf.subarray(start, i + 2 + len);
    }
    i += 2 + len;
  }
  return segs;
}

/**
 * Decode a baseline JPEG buffer into { width, height, data: Uint8ClampedArray RGBA }.
 */
export function decodeJPEG(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('JPEG: missing SOI marker (not a JPEG)');
  }
  const segs = parseSegments(buf);
  const sof = segs.sof;
  if (!sof) throw new Error('JPEG: no SOF marker found');
  if (sof.progressive) throw new Error('JPEG: progressive (SOF2) is not supported by this decoder');
  if (sof.prec !== 8) throw new Error(`JPEG: only 8-bit precision supported (got ${sof.prec})`);
  if (sof.comps.length !== 1 && sof.comps.length !== 3) {
    throw new Error(`JPEG: only 1- and 3-component images supported (got ${sof.comps.length})`);
  }
  if (segs.sos < 0) throw new Error('JPEG: no SOS marker found');

  const width = sof.width;
  const height = sof.height;
  const hMax = Math.max(...sof.comps.map((c) => c.h));
  const vMax = Math.max(...sof.comps.map((c) => c.v));
  const mcuW = hMax * 8;
  const mcuH = vMax * 8;
  const mcusX = Math.ceil(width / mcuW);
  const mcusY = Math.ceil(height / mcuH);

  const comps = sof.comps.map((c) => {
    const comp = new Component(c);
    comp.huffTableId = -1;
    comp.quant = segs.dqt[c.tq];
    if (!comp.quant) throw new Error(`JPEG: component ${c.id} references missing DQT ${c.tq}`);
    comp.blocksPerLine = Math.ceil((width * c.h) / hMax / 8);
    comp.blocksPerCol = Math.ceil((height * c.v) / vMax / 8);
    // Allocate whole MCUs: edge blocks past the image edge are decoded but unused.
    comp.blocksPerLineAlloc = mcusX * c.h;
    const allocBlocks = comp.blocksPerLineAlloc * mcusY * c.v;
    comp.blocks = new Int16Array(allocBlocks * 64);
    return comp;
  });

  // --- scan header
  const s = segs.sos;
  const ns = buf[s + 4];
  const scanComps = [];
  for (let k = 0; k < ns; k++) {
    const cs = buf[s + 5 + k * 2];
    const td = buf[s + 6 + k * 2] >> 4;
    const ta = buf[s + 6 + k * 2] & 15;
    const comp = comps.find((c) => c.id === cs);
    if (!comp) throw new Error(`JPEG: scan references unknown component ${cs}`);
    // DC tables are Huffman table 0..3, AC tables 4..7 (indexed by class<<4 | id).
    comp.dcTable = segs.dht[td];
    comp.acTable = segs.dht[ta + 4];
    if (!comp.dcTable) throw new Error(`JPEG: missing DC Huffman table ${td}`);
    if (!comp.acTable) throw new Error(`JPEG: missing AC Huffman table ${ta}`);
    if (process.env.KANO_JPEG_DEBUG) {
      process.stderr.write(
        `scan comp id=${cs} dcTbl=${td}(n=${comp.dcTable.vals.length}) ` +
          `acTbl=${ta}(n=${comp.acTable.vals.length}) quant0=${comp.quant[0]}\n`
      );
    }
    scanComps.push(comp);
  }
  const ss = buf[s + 5 + ns * 2];
  const se = buf[s + 6 + ns * 2];
  const ah = buf[s + 7 + ns * 2] >> 4;
  const al = buf[s + 7 + ns * 2] & 15;
  if (ss !== 0 || se !== 63 || ah !== 0) {
    throw new Error(`JPEG: not a baseline single-scan file (Ss=${ss} Se=${se} Ah=${ah})`);
  }

  const scanEnd = buf.length;
  // Entropy-coded data begins after the SOS header: marker (2) + length field,
  // where the length field already counts its own two bytes.
  const sosLen = (buf[s + 2] << 8) | buf[s + 3];
  const br = new BitReader(buf, s + 2 + sosLen);

  // --- decode MCUs
  const block = new Float64Array(64); // dequantised coefficients, natural order
  const spatial = new Float64Array(64); // IDCT output
  const restartInterval = segs.dri;
  let mcuCount = 0;

  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restartInterval > 0 && mcuCount > 0 && mcuCount % restartInterval === 0) {
        br.resync();
        for (const c of comps) c.dcPred = 0;
      }
      mcuCount++;
      for (const comp of scanComps) {
        for (let by = 0; by < comp.v; by++) {
          for (let bx = 0; bx < comp.h; bx++) {
            const blkX = mx * comp.h + bx;
            const blkY = my * comp.v + by;
            if (process.env.KANO_JPEG_DEBUG) {
              process.stderr.write(
                `mcu=(${mx},${my}) comp=${comp.id} blk=(${blkX},${blkY}) bitpos=${br.pos}\n`
              );
            }
            // DC
            block.fill(0);
            const t = decodeHuff(br, comp.dcTable);
            let diff = 0;
            if (t > 0) diff = extend(br.getBits(t), t);
            comp.dcPred += diff;
            // DC coefficient (differential), dequantised into block[0].
            block[0] = comp.dcPred * comp.quant[0];
            // AC coefficients, run-length decoded in zig-zag order.
            let k = 1;
            while (k < 64) {
              const rs = decodeHuff(br, comp.acTable);
              const r = rs >> 4;
              const sz = rs & 15;
              if (sz === 0) {
                if (r === 15) {
                  k += 16; // ZRL: skip 16 zero coefficients
                  continue;
                }
                break; // EOB: remaining coefficients are zero
              }
              k += r;
              if (k > 63) {
                // The run length overruns the block. libjpeg treats this as the
                // end of the block's coefficients rather than a fatal error, and
                // so do we: the remaining coefficients stay zero.
                break;
              }
              const v = extend(br.getBits(sz), sz);
              const zz = ZIGZAG[k];
              block[zz] = v * comp.quant[zz];
              k++;
            }
            idct8x8(block, spatial);
            if (blkX < comp.blocksPerLineAlloc && blkY < comp.blocksPerCol) {
              const off = comp.blockOffset(blkX, blkY);
              for (let i = 0; i < 64; i++) {
                // JPEG level shift: the DCT operates on samples centred at 0, so
                // add 128 back to recover an 8-bit-range component sample.
                const v = Math.round(spatial[i]) + 128;
                comp.blocks[off + i] = v < 0 ? 0 : v > 255 ? 255 : v;
              }
            }
          }
        }
      }
    }
  }

  // --- colour convert with upsampling
  const rgba = new Uint8ClampedArray(width * height * 4);
  const maxH = hMax;
  const maxV = vMax;

  /**
   * Sample component `ci` at full-resolution coordinates (x, y).
   *
   * For subsampled components we use libjpeg's "fancy" (triangular) upsampling:
   * the target pixel maps to a source position, and the two neighbouring source
   * samples are blended. For the common 2x case this yields exactly the 3/4 + 1/4
   * weights libjpeg uses. Source coordinates are clamped to the plane edges.
   */
  function sampleAt(ci, x, y) {
    const c = comps[ci];
    const hRatio = maxH / c.h;
    const vRatio = maxV / c.v;
    const maxBx = c.blocksPerLineAlloc - 1;
    const maxBy = c.blocksPerCol - 1;
    /** Clamped sample fetch at plane pixel coordinates (sx, sy). */
    const g = (sx, sy) => {
      const cx = sx < 0 ? 0 : sx > maxBx * 8 + 7 ? maxBx : sx >> 3;
      const cy = sy < 0 ? 0 : sy > maxBy * 8 + 7 ? maxBy : sy >> 3;
      return c.blocks[c.blockOffset(cx, cy) + ((sy & 7) << 3) + (sx & 7)];
    };

    if (hRatio === 1 && vRatio === 1) return g(x, y);

    const srcX = hRatio === 1 ? x : (x + 0.5) / hRatio - 0.5;
    const srcY = vRatio === 1 ? y : (y + 0.5) / vRatio - 0.5;
    const x0 = Math.floor(srcX);
    const y0 = Math.floor(srcY);
    const wx = hRatio === 1 ? 0 : srcX - x0;
    const wy = vRatio === 1 ? 0 : srcY - y0;

    if (hRatio === 1) return Math.round(g(x0, y0) * (1 - wy) + g(x0, y0 + 1) * wy);
    if (vRatio === 1) return Math.round(g(x0, y0) * (1 - wx) + g(x0 + 1, y0) * wx);
    const top = g(x0, y0) * (1 - wx) + g(x0 + 1, y0) * wx;
    const bot = g(x0, y0 + 1) * (1 - wx) + g(x0 + 1, y0 + 1) * wx;
    return Math.round(top * (1 - wy) + bot * wy);
  }

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  if (process.env.KANO_JPEG_DEBUG) {
    for (let ci = 0; ci < comps.length; ci++) {
      const c = comps[ci];
      let mn = Infinity;
      let mx = -Infinity;
      let sum = 0;
      const nSamp = Math.min(c.blocks.length, c.blockOffset(c.blocksPerLineAlloc, 0));
      for (let i = 0; i < nSamp; i++) {
        const v = c.blocks[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        sum += v;
      }
      process.stderr.write(
        `plane comp=${c.id} h=${c.h} v=${c.v} bpl=${c.blocksPerLine} bplAlloc=${c.blocksPerLineAlloc} ` +
          `bpc=${c.blocksPerCol} samples=${nSamp} min=${mn} max=${mx} mean=${(sum / nSamp).toFixed(2)}\n`
      );
    }
  }

  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 4;
    if (comps.length === 1) {
      for (let x = 0; x < width; x++) {
        const v = clamp255(sampleAt(0, x, y));
        const o = rowOff + x * 4;
        rgba[o] = v;
        rgba[o + 1] = v;
        rgba[o + 2] = v;
        rgba[o + 3] = 255;
      }
      continue;
    }
    for (let x = 0; x < width; x++) {
      const Y = sampleAt(0, x, y);
      const Cb = sampleAt(1, x, y) - 128;
      const Cr = sampleAt(2, x, y) - 128;
      const o = rowOff + x * 4;
      rgba[o] = clamp255(Math.round(Y + 1.402 * Cr));
      rgba[o + 1] = clamp255(Math.round(Y - 0.344136 * Cb - 0.714136 * Cr));
      rgba[o + 2] = clamp255(Math.round(Y + 1.772 * Cb));
      rgba[o + 3] = 255;
    }
  }
  void scanEnd;

  return { width, height, data: rgba };
}

export default decodeJPEG;
