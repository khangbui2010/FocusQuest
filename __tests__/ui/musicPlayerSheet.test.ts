import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { MusicPlayerSheet } from '../../src/ui/components/MusicPlayerSheet.tsx';
import { MUSIC_CATALOG } from '../../src/data/musicCatalog.ts';
import { MusicPlayerState, MusicTrack } from '../../src/types/music.ts';

function makeMusicState(overrides: Partial<MusicPlayerState> = {}): MusicPlayerState {
  return {
    status: 'IDLE',
    currentTrackId: MUSIC_CATALOG[0]?.id ?? null,
    positionSec: 0,
    durationSec: MUSIC_CATALOG[0]?.duration ?? null,
    volume: 0.7,
    muted: false,
    shuffle: false,
    repeatMode: 'off',
    shuffledOrder: MUSIC_CATALOG.map((t) => t.id),
    syncWithSession: true,
    lastUpdatedAt: 1700000000000,
    lastError: null,
    ...overrides,
  };
}

function renderSheet(
  locale: 'en' | 'vi',
  catalog: readonly MusicTrack[],
  musicState: MusicPlayerState
): string {
  return renderToString(
    React.createElement(
      I18nProvider,
      { locale },
      React.createElement(MusicPlayerSheet, {
        isOpen: true,
        onClose: () => {},
        musicState,
        catalog,
        onPlayTrack: () => {},
        onPause: () => {},
        onResume: () => {},
        onStop: () => {},
        onNext: () => {},
        onPrevious: () => {},
        onSeek: () => {},
        onSetVolume: () => {},
        onToggleShuffle: () => {},
        onCycleRepeat: () => {},
        onToggleSyncWithSession: () => {},
      })
    )
  );
}

test('MusicPlayerSheet UI: renders EN & VI cleanly, displays full CC BY attribution, and has ZERO upload controls', () => {
  const htmlEn = renderSheet('en', MUSIC_CATALOG, makeMusicState({ status: 'PLAYING', positionSec: 45 }));
  const htmlVi = renderSheet('vi', MUSIC_CATALOG, makeMusicState({ status: 'PAUSED', positionSec: 12 }));

  assert.ok(htmlEn.includes('Focus Music Player'));
  assert.ok(htmlEn.includes('Twilight Market'));
  assert.ok(htmlEn.includes('Music by Purrple Cat (purrplecat.com), licensed under CC BY 4.0: creativecommons.org/licenses/by/4.0/'));
  assert.ok(htmlEn.includes('CC BY'));
  assert.ok(htmlEn.includes('0:45'));

  assert.ok(htmlVi.includes('Trình Phát Nhạc Tập Trung'));
  assert.ok(htmlVi.includes('Tạm dừng'));
  assert.ok(htmlVi.includes('Bản quyền &amp; Ghi công'));

  // Zero upload UI invariant
  assert.equal(htmlEn.includes('type="file"'), false, 'Must never render file upload input');
  assert.equal(htmlVi.includes('type="file"'), false, 'Must never render file upload input');
  assert.equal(htmlEn.toLowerCase().includes('youtube'), false);

  // Verify CC0 track (HoliznaCC0) renders cleanly without forcing CC BY "Attribution Required"
  const cc0Track = MUSIC_CATALOG.find((t) => t.id === 'holizna-cc0-into-the-mist');
  assert.ok(cc0Track, 'holizna-cc0-into-the-mist must exist in MUSIC_CATALOG');
  const cc0Html = renderSheet(
    'en',
    MUSIC_CATALOG,
    makeMusicState({
      currentTrackId: cc0Track.id,
      durationSec: cc0Track.duration ?? 130,
      status: 'PLAYING',
      positionSec: 15,
    })
  );
  assert.ok(cc0Html.includes('Into The Mist'));
  assert.ok(cc0Html.includes('HoliznaCC0'));
  assert.ok(cc0Html.includes('CC0'));
  assert.equal(cc0Html.includes('Attribution Required'), false);

  // Verify CC BY-SA 3.0 track (ikkun / ex. Barradeen) displays Attribution Required and full credit
  const ccBySaTrack = MUSIC_CATALOG.find((t) => t.id === 'ikkun-barradeen-whisper');
  assert.ok(ccBySaTrack, 'ikkun-barradeen-whisper must exist in MUSIC_CATALOG');
  const ccBySaHtml = renderSheet(
    'en',
    MUSIC_CATALOG,
    makeMusicState({
      currentTrackId: ccBySaTrack.id,
      durationSec: ccBySaTrack.duration ?? 66,
      status: 'PLAYING',
      positionSec: 10,
    })
  );
  assert.ok(ccBySaHtml.includes('whisper'));
  assert.ok(ccBySaHtml.includes('ikkun (ex. Barradeen)'));
  assert.ok(ccBySaHtml.includes('CC BY-SA'));
  assert.ok(ccBySaHtml.includes('free-stock-music.com'));
  assert.ok(ccBySaHtml.includes('Attribution Required'));
});

test('MusicPlayerSheet UI: dynamically renders arbitrary N tracks and handles empty catalog gracefully', () => {
  const emptyHtml = renderSheet(
    'en',
    [],
    makeMusicState({ currentTrackId: null, durationSec: null })
  );
  assert.ok(emptyHtml.includes('data-testid="music-empty-catalog"'));
  assert.ok(emptyHtml.includes('No bundled tracks available'));

  const extraTrack: MusicTrack = {
    id: 'dynamic-bonus-track',
    title: 'Dynamic Bonus Track',
    artist: 'Studio Test',
    album: 'Dynamic Pack',
    file: 'assets/music/dynamic-bonus.mp3',
    duration: 95,
    license: 'CC BY-SA',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    creator: 'Studio Test',
    sourceUrl: 'https://example.org',
    attribution: 'Music by Studio Test, CC BY-SA 4.0',
    isModified: true,
  };
  const extendedCatalog = [...MUSIC_CATALOG, extraTrack];
  const extendedHtml = renderSheet(
    'en',
    extendedCatalog,
    makeMusicState({ currentTrackId: extraTrack.id, durationSec: 95 })
  );
  assert.ok(extendedHtml.includes(`Bundled Tracks (${extendedCatalog.length})`));
  assert.ok(extendedHtml.includes('Dynamic Bonus Track'));
  assert.ok(extendedHtml.includes('Music by Studio Test, CC BY-SA 4.0'));
  assert.ok(extendedHtml.includes('Modified'));
});
