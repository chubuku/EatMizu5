#!/usr/bin/env node
/**
 * Push Kano Beat to GitHub, with guard rails.
 *
 * WHY THIS IS A .mjs AND NOT A .ps1
 *   This machine's PowerShell execution policy is RemoteSigned, which refuses to
 *   run ANY unsigned .ps1 file. Node has no such restriction, so this script is
 *   runnable everywhere:  node tools/push-to-github.mjs <repo-url>
 *
 * WHAT IT GUARDS AGAINST
 *   1. TLS. This environment's schannel backend cannot reach github.com
 *      ("AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS"). It sets
 *      http.sslBackend=openssl for this repo only.
 *   2. Publishing the wrong files. It re-verifies that node_modules/, tests/,
 *      dist/ and the i18n scratch files are not tracked before pushing.
 *   3. Pushing a game that does not build. It runs the dist build first.
 *
 * USAGE
 *   node tools/push-to-github.mjs https://github.com/USER/REPO.git
 *   node tools/push-to-github.mjs https://github.com/USER/REPO.git --check
 *        (--check validates everything but stops before pushing)
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const url = argv.find((a) => !a.startsWith('--'));

const c = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m' };
const step = (m) => console.log(`\n${c.cyan}==> ${m}${c.reset}`);
const ok = (m) => console.log(`    ${c.green}${m}${c.reset}`);
const warn = (m) => console.log(`    ${c.yellow}${m}${c.reset}`);
const die = (m) => { console.error(`\n${c.red}FAILED: ${m}${c.reset}`); process.exit(1); };

/** Run git, returning stdout. Throws with git's own stderr on failure. */
function git(args, { quiet = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = (e.stderr || e.stdout || e.message || '').toString().trim();
    throw new Error(err || `git ${args.join(' ')} failed`);
  }
}

/* ---------------------------------------------------------------- 0. sanity */
if (!url) {
  console.log(`usage: node tools/push-to-github.mjs <repo-url> [--check]

  e.g. node tools/push-to-github.mjs https://github.com/149879/EatKano.git

Create the repository on GitHub FIRST and leave it completely empty
(no README, no .gitignore, no licence) so the first push has nothing to
conflict with:  https://github.com/new`);
  process.exit(1);
}

step('Validating the repository URL');
const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
if (!m) die(`URL must look like https://github.com/USERNAME/REPO.git (got: ${url})`);
const owner = m[1];
let repo = m[2];
if (repo.endsWith('.git')) repo = repo.slice(0, -4);
const cleanUrl = `https://github.com/${owner}/${repo}`;
ok(`owner=${owner}  repo=${repo}`);

/* ----------------------------------------------------------------- 1. repo */
step('Checking the local repository');
try {
  git(['rev-parse', '--is-inside-work-tree'], { quiet: true });
} catch {
  die('not a git repository. Run `git init` in the project root first.');
}
const branch = git(['branch', '--show-current']).trim() || 'main';
ok(`on branch "${branch}"`);
if (branch !== 'main') warn(`the Pages workflow triggers on "main", not "${branch}"`);

/* ------------------------------------------------------------- 2. identity */
step('Configuring git for this repository');
git(['config', 'http.sslBackend', 'openssl']);
ok('http.sslBackend = openssl  (this machine\'s schannel cannot reach GitHub)');
if (!git(['config', 'user.name']).trim()) {
  git(['config', 'user.name', 'Kano Beat']);
  ok('set user.name');
}
if (!git(['config', 'user.email']).trim()) {
  git(['config', 'user.email', 'kano-beat@localhost']);
  ok('set user.email');
}

/* --------------------------------------------------- 3. what will be pushed */
step('Auditing exactly what will be pushed');
const tracked = git(['ls-files']).split('\n').map((s) => s.trim()).filter(Boolean);
if (!tracked.length) die('nothing is committed yet. Run: git add -A && git commit -m "..."');

