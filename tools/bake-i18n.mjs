#!/usr/bin/env node
/**
 * Bake static/i18n/*.json into index.html.
 *
 * WHY THIS EXISTS
 *   Opening index.html straight off disk makes the page origin-less, and Chrome
 *   then refuses fetch(), XMLHttpRequest() AND <script src> for every sibling
 *   file, all with the same "Cross origin requests are only supported for
 *   protocol schemes..." error. There is no load path left for a sibling JSON
 *   file under file://.
 *
 *   So the locales are baked into index.html itself as a single inline
 *   <script id="i18n-utf8" type="application/json"> element. static/game.js
 *   reads it (see readBakedLocale) and falls back to the real files over http.
 *   Inline content has no URL, so no origin check applies and it works
 *   everywhere.
 *
 *   static/i18n/*.json remains the single source of truth. Edit the JSON, then
 *   re-run this script.
 *
 * USAGE
 *   node tools/bake-i18n.mjs            # rewrite the block in index.html
 *   node tools/bake-i18n.mjs --check    # exit 1 if index.html is stale
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const I18N_DIR = join(ROOT, 'static', 'i18n');
const INDEX = join(ROOT, 'index.html');

const START = '<script id="i18n-utf8" type="application/json">';
const END = '</script>';

/** Linguistically meaningful order: en, ja, zh, then anything else alphabetically. */
function languageOrder(a, b) {
  const pref = ['en', 'ja', 'zh'];
  const ia = pref.indexOf(a);
  const ib = pref.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

function buildPayloadBlock() {
  const files = readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).sort();
  const langs = files.map((f) => f.replace(/\.json$/, '')).sort(languageOrder);

  if (!langs.length) throw new Error('no locale files found in ' + I18N_DIR);

  const payload = {};
  for (const lang of langs) {
    const raw = readFileSync(join(I18N_DIR, lang + '.json'), 'utf8');
    const parsed = JSON.parse(raw);                       // fail loudly on bad JSON
    if (parsed.lang !== lang) {
      throw new Error(`${lang}.json declares lang="${parsed.lang}" but is named ${lang}.json`);
    }
    // Each locale is stored as a JSON *string*: one more layer of escaping keeps
    // the payload ASCII-only, so it survives even a non-UTF-8 page encoding.
    payload[lang] = JSON.stringify(parsed);
  }

  const body = JSON.stringify(payload, null, 2);
  return { block: `${START}${body}${END}`, langs, payload };
}

function splice(html, block) {
  const start = html.indexOf(START);
  if (start === -1) {
    // Not present yet: append just before </body>.
    const close = html.lastIndexOf('</body>');
    if (close === -1) throw new Error('index.html has no </body> to insert before');
    return html.slice(0, close) + block + '\n' + html.slice(close);
  }
  const end = html.indexOf(END, start);
  if (end === -1) throw new Error('index.html has an unterminated i18n-utf8 block');
  return html.slice(0, start) + block + html.slice(end + END.length);
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const html = readFileSync(INDEX, 'utf8');
  const { block, langs } = buildPayloadBlock();
  const next = splice(html, block);

  if (next === html) {
    console.log(`UP TO DATE  index.html (${langs.join(', ')})`);
    process.exit(0);
  }
  if (checkOnly) {
    console.error(`STALE  index.html does not match static/i18n/*.json (${langs.join(', ')})`);
    console.error('       run: node tools/bake-i18n.mjs');
    process.exit(1);
  }

  writeFileSync(INDEX, next, 'utf8');
  console.log(`BAKED  ${langs.length} locale(s) into index.html: ${langs.join(', ')}`);
  console.log(`       index.html ${html.length} -> ${next.length} bytes`);
}

try {
  main();
} catch (err) {
  console.error('bake-i18n FAILED:', err.message);
  process.exit(1);
}
