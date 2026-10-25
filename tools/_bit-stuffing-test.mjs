// _bit-stuffing-test.mjs — BitReader must un-stuff 0xFF00 and stop at markers.
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('./jpeg-decode.mjs', import.meta.url), 'utf8');
const st = text.indexOf('class BitReader');
const en = text.indexOf('/* ---', st);
const BitReader = new Function(text.slice(st, en) + '; return BitReader;')();

// Payload bytes: AB FF CD FF FF 12. Each 0xFF data byte is stored as 0xFF 0x00,
// so the two stuffed pairs at indices 4-5 and 6-7 both decode to 0xFF.
const data = Buffer.from([0xab, 0xff, 0x00, 0xcd, 0xff, 0x00, 0xff, 0x00, 0x12, 0xff, 0xd9]);
const expect =
  '10101011' + // AB
  '11111111' + // FF (stuffed pair 1)
  '11001101' + // CD
  '11111111' + // FF (stuffed pair 2)
  '11111111' + // FF (stuffed pair 2)
  '00010010'; // 12
// The trailing 0xFFD9 is a real marker, so reads past the payload return 1-bits.

const br = new BitReader(data, 0);
let got = '';
for (let i = 0; i < expect.length; i++) got += br.getBits(1);
const ok = got === expect;
console.log('expect:', expect);
console.log('got   :', got);
console.log(ok ? 'PASS un-stuffing' : 'FAIL un-stuffing');

// Also verify multi-bit reads agree with the flat string.
const br2 = new BitReader(data, 0);
let flat = '';
let p = 0;
const sizes = [1, 3, 5, 2, 7, 4, 6, 8, 1, 2, 3];
for (const n of sizes) {
  const want = parseInt(expect.slice(p, p + n), 2);
  const g = br2.getBits(n);
  if (want !== g) {
    console.log(`FAIL multibit n=${n} at bit ${p}: want ${want} got ${g}`);
    process.exit(1);
  }
  flat += expect.slice(p, p + n);
  p += n;
}
console.log('PASS multi-bit reads');
