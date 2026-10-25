// _validate-decode.mjs — compares our pure-Node JPEG decode against Pillow's.
// Writes a raw RGB dump from each so they can be diffed byte-by-byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeJPEG } from './jpeg-decode.mjs';

const src = process.argv[2];
const out = process.argv[3];
const buf = readFileSync(src);
const img = decodeJPEG(buf);
const rgb = Buffer.allocUnsafe(img.width * img.height * 3);
for (let i = 0, j = 0; i < img.width * img.height; i++, j += 3) {
  rgb[j] = img.data[i * 4];
  rgb[j + 1] = img.data[i * 4 + 1];
  rgb[j + 2] = img.data[i * 4 + 2];
}
writeFileSync(out, rgb);
console.log(`node: ${img.width}x${img.height} -> ${out} (${rgb.length} bytes)`);
