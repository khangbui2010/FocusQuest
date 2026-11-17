import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MUSIC_CATALOG,
  formatMusicDuration,
  getTrackById,
  isAttributionRequired,
  isBundledMp3Path,
  resolveTrackAssetUrl,
  validateMusicCatalog,
} from '../../src/data/musicCatalog.ts';
import { MusicTrack } from '../../src/types/music.ts';

test('MusicCatalog: default bundled catalog passes full schema & license validation', () => {
  assert.ok(
    MUSIC_CATALOG.length >= 11,
    'Must contain 5 Purrple Cat tracks, 5 HoliznaCC0 tracks, and whisper by ikkun (ex. Barradeen)'
  );

  const result = validateMusicCatalog(MUSIC_CATALOG);
  assert.equal(result.valid, true, `Catalog validation errors: ${result.errors.join('; ')}`);

  const purrpleTracks = MUSIC_CATALOG.filter((t) => t.artist === 'Purrple Cat');
  const holiznaTracks = MUSIC_CATALOG.filter((t) => t.artist === 'HoliznaCC0');
  const ikkunTracks = MUSIC_CATALOG.filter((t) => t.artist === 'ikkun (ex. Barradeen)');
  assert.equal(purrpleTracks.length, 5);
  assert.equal(holiznaTracks.length, 5);
  assert.equal(ikkunTracks.length, 1);

  for (const track of MUSIC_CATALOG) {
    assert.ok(track.id.length > 0);
    assert.ok(track.title.length > 0);
    assert.ok(track.artist.length > 0);
    assert.ok(track.album.length > 0);
    assert.ok(isBundledMp3Path(track.file), `Invalid bundled MP3 path: ${track.file}`);
    assert.equal(track.isModified, false);
  }

  for (const track of purrpleTracks) {
    assert.equal(track.license, 'CC BY');
    assert.ok(track.attribution.includes('Purrple Cat'));
    assert.ok(track.attribution.includes('purrplecat.com'));
    assert.ok(track.attribution.includes('creativecommons.org/licenses/by/4.0/'));
  }

  for (const track of holiznaTracks) {
    assert.equal(track.license, 'CC0');
    assert.equal(track.sourceUrl, 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi');
    assert.equal(track.licenseUrl, 'https://creativecommons.org/publicdomain/zero/1.0/');
  }

  const whisperTrack = ikkunTracks[0];
  assert.equal(whisperTrack.id, 'ikkun-barradeen-whisper');
  assert.equal(whisperTrack.title, 'whisper');
  assert.equal(whisperTrack.duration, 66);
  assert.equal(whisperTrack.license, 'CC BY-SA');
  assert.equal(whisperTrack.sourceUrl, 'https://soundcloud.com/ikkunwastaken');
  assert.equal(whisperTrack.licenseUrl, 'https://creativecommons.org/licenses/by-sa/3.0/deed.en_US');
  assert.ok(whisperTrack.attribution.includes('ikkun (ex. Barradeen)'));
  assert.ok(whisperTrack.attribution.includes('free-stock-music.com'));
  assert.ok(whisperTrack.attribution.includes('CC BY-SA 3.0'));
});

test('MusicCatalog: zero external URLs or developer filesystem paths in track files', () => {
  for (const track of MUSIC_CATALOG) {
    assert.ok(!/^https?:\/\//i.test(track.file), 'Track file must not be an HTTP/HTTPS URL');
    assert.ok(!/^data:|^blob:|^file:/i.test(track.file), 'Track file must not be data/blob/file URI');
    assert.ok(!track.file.includes('/Users/') && !track.file.includes('C:\\'));
    assert.ok(!track.file.includes('aistudio'), 'Track file must not reference assets/aistudio');
    assert.ok(track.file.startsWith('assets/music/') && track.file.endsWith('.mp3'));
  }

  assert.equal(isBundledMp3Path('https://youtube.com/watch?v=123.mp3'), false);
  assert.equal(isBundledMp3Path('/Users/dev/music.mp3'), false);
  assert.equal(isBundledMp3Path('assets/music/../secret.mp3'), false);
  assert.equal(isBundledMp3Path('assets/music/sample.wav'), false);
  assert.equal(isBundledMp3Path('assets/music/valid-track.mp3'), true);
});

test('MusicCatalog: enforces attribution for CC BY and CC BY-SA while supporting CC0', () => {
  const validCc0: MusicTrack = {
    id: 'cc0-sample',
    title: 'CC0 Sample',
    artist: 'Unknown Public',
    album: 'Public Domain',
    file: 'assets/music/cc0-sample.mp3',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'Public Domain',
    sourceUrl: '',
    attribution: '',
    isModified: false,
  };
  assert.equal(isAttributionRequired('CC0'), false);
  assert.equal(validateMusicCatalog([validCc0]).valid, true);

  assert.equal(isAttributionRequired('CC BY'), true);
  assert.equal(isAttributionRequired('CC BY-SA'), true);

  const missingAttributionCcBySa: MusicTrack = {
    id: 'cc-by-sa-broken',
    title: 'Missing Attribution',
    artist: 'Artist',
    album: 'Album',
    file: 'assets/music/broken.mp3',
    license: 'CC BY-SA',
    licenseUrl: '',
    creator: '',
    sourceUrl: '',
    attribution: '',
    isModified: true,
  };
  const check = validateMusicCatalog([missingAttributionCcBySa]);
  assert.equal(check.valid, false);
  assert.ok(check.errors.length >= 4);
});

test('MusicCatalog: dynamically supports arbitrary N tracks without hardcoded count', () => {
  const dynamicCatalog: MusicTrack[] = [
    ...MUSIC_CATALOG,
    {
      id: 'extra-dynamic-track-6',
      title: 'Dawn Horizon',
      artist: 'Focus Composer',
      album: 'Extra Pack',
      file: 'assets/music/dawn-horizon.mp3',
      duration: 215,
      license: 'CC BY-SA',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      creator: 'Focus Composer',
      sourceUrl: 'https://example.org/music',
      attribution: 'Music by Focus Composer, CC BY-SA 4.0',
      isModified: false,
    },
  ];

  assert.equal(validateMusicCatalog(dynamicCatalog).valid, true);
  assert.equal(getTrackById('extra-dynamic-track-6', dynamicCatalog)?.title, 'Dawn Horizon');
  assert.equal(getTrackById('missing-track', dynamicCatalog), null);
  assert.equal(validateMusicCatalog([]).valid, true);
  assert.equal(formatMusicDuration(202), '3:22');
  assert.equal(formatMusicDuration(null), '0:00');
  assert.equal(resolveTrackAssetUrl('/assets/music/test.mp3'), './assets/music/test.mp3');
});

test('MusicCatalog: public/assets/aistudio directory does not exist and public/assets/music matches catalog', () => {
  const root = process.cwd();
  assert.equal(
    fs.existsSync(path.join(root, 'public', 'assets', 'aistudio')),
    false,
    'public/assets/aistudio must not exist'
  );
  for (const track of MUSIC_CATALOG) {
    const absPath = path.join(root, 'public', track.file);
    assert.ok(fs.existsSync(absPath), `Missing MP3 file at ${absPath}`);
    assert.ok(fs.statSync(absPath).size > 1024, `MP3 file unexpectedly small: ${absPath}`);
  }
});
