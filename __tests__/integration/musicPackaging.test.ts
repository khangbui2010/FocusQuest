import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const FORBIDDEN_AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);

function findAudioFilesRecursively(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (FORBIDDEN_AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        found.push(path.relative(ROOT, fullPath));
      }
    }
  };
  walk(baseDir);
  return found;
}

test('MV3 Music Packaging: dist/ contains valid manifest, CSP-safe offscreen.html, and offscreen.js', () => {
  assert.ok(fs.existsSync(DIST_DIR), 'dist/ directory must exist (run npm run build before packaging verification)');

  // 1. manifest.json checks
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'dist/manifest.json missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    minimum_chrome_version?: string;
    permissions?: string[];
  };
  assert.ok(
    Number(manifest.minimum_chrome_version) >= 109,
    `minimum_chrome_version must be >= 109 for offscreen API, got ${manifest.minimum_chrome_version}`
  );
  assert.ok(
    Array.isArray(manifest.permissions) && manifest.permissions.includes('offscreen'),
    'manifest.json must declare "offscreen" permission'
  );

  // 2. offscreen.html & offscreen.js checks (MV3 CSP: zero inline scripts)
  const offscreenHtmlPath = path.join(DIST_DIR, 'offscreen.html');
  const offscreenJsPath = path.join(DIST_DIR, 'offscreen.js');
  assert.ok(fs.existsSync(offscreenHtmlPath), 'dist/offscreen.html missing');
  assert.ok(fs.existsSync(offscreenJsPath), 'dist/offscreen.js missing');

  const offscreenHtml = fs.readFileSync(offscreenHtmlPath, 'utf-8');
  assert.ok(offscreenHtml.includes('<audio'), 'offscreen.html must define a static <audio> element');
  assert.ok(offscreenHtml.includes('src="./offscreen.js"'), 'offscreen.html must load ./offscreen.js');

  const scriptTags = offscreenHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  assert.equal(scriptTags.length, 1, 'offscreen.html should have exactly 1 module script tag');
  for (const tag of scriptTags) {
    assert.ok(/\bsrc=/.test(tag), 'offscreen.html script tag must use external src');
    const inner = tag.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    assert.equal(inner, '', 'offscreen.html must not contain inline JS');
  }

  // 3. Strictly forbid dist/assets/aistudio & _music_source
  assert.equal(
    fs.existsSync(path.join(DIST_DIR, 'assets', 'aistudio')),
    false,
    'dist/assets/aistudio must not exist'
  );
  assert.equal(
    fs.existsSync(path.join(ROOT, '_music_source')),
    false,
    '_music_source must not exist'
  );

  // 4. dist/background.js stays clean of React DOM
  const bgJsPath = path.join(DIST_DIR, 'background.js');
  assert.ok(fs.existsSync(bgJsPath), 'dist/background.js missing');
  const bgJs = fs.readFileSync(bgJsPath, 'utf-8');
  assert.equal(bgJs.includes('react-dom'), false, 'background.js must not bundle react-dom');
});

test('MV3 Music Packaging: neither public/ nor dist/ contains any audio files (.mp3, .ogg, .wav, .m4a, .flac)', () => {
  const publicAudioFiles = findAudioFilesRecursively(PUBLIC_DIR);
  const distAudioFiles = findAudioFilesRecursively(DIST_DIR);

  assert.deepEqual(
    publicAudioFiles,
    [],
    `public/ must not contain any audio files, found: ${publicAudioFiles.join(', ')}`
  );
  assert.deepEqual(
    distAudioFiles,
    [],
    `dist/ must not contain any audio files, found: ${distAudioFiles.join(', ')}`
  );
  assert.equal(
    fs.existsSync(path.join(PUBLIC_DIR, 'assets', 'music')),
    false,
    'public/assets/music directory must not exist'
  );
  assert.equal(
    fs.existsSync(path.join(DIST_DIR, 'assets', 'music')),
    false,
    'dist/assets/music directory must not exist'
  );
});
