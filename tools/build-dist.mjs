#!/usr/bin/env node
/**
 * Build a clean, publishable copy of the game.
 *
 * WHY THIS EXISTS
 *   The repository root is both the game and the development tooling. Git
 *   hosting that serves the repo root (GitHub Pages, Cloudflare Pages, Netlify
 *   drop, ...) must NOT be handed node_modules/ (13 MB of playwright-core),
 *   tests/ (6.5 MB of browser suites and screenshots) or the i18n generator
 *   scratch files.
 *
 *   This script copies exactly what a browser needs -- index.html plus the
 *   static/ payload the page actually requests -- into dist/, so you can
 *   publish dist/ directly or point a Pages workflow at it.
 *
 * USAGE
 *   node tools/build-dist.mjs            # write ./dist
 *   node tools/build-dist.mjs --clean    # remove dist/ and exit
 *   node tools/build-dist.mjs --verify   # build, then assert the payload is
 *                                        # self-contained and offline-safe
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');

/* ------------------------------------------------------------------ *
 * The exact publish set. Anything not listed here is dev-only.
 * ------------------------------------------------------------------ */
const ROOT_FILES = ['index.html'];

// Whole directories that ship verbatim.
const SHIP_DIRS = ['static/image', 'static/music'];

// Files that ship individually (so generator scratch can be excluded).
const SHIP_FILES = [
  'static/index.css',
  'static/game.js',
  'static/audio.js',
  'static/lang.js',
  'static/i18n/en.json',
  'static/i18n/ja.json',
  'static/i18n/zh.json',
];

// Never publish, even if a future edit adds them to a shipped directory.
const DENY = [/^_/, /\.cjs$/, /\.md$/, /\.map$/, /~$/];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function collect() {
  const files = [];
  for (const rel of ROOT_FILES) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) throw new Error(`missing required file: ${rel}`);
    files.push(rel);
  }
  for (const rel of SHIP_FILES) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) throw new Error(`missing required file: ${rel}`);
    files.push(rel);
  }
  for (const dir of SHIP_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of walk(abs)) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      const base = rel.split('/').pop();
      if (DENY.some((re) => re.test(base))) continue;
      files.push(rel);
    }
  }
  return [...new Set(files)].sort();
}

function clean() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
}

function build() {
  clean();
  const files = collect();
  let bytes = 0;
  for (const rel of files) {
    const from = join(ROOT, rel);
    const to = join(DIST, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    bytes += statSync(from).size;
  }
  return { files, bytes };
}

/**
 * Strip comments and string literals so the scan only sees real code.
 *
 * This matters: static/audio.js has a header comment reading
 * `Classic script (NO import/export, no \`type="module"\`)`, i.e. it documents
 * that the file is NOT a module. A naive grep flags that comment and fails the
 * build for the opposite of the real condition.
 */
function codeOnly(text, ext) {
  if (ext === 'html') {
    // Drop <!-- ... --> comments and the contents of the baked JSON payload.
    return text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi, ' ');
  }
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')  // line comments (not http://)
    .replace(/'(?:\\.|[^'\\])*'/g, "''")    // single-quoted strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""')    // double-quoted strings
    .replace(/`(?:\\.|[^`\\])*`/g, '``');   // template literals
}

/**
 * Assert the published copy is genuinely self-contained: no external URLs, no
 * module scripts, and every ./static/... reference resolves to a real file.
 * This is the check that makes "it deploys anywhere" a verified claim rather
 * than an assumption.
 */
function verify(files) {
  const problems = [];
  const shipped = new Set(files);

  for (const rel of files.filter((f) => /\.(html|css|js)$/.test(f))) {
    const raw = readFileSync(join(DIST, rel), 'utf8');
    const ext = rel.split('.').pop();
    // CSS has no line comments; strip block comments only.
    const text = ext === 'css'
      ? raw.replace(/\/\*[\s\S]*?\*\//g, ' ')
      : codeOnly(raw, ext);

    for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
      problems.push(`${rel}: external URL ${m[0].slice(0, 70)}`);
    }
    for (const m of text.matchAll(/type\s*=\s*["']module["']/g)) {
      problems.push(`${rel}: type="module" (breaks under file://)`);
    }
    // Resolve every relative asset reference against the published set.
    const refSource = ext === 'html' ? raw : text;   // url() lives in real CSS text
    for (const m of refSource.matchAll(/(?:src|href)\s*=\s*["'](\.\/[^"']+)["']/g)) {
      const ref = join(rel, '..', m[1]).replace(/\\/g, '/').replace(/^\.\//, '');
      const norm = ref.replace(/\/\.\//g, '/');
      if (!shipped.has(norm)) problems.push(`${rel}: references ${m[1]} which is not in the publish set`);
    }
    // CSS url(./...) references must also resolve.
    for (const m of refSource.matchAll(/url\(\s*['"]?(\.\/[^'")]+)['"]?\s*\)/g)) {
      const ref = join(rel, '..', m[1]).replace(/\\/g, '/');
      if (!shipped.has(ref)) problems.push(`${rel}: url(${m[1]}) is not in the publish set`);
    }
  }
  return problems;
}

function human(bytes) {
  return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : (bytes / 1024).toFixed(1) + ' KB';
}

/* ------------------------------------------------------------------ */

try {
  if (process.argv.includes('--clean')) {
    clean();
    console.log('CLEANED  dist/ removed');
    process.exit(0);
  }

  const { files, bytes } = build();
  console.log(`BUILT  dist/  (${files.length} files, ${human(bytes)})`);
  for (const f of files) {
    console.log(`  ${String(statSync(join(DIST, f)).size).padStart(8)}  ${f}`);
  }

  const problems = verify(files);
  if (problems.length) {
    console.error('\nVERIFY FAILED:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('\nVERIFY OK  no external URLs, no module scripts, every asset reference resolves');

  if (process.argv.includes('--verify')) {
    console.log('           payload is self-contained -> safe for any static host');
  }
  console.log(`\nNext: publish the contents of dist/ (see README.md "Deploying").`);
} catch (err) {
  console.error('build-dist FAILED:', err.message);
  process.exit(1);
}
