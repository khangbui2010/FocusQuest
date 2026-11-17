import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MUSIC_CATALOG } from '../../src/data/musicCatalog.ts';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

test('MV3 Music Packaging: dist/ contains valid manifest, CSP-safe offscreen.html, offscreen.js, and every bundled MP3 track', () => {
  assert.ok(fs.existsSync(DIST), 'dist/ directory must exist (run npm run build before packaging verification)');

  // 1. manifest.json checks
  const manifestPath = path.join(DIST, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'dist/manifest.json missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    minimum_chrome_version?: string;
    permissions?: string[];
    web_accessible_resources?: Array<{ resources?: string[] }>;
  };
  assert.ok(
    Number(manifest.minimum_chrome_version) >= 109,
    `minimum_chrome_version must be >= 109 for offscreen API, got ${manifest.minimum_chrome_version}`
  );
  assert.ok(
    Array.isArray(manifest.permissions) && manifest.permissions.includes('offscreen'),
    'manifest.json must declare "offscreen" permission'
  );
  assert.ok(
    manifest.web_accessible_resources?.some((entry) => entry.resources?.includes('assets/*')),
    'manifest.json must expose assets/* in web_accessible_resources'
  );

  // 2. offscreen.html & offscreen.js checks (MV3 CSP: zero inline scripts)
  const offscreenHtmlPath = path.join(DIST, 'offscreen.html');
  const offscreenJsPath = path.join(DIST, 'offscreen.js');
  assert.ok(fs.existsSync(offscreenHtmlPath), 'dist/offscreen.html missing');
  assert.ok(fs.existsSync(offscreenJsPath), 'dist/offscreen.js missing');

  const offscreenHtml = fs.readFileSync(offscreenHtmlPath, 'utf-8');
  assert.ok(offscreenHtml.includes('src="./offscreen.js"'), 'offscreen.html must load ./offscreen.js');
  // Ensure every <script ...> tag has a src attribute (no inline script bodies)
  const scriptTags = offscreenHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  assert.ok(scriptTags.length === 1, 'offscreen.html should have exactly 1 module script tag');
  for (const tag of scriptTags) {
    assert.ok(/\bsrc=/.test(tag), 'offscreen.html script tag must use external src');
    const inner = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    assert.equal(inner, '', 'offscreen.html must not contain inline JS');
  }

  // 3. Every track in MUSIC_CATALOG exists in both public/ and dist/
  for (const track of MUSIC_CATALOG) {
    const publicFile = path.join(ROOT, 'public', track.file);
    const distFile = path.join(DIST, track.file);
    assert.ok(fs.existsSync(publicFile), `Missing public asset: ${publicFile}`);
    assert.ok(fs.existsSync(distFile), `Missing dist asset: ${distFile}`);
    assert.equal(
      fs.statSync(publicFile).size,
      fs.statSync(distFile).size,
      `Bundled asset size mismatch for ${track.file}`
    );
  }

  // 4. Strictly forbid dist/assets/aistudio
  assert.equal(
    fs.existsSync(path.join(DIST, 'assets', 'aistudio')),
    false,
    'dist/assets/aistudio must not exist'
  );

  // 5. dist/background.js stays clean of React DOM / sprite art
  const bgJsPath = path.join(DIST, 'background.js');
  assert.ok(fs.existsSync(bgJsPath), 'dist/background.js missing');
  const bgJs = fs.readFileSync(bgJsPath, 'utf-8');
  assert.equal(bgJs.includes('react-dom'), false, 'background.js must not bundle react-dom');
});
