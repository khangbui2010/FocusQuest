import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { MusicPlayerSheet } from '../../src/ui/components/MusicPlayerSheet.tsx';
import { LOFI_BASE_URL, parseRemoteCatalog } from '../../src/data/musicCatalog.ts';
import { MusicPlayerState, MusicTrack } from '../../src/types/music.ts';

function getUiFixtureCatalog(): MusicTrack[] {
  return parseRemoteCatalog({
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
  }).tracks;
}

function makeMusicState(
  catalog: readonly MusicTrack[],
  overrides: Partial<MusicPlayerState> = {}
): MusicPlayerState {
  return {
    status: 'IDLE',
    currentTrackId: catalog[0]?.id ?? null,
    positionSec: 0,
    durationSec: catalog[0]?.durationSec ?? null,
    volume: 0.7,
    muted: false,
    shuffle: false,
    repeatMode: 'off',
    shuffledOrder: catalog.map((t) => t.id),
    syncWithSession: true,
    musicEnabled: false,
    playDuringBreak: false,
    pausedBySession: false,
    catalogUpdatedAt: '2026-11-17',
    lastUpdatedAt: 1700000000000,
    lastError: null,
    lastErrorCode: null,
    ...overrides,
  };
}

function renderSheet(
  locale: 'en' | 'vi',
  catalog: readonly MusicTrack[],
  musicState: MusicPlayerState,
  options: { isExpanded?: boolean; defaultCreditsOpen?: boolean } = {}
): string {
  return renderToString(
    React.createElement(
      I18nProvider,
      { locale },
      React.createElement(MusicPlayerSheet, {
        isExpanded: options.isExpanded ?? true,
        onToggleExpand: () => {},
        defaultCreditsOpen: options.defaultCreditsOpen ?? true,
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
        onTogglePlayDuringBreak: () => {},
        onRefreshCatalog: () => {},
      })
    )
  );
}

test('MusicPlayerSheet UI: renders streamed EN & VI UI, SPDX attribution, break toggle, refresh button, and ZERO upload controls', () => {
  const catalog = getUiFixtureCatalog();
  const htmlEn = renderSheet(
    'en',
    catalog,
    makeMusicState(catalog, { status: 'PLAYING', positionSec: 45 })
  );
  const htmlVi = renderSheet(
    'vi',
    catalog,
    makeMusicState(catalog, { status: 'PAUSED', positionSec: 12 })
  );

  assert.ok(htmlEn.includes('data-testid="music-mini-player"'));
  assert.ok(htmlEn.includes('Focus Lofi Music'));
  assert.ok(htmlEn.includes('Streamed Lofi library'));
  assert.equal(htmlEn.includes('Bundled offline MP3 library'), false);
  assert.ok(htmlEn.includes('Twilight Market'));
  assert.ok(htmlEn.includes('CC-BY-4.0'));
  assert.ok(htmlEn.includes('Purrple Cat'));
  assert.ok(htmlEn.includes('Attribution Required'));
  assert.ok(htmlEn.includes('0:45'));
  assert.ok(htmlEn.includes('data-testid="music-play-during-break-toggle"'));
  assert.ok(htmlEn.includes('data-testid="music-refresh-catalog-btn"'));

  assert.ok(htmlVi.includes('Nhạc Lofi tập trung'));
  assert.ok(htmlVi.includes('Thư viện nhạc Lofi trực tuyến'));
  assert.ok(htmlVi.includes('Tạm dừng'));
  assert.ok(htmlVi.includes('Ghi công &amp; giấy phép'));
  assert.ok(htmlVi.includes('Bản quyền &amp; Ghi công'));
  assert.ok(htmlVi.includes('Tiếp tục phát nhạc trong giờ nghỉ Pomodoro'));

  // Zero upload UI invariant
  assert.equal(htmlEn.includes('type="file"'), false, 'Must never render file upload input');
  assert.equal(htmlVi.includes('type="file"'), false, 'Must never render file upload input');

  // Verify CC0-1.0 track renders cleanly without forcing "Attribution Required"
  const cc0Track = catalog.find((t) => t.id === 'holizna-cc0-into-the-mist')!;
  const cc0Html = renderSheet(
    'en',
    catalog,
    makeMusicState(catalog, {
      currentTrackId: cc0Track.id,
      durationSec: cc0Track.durationSec ?? 130,
      status: 'PLAYING',
      positionSec: 15,
    })
  );
  assert.ok(cc0Html.includes('Into The Mist'));
  assert.ok(cc0Html.includes('HoliznaCC0'));
  assert.ok(cc0Html.includes('CC0-1.0'));
  assert.equal(cc0Html.includes('Attribution Required'), false);

  // Verify CC-BY-SA-3.0 track displays Attribution Required and full credit
  const ccBySaTrack = catalog.find((t) => t.id === 'ikkun-barradeen-whisper')!;
  const ccBySaHtml = renderSheet(
    'en',
    catalog,
    makeMusicState(catalog, {
      currentTrackId: ccBySaTrack.id,
      durationSec: ccBySaTrack.durationSec ?? 66,
      status: 'PLAYING',
      positionSec: 10,
    })
  );
  assert.ok(ccBySaHtml.includes('whisper'));
  assert.ok(ccBySaHtml.includes('ikkun (ex. Barradeen)'));
  assert.ok(ccBySaHtml.includes('CC-BY-SA-3.0'));
  assert.ok(ccBySaHtml.includes('soundcloud.com/ikkunwastaken'));
  assert.ok(ccBySaHtml.includes('Attribution Required'));
});