const mustExclude = ['node_modules/', 'tests/', 'dist/', '.npm-cache/', 'static/i18n/_'];
let leaked = 0;
for (const p of mustExclude) {
  const hit = tracked.filter((f) => f === p.replace(/\/$/, '') || f.startsWith(p));
  if (hit.length) { warn(`LEAKED: ${p} -> ${hit.length} file(s)`); leaked += hit.length; }
  else ok(`excluded: ${p}`);
}
// The deploy-critical files must be present.
const mustInclude = [
  'index.html', 'static/game.js', 'static/audio.js', 'static/lang.js', 'static/index.css',
  'static/image/ClickBefore.png', 'static/image/ClickAfter.png',
  'static/music/tap.mp3', 'static/music/end.mp3', 'static/music/err.mp3',
  'static/i18n/en.json', 'static/i18n/ja.json', 'static/i18n/zh.json',
  '.github/workflows/deploy-pages.yml',
];
for (const f of mustInclude) {
  if (!tracked.includes(f)) { warn(`MISSING from git: ${f}`); leaked++; }
}
if (!leaked) ok(`all ${tracked.length} tracked files look correct`);
if (leaked) die('the commit set is wrong - fix .gitignore, re-stage, re-commit. Do not push.');

/* ----------------------------------------------------------- 4. build check */
step('Verifying the game still builds');
try {
  const out = execFileSync(process.execPath, [join(ROOT, 'tools', 'build-dist.mjs'), '--verify'], {
    cwd: ROOT, encoding: 'utf8',
  });
  const line = out.split('\n').find((l) => l.includes('VERIFY OK')) || 'VERIFY OK';
  ok(line.trim());
} catch (e) {
  die(`the build failed, so the deploy would fail too:\n${(e.stdout || e.message).toString().trim()}`);
}

if (CHECK_ONLY) {
  console.log(`\n${c.green}--check passed.${c.reset} Re-run without --check to push.`);
  process.exit(0);
}

/* --------------------------------------------------------------- 5. remote */
step('Configuring the remote');
const remotes = git(['remote']).split('\n').map((s) => s.trim()).filter(Boolean);
if (remotes.includes('origin')) {
  git(['remote', 'set-url', 'origin', cleanUrl]);
  ok(`updated origin -> ${cleanUrl}`);
} else {
  git(['remote', 'add', 'origin', cleanUrl]);
  ok(`added origin -> ${cleanUrl}`);
}

/* ----------------------------------------------------------------- 6. push */
step('Pushing');
try {
  process.env.GIT_TERMINAL_PROMPT = '1'; // allow an interactive credential prompt
  const out = execFileSync('git', ['push', '-u', 'origin', branch], {
    cwd: ROOT, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (out.trim()) console.log(out.trim());
  ok('pushed');
} catch (e) {
  const msg = (e.stderr || e.stdout || e.message || '').toString();
  console.error(msg.trim());
  warn('Push failed. Most likely authentication.');
  console.log(`
    GitHub does not accept your account password over HTTPS. Use either:

      A) Personal Access Token (simplest)
         1. https://github.com/settings/tokens  ->  Generate new token (classic)
         2. Tick the "repo" scope, generate, copy it
         3. Run:  git push -u origin ${branch}
            Username: ${owner}
            Password: paste the token

      B) GitHub CLI (stores credentials for you)
         1. Install:  winget install --id GitHub.cli
         2. Run:      gh auth login
         3. Then:     git push -u origin ${branch}

    If it said "repository not found", create it first - empty - at
    https://github.com/new
`);
  process.exit(1);
}

/* ----------------------------------------------------------- 7. next steps */
console.log(`
${c.cyan}============================================================
PUSHED  ->  ${cleanUrl}

ONE STEP LEFT, in your browser (cannot be automated from here):

  1. ${cleanUrl}/settings/pages
       Build and deployment  ->  Source  ->  choose "GitHub Actions"
       (NOT "Deploy from a branch" - dist/ is not committed)

  2. ${cleanUrl}/actions
       Wait for "Deploy to GitHub Pages" to go green (~1 minute)

Your game will be live at:
  https://${owner}.github.io/${repo}/

Because every path in the game is relative, this works in the
subdirectory with no extra configuration.
============================================================${c.reset}
`);
