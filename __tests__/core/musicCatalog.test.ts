import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOFI_BASE_URL,
  LOFI_CATALOG_CACHE_TTL_MS,
  LOFI_CATALOG_URL,
  buildTrackAttribution,
  fetchRemoteMusicCatalog,
  formatMusicDuration,
  getTrackById,
  isAttributionRequired,
  isCatalogCacheFresh,
  isValidStreamFileOrUrl,
  parseRemoteCatalog,
  resolveTrackStreamUrl,
  validateMusicCatalog,
} from '../../src/data/musicCatalog.ts';
import { CachedMusicCatalog, MusicTrack, RemoteMusicCatalog } from '../../src/types/music.ts';

function buildFixtureRemoteCatalog(): RemoteMusicCatalog {
  return {
    schemaVersion: 1,
    updatedAt: '2026-11-17',
    tracks: [
      {
        id: 'purrple-cat-twilight-market',
        title: 'Twilight Market',
        artist: 'Purrple Cat',
        album: 'City Nights 2',
        durationSec: 175,
        file: 'purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'purrple-cat-rooftop-rendezvous',
        title: 'Rooftop Rendezvous',
        artist: 'Purrple Cat',
        album: 'City Nights 2',
        durationSec: 184,
        file: 'purrple-cat-city-nights-2-02-rooftop-rendezvous_25a6b224.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'purrple-cat-lonely',
        title: 'Lonely',
        artist: 'Purrple Cat',
        album: 'City Nights 2',
        durationSec: 176,
        file: 'purrple-cat-city-nights-2-07-lonely_26f60337.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'purrple-cat-walking-to-the-park-at-3am',
        title: 'Walking to the Park at 3 A.M.',
        artist: 'Purrple Cat',
        album: 'Indigo Dreams',
        durationSec: 202,
        file: 'purrple-cat-indigo-dreams-07-walking-to-the-park-at-3-a-m_8fae33b8.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'purrple-cat-starlit-beach',
        title: 'Starlit Beach',
        artist: 'Purrple Cat',
        album: 'Sea of Stars 2',
        durationSec: 174,
        file: 'purrple-cat-sea-of-stars-2-10-starlit-beach_715e8b5f.mp3',
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://purrplecat.com/',
        modified: false,
      },
      {
        id: 'holizna-cc0-into-the-mist',
        title: 'Into The Mist',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 130,
        file: 'holizna-cc0-into-the-mist.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
      {
        id: 'holizna-cc0-before-everything',
        title: 'Before Everything',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 171,
        file: 'holizna-cc0-before-everything.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
      {
        id: 'holizna-cc0-theta-frequency',
        title: 'Theta Frequency',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 127,
        file: 'holizna-cc0-theta-frequency.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
      {
        id: 'holizna-cc0-birds',
        title: 'Birds',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 170,
        file: 'holizna-cc0-birds.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
      {
        id: 'holizna-cc0-when-time-called-me-darling',
        title: 'When Time Called Me Darling',
        artist: 'HoliznaCC0',
        album: 'Public Domain Lofi',
        durationSec: 215,
        file: 'holizna-cc0-when-time-called-me-darling.mp3',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
        modified: false,
      },
      {
        id: 'ikkun-barradeen-whisper',
        title: 'whisper',
        artist: 'ikkun (ex. Barradeen)',
        album: 'Free Stock Music',
        durationSec: 66,
        file: 'ikkun-barradeen-whisper.mp3',
        license: 'CC-BY-SA-3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en_US',
        sourceUrl: 'https://soundcloud.com/ikkunwastaken',
        modified: false,
      },
    ],
  };
}

test('MusicCatalog: online endpoints and remote catalog schema parsing work cleanly for SPDX tracks', () => {
  assert.equal(LOFI_BASE_URL, 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks/');
  assert.equal(LOFI_CATALOG_URL, 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json');

  const raw = buildFixtureRemoteCatalog();
  const parsed = parseRemoteCatalog(raw);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.updatedAt, '2026-11-17');
  assert.equal(parsed.tracks.length, 11);

  const first = parsed.tracks[0];
  assert.equal(first.id, 'purrple-cat-twilight-market');
  assert.equal(
    first.streamUrl,
    `${LOFI_BASE_URL}purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3`
  );
  assert.equal(first.license, 'CC-BY-4.0');
  assert.equal(first.durationSec, 175);
  assert.equal(first.isModified, false);
  assert.ok(first.attribution.includes('Purrple Cat'));
  assert.ok(first.attribution.includes('CC-BY-4.0'));

  const whisper = parsed.tracks[10];
  assert.equal(whisper.id, 'ikkun-barradeen-whisper');
  assert.equal(whisper.license, 'CC-BY-SA-3.0');
  assert.equal(whisper.durationSec, 66);
});

test('MusicCatalog: validates online stream files/URLs and rejects local asset paths or unsafe schemes', () => {
  assert.equal(isValidStreamFileOrUrl('holizna-cc0-into-the-mist.mp3'), true);
  assert.equal(
    isValidStreamFileOrUrl('https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks/sample.mp3'),
    true
  );

  // Reject local bundled paths, insecure HTTP, traversal, and non-mp3 extensions
  assert.equal(isValidStreamFileOrUrl('assets/music/sample.mp3'), false);
  assert.equal(isValidStreamFileOrUrl('http://example.com/sample.mp3'), false);
  assert.equal(isValidStreamFileOrUrl('data:audio/mp3;base64,AAA'), false);
  assert.equal(isValidStreamFileOrUrl('blob:https://example.com/123'), false);
  assert.equal(isValidStreamFileOrUrl('../secret.mp3'), false);
  assert.equal(isValidStreamFileOrUrl('/Users/dev/music.mp3'), false);
  assert.equal(isValidStreamFileOrUrl('track.wav'), false);

  assert.equal(
    resolveTrackStreamUrl('holizna-cc0-into-the-mist.mp3'),
    `${LOFI_BASE_URL}holizna-cc0-into-the-mist.mp3`
  );
  assert.equal(
    resolveTrackStreamUrl('https://cdn.example.org/lofi/custom.mp3'),
    'https://cdn.example.org/lofi/custom.mp3'
  );
  assert.throws(() => resolveTrackStreamUrl('assets/music/legacy.mp3'));
  assert.throws(() =>
    parseRemoteCatalog({
      schemaVersion: 2,
      updatedAt: '2026-11-17',
      tracks: [],
    })
  );
});

test('MusicCatalog: enforces attribution for SPDX CC-BY-4.0 / CC-BY-SA-3.0 while exempting CC0-1.0', () => {
  assert.equal(isAttributionRequired('CC0-1.0'), false);
  assert.equal(isAttributionRequired('CC0'), false);
  assert.equal(isAttributionRequired('CC-BY-4.0'), true);
  assert.equal(isAttributionRequired('CC-BY-SA-3.0'), true);
  assert.equal(isAttributionRequired('CC BY'), true);
  assert.equal(isAttributionRequired('CC BY-SA'), true);

  const validCc0: MusicTrack = {
    id: 'cc0-sample',
    title: 'CC0 Sample',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'cc0-sample.mp3',
    streamUrl: `${LOFI_BASE_URL}cc0-sample.mp3`,
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: '',
    attribution: '',
    isModified: false,
  };
  assert.equal(validateMusicCatalog([validCc0]).valid, true);

  const brokenCcBySa: MusicTrack = {
    id: 'cc-by-sa-broken',
    title: 'Missing Attribution',
    artist: 'Artist',
    album: 'Album',
    file: 'broken.mp3',
    license: 'CC-BY-SA-3.0',
    licenseUrl: '',
    creator: '',
    sourceUrl: '',
    attribution: '',
    isModified: true,
  };
  const check = validateMusicCatalog([brokenCcBySa]);
  assert.equal(check.valid, false);
  assert.ok(check.errors.length >= 4);
});

test('MusicCatalog: dynamically supports arbitrary N tracks, cache TTL checks, and remote fetch', async () => {
  const raw = buildFixtureRemoteCatalog();
  const parsed = parseRemoteCatalog(raw);
  const dynamicCatalog: MusicTrack[] = [
    ...parsed.tracks,
    {
      id: 'extra-dynamic-track-12',
      title: 'Dawn Horizon',
      artist: 'Focus Composer',
      album: 'Extra Pack',
      file: 'dawn-horizon.mp3',
      streamUrl: `${LOFI_BASE_URL}dawn-horizon.mp3`,
      durationSec: 215,
      license: 'CC-BY-SA-3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
      creator: 'Focus Composer',
      sourceUrl: 'https://example.org/music',
      attribution: buildTrackAttribution({
        title: 'Dawn Horizon',
        artist: 'Focus Composer',
        license: 'CC-BY-SA-3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
        sourceUrl: 'https://example.org/music',
      }),
      isModified: false,
    },
  ];

  assert.equal(validateMusicCatalog(dynamicCatalog).valid, true);
  assert.equal(getTrackById('extra-dynamic-track-12', dynamicCatalog)?.title, 'Dawn Horizon');
  assert.equal(getTrackById('missing-track', dynamicCatalog), null);
  assert.equal(validateMusicCatalog([]).valid, true);
  assert.equal(formatMusicDuration(202), '3:22');
  assert.equal(formatMusicDuration(null), '0:00');

  const now = 1_700_000_000_000;
  const freshCache: CachedMusicCatalog = {
    schemaVersion: 1,
    updatedAt: '2026-11-17',
    fetchedAt: now - LOFI_CATALOG_CACHE_TTL_MS + 10_000,
    sourceUrl: LOFI_CATALOG_URL,
    tracks: parsed.tracks,
  };
  const expiredCache: CachedMusicCatalog = {
    ...freshCache,
    fetchedAt: now - LOFI_CATALOG_CACHE_TTL_MS - 1,
  };
  assert.equal(isCatalogCacheFresh(freshCache, now), true);
  assert.equal(isCatalogCacheFresh(expiredCache, now), false);
  assert.equal(isCatalogCacheFresh(null, now), false);

  const fetched = await fetchRemoteMusicCatalog(async () => {
    return new Response(JSON.stringify(raw), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  assert.equal(fetched.tracks.length, 11);
  assert.equal(fetched.sourceUrl, LOFI_CATALOG_URL);

  await assert.rejects(() =>
    fetchRemoteMusicCatalog(async () => new Response('Not Found', { status: 404 }))
  );
});

test('MusicCatalog: public/ contains zero local audio files and zero public/assets/aistudio directory', () => {
  const root = process.cwd();
  const publicDir = path.join(root, 'public');
  assert.equal(
    fs.existsSync(path.join(publicDir, 'assets', 'aistudio')),
    false,
    'public/assets/aistudio must not exist'
  );
  assert.equal(
    fs.existsSync(path.join(root, '_music_source')),
    false,
    '_music_source must not exist'
  );

  const audioExts = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);
  const foundAudio: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (audioExts.has(path.extname(entry.name).toLowerCase())) {
        foundAudio.push(path.relative(root, full));
      }
    }
  };
  walk(publicDir);
  assert.deepEqual(foundAudio, [], `public/ must not contain local audio files: ${foundAudio.join(', ')}`);
});

test('MusicCatalog: rejects untrusted catalog envelopes (schemaVersion != 1, > 200 tracks, malformed JSON)', async () => {
  assert.throws(() => parseRemoteCatalog(null), /Invalid remote music catalog/);
  assert.throws(() => parseRemoteCatalog({ schemaVersion: 0, tracks: [] }), /schemaVersion/);
  assert.throws(() => parseRemoteCatalog({ schemaVersion: 2, tracks: [] }), /schemaVersion/);
  assert.throws(() => parseRemoteCatalog({ schemaVersion: '1', tracks: [] }), /schemaVersion/);
  assert.throws(() => parseRemoteCatalog({ schemaVersion: 1 }), /tracks array/);

  const tooManyTracks = Array.from({ length: 201 }, (_, idx) => ({
    id: `track-${idx}`,
    title: `Track ${idx}`,
    artist: 'Artist',
    album: 'Album',
    durationSec: 120,
    file: `track-${idx}.mp3`,
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://example.org/music',
    modified: false,
  }));
  assert.throws(
    () =>
      parseRemoteCatalog({
        schemaVersion: 1,
        updatedAt: '2026-11-17',
        tracks: tooManyTracks,
      }),
    /maximum allowed track count/
  );

  await assert.rejects(
    () =>
      fetchRemoteMusicCatalog(
        async () =>
          new Response('{not-valid-json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      ),
    /Malformed JSON/
  );
});

test('MusicCatalog: skips and counts malformed, duplicate, overlong, unsafe-path, non-HTTPS, and disallowed-license tracks', () => {
  const baseValid = {
    id: 'valid-cc-by-sa-4',
    title: 'Valid Track',
    artist: 'Valid Artist',
    album: 'Valid Album',
    durationSec: 180,
    file: 'valid-track.mp3',
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://example.org/artist',
    modified: false,
  };

  const mixedPayload = {
    schemaVersion: 1,
    updatedAt: '2026-11-17',
    tracks: [
      baseValid,
      // Duplicate id
      { ...baseValid, title: 'Duplicate Track' },
      // Invalid id format (uppercase & space)
      { ...baseValid, id: 'Invalid Track Id' },
      // Oversized title (> 200 chars)
      { ...baseValid, id: 'overlong-title', title: 'A'.repeat(201) },
      // Disallowed license (CC-BY-NC-4.0)
      { ...baseValid, id: 'nc-license', license: 'CC-BY-NC-4.0' },
      // Missing required artist
      { ...baseValid, id: 'missing-artist', artist: '   ' },
      // Missing required title
      { ...baseValid, id: 'missing-title', title: '' },
      // Missing required license
      { ...baseValid, id: 'missing-license', license: '' },
      // Missing required licenseUrl
      { ...baseValid, id: 'missing-license-url', licenseUrl: '' },
      // Missing required sourceUrl
      { ...baseValid, id: 'missing-source-url', sourceUrl: '' },
      // Non-HTTPS licenseUrl
      { ...baseValid, id: 'http-license-url', licenseUrl: 'http://creativecommons.org/licenses/by/4.0/' },
      // Non-HTTPS sourceUrl
      { ...baseValid, id: 'js-source-url', sourceUrl: 'javascript:alert(1)' },
      // Path traversal / slashes in file
      { ...baseValid, id: 'traversal-dotdot', file: '../secret.mp3' },
      { ...baseValid, id: 'traversal-slash', file: 'subdir/track.mp3' },
      { ...baseValid, id: 'traversal-backslash', file: 'subdir\\track.mp3' },
      // Valid CC-BY-3.0 track to confirm multiple valid tracks survive
      {
        ...baseValid,
        id: 'valid-cc-by-3',
        title: 'Valid Three',
        file: 'valid-three.mp3',
        license: 'CC-BY-3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
      },
    ],
  };

  const parsed = parseRemoteCatalog(mixedPayload);
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.skippedCount, 14);
  assert.deepEqual(
    parsed.tracks.map((t) => t.id),
    ['valid-cc-by-sa-4', 'valid-cc-by-3']
  );
  assert.equal(parsed.skippedReasons.length, 14);
});