test('MusicPlayerSheet UI: handles empty catalog, dynamic extra tracks, and bilingual playback errors cleanly', () => {
  const catalog = getUiFixtureCatalog();
  const emptyHtml = renderSheet(
    'en',
    [],
    makeMusicState([], {
      currentTrackId: null,
      durationSec: null,
      status: 'ERROR',
      lastErrorCode: 'network',
      lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
    })
  );
  assert.ok(emptyHtml.includes('data-testid="music-empty-catalog"'));
  assert.ok(emptyHtml.includes('No Lofi tracks loaded yet'));
  assert.ok(emptyHtml.includes('data-testid="music-retry-catalog-btn"'));
  assert.ok(emptyHtml.includes('>Retry<'));
  assert.ok(emptyHtml.includes('data-testid="music-player-error"'));

  const emptyViHtml = renderSheet(
    'vi',
    [],
    makeMusicState([], {
      currentTrackId: null,
      durationSec: null,
      status: 'ERROR',
      lastErrorCode: 'network',
      lastError: 'Unable to load online Lofi catalog. Check your internet connection and retry.',
    })
  );
  assert.ok(emptyViHtml.includes('data-testid="music-empty-catalog"'));
  assert.ok(emptyViHtml.includes('data-testid="music-retry-catalog-btn"'));
  assert.ok(emptyViHtml.includes('>Thử lại<'));
  assert.ok(emptyViHtml.includes('Không thể tải danh sách nhạc Lofi trực tuyến'));

  const errorViHtml = renderSheet(
    'vi',
    catalog,
    makeMusicState(catalog, {
      status: 'ERROR',
      lastErrorCode: 'autoplay_blocked',
      lastError: 'Audio playback failed (autoplay_blocked).',
    })
  );
  assert.ok(errorViHtml.includes('Trình duyệt chặn tự động phát âm thanh'));

  const extraTrack: MusicTrack = {
    id: 'dynamic-bonus-track',
    title: 'Dynamic Bonus Track',
    artist: 'Studio Test',
    album: 'Dynamic Pack',
    file: 'dynamic-bonus.mp3',
    streamUrl: `${LOFI_BASE_URL}dynamic-bonus.mp3`,
    durationSec: 95,
    license: 'CC-BY-SA-3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    creator: 'Studio Test',
    sourceUrl: 'https://example.org',
    attribution: 'Dynamic Bonus Track by Studio Test — CC-BY-SA-3.0',
    isModified: true,
    modified: true,
  };
  const extendedCatalog = [...catalog, extraTrack];
  const extendedHtml = renderSheet(
    'en',
    extendedCatalog,
    makeMusicState(extendedCatalog, { currentTrackId: extraTrack.id, durationSec: 95 })
  );
  assert.ok(extendedHtml.includes(`Tracks (${extendedCatalog.length})`));
  assert.ok(extendedHtml.includes('Dynamic Bonus Track'));
  assert.ok(extendedHtml.includes('Modified'));
});
