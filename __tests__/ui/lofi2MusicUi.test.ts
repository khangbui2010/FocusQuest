import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../../src/App.tsx';
import { Header } from '../../src/ui/components/Header.tsx';
import { FocusSceneArea } from '../../src/ui/components/FocusSceneArea.tsx';
import {
  MusicPlayerSheet,
  formatShortLicenseBadge,
} from '../../src/ui/components/MusicPlayerSheet.tsx';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';
import { parseRemoteCatalog } from '../../src/data/musicCatalog.ts';
import { MusicPlayerState, MusicTrack } from '../../src/types/music.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { SessionCoordinator } from '../../src/background/sessionCoordinator.ts';
import { BlockingCoordinator } from '../../src/background/blockingCoordinator.ts';
import {
  MockAlarmsAdapter,
  MockBadgeAdapter,
  MockDNRAdapter,
  MockNotificationsAdapter,
} from '../mocks/chromeMock.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { MessageHandler } from '../../src/background/messageHandler.ts';
import { sendExtensionMessage } from '../../src/ui/services/extensionClient.ts';

function buildFixtureCatalog(): MusicTrack[] {
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
        id: 'purrple-cat-coffee-cat',
        title: 'Coffee Cat',
        artist: 'Purrple Cat',
        album: 'Morning Blend',
        durationSec: 140,
        file: 'purrple-cat-coffee-cat.mp3',
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
    musicEnabled: false,
    catalogUpdatedAt: '2026-11-17',
    lastUpdatedAt: 1700000000000,
    lastError: null,
    lastErrorCode: null,
    ...overrides,
  };
}

function renderPlayer(
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
        isExpanded: options.isExpanded ?? false,
        onToggleExpand: () => {},
        defaultCreditsOpen: options.defaultCreditsOpen ?? false,
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
        onRefreshCatalog: () => {},
      })
    )
  );
}

test('LOFI-2 Mini-Player: renders 56px bar with 3px progress, accessible buttons, and no duplicate player', () => {
  const catalog = buildFixtureCatalog();
  const collapsedHtml = renderPlayer(
    'vi',
    catalog,
    makeMusicState(catalog, { status: 'PLAYING', positionSec: 70, durationSec: 175 }),
    { isExpanded: false }
  );

  // Only one mini-player, sheet closed by default
  assert.equal((collapsedHtml.match(/data-testid="music-mini-player"/g) ?? []).length, 1);
  assert.ok(collapsedHtml.includes('h-[56px]'));
  assert.ok(collapsedHtml.includes('h-[3px]'));
  assert.ok(collapsedHtml.includes('width:40%'), '3px progress width must reflect 70 / 175 = 40%');

  // Mini-player metadata & accessible buttons with >= 36px (40px for play/pause) targets
  assert.ok(collapsedHtml.includes('Twilight Market'));
  assert.ok(collapsedHtml.includes('Purrple Cat · City Nights 2'));
  assert.ok(collapsedHtml.includes('data-testid="music-mini-prev-btn"'));
  assert.ok(collapsedHtml.includes('data-testid="music-mini-play-pause-btn"'));
  assert.ok(collapsedHtml.includes('data-testid="music-mini-next-btn"'));
  assert.ok(collapsedHtml.includes('data-testid="music-mini-expand-btn"'));
  assert.ok(collapsedHtml.includes('min-w-[36px] min-h-[36px]'));
  assert.ok(collapsedHtml.includes('w-[40px] h-[40px]'));
  assert.ok(collapsedHtml.includes('aria-label="Bài trước"'));
  assert.ok(collapsedHtml.includes('aria-label="Tạm dừng"'));
  assert.ok(collapsedHtml.includes('aria-label="Bài tiếp"'));
  assert.ok(collapsedHtml.includes('aria-label="Mở rộng trình phát nhạc"'));
  assert.ok(!collapsedHtml.includes('data-testid="music-player-sheet"'), 'Sheet must stay collapsed');

  // Live App popup hides mini-player outside focus sessions and on terminal screens; shows it ONLY during RUNNING/PAUSED sessions (including breaks)
  const idleAppHtml = renderToString(React.createElement(App));
  assert.ok(idleAppHtml.includes('data-testid="bottom-navbar"'));
  assert.ok(!idleAppHtml.includes('data-testid="music-mini-player"'), 'Mini-player must NOT render outside focus session');
  assert.ok(!idleAppHtml.includes('data-testid="music-player-open-btn"'), 'Header must not render duplicate music button');

  const activeSessionHtml = renderToString(
    React.createElement(App, {
      initialSession: {
        id: 'sess-lofi2-active',
        mode: 'COUNTDOWN',
        status: 'RUNNING',
        targetMinutes: 25,
        startedAt: 1700000000000,
        currentPauseStartedAt: null,
        totalPauseMs: 0,
        pauseCount: 0,
        pauseHistory: [],
        lastHeartbeatAt: 1700000000000,
        completedAt: null,
        rewardProcessed: false,
        lockedMultiplier: 1.0,
        profileId: 'p1',
      },
      initialTab: 'map',
    })
  );
  assert.ok(!activeSessionHtml.includes('data-testid="bottom-navbar"'));
  assert.ok(activeSessionHtml.includes('data-testid="music-mini-player"'), 'Mini-player must render at bottom during RUNNING session');

  const completedOutcomeHtml = renderToString(
    React.createElement(App, {
      initialSession: {
        id: 'sess-lofi2-done',
        mode: 'COUNTDOWN',
        status: 'COMPLETED',
        targetMinutes: 25,
        startedAt: 1700000000000,
        currentPauseStartedAt: null,
        totalPauseMs: 0,
        pauseCount: 0,
        pauseHistory: [],
        lastHeartbeatAt: 1700001500000,
        completedAt: 1700001500000,
        rewardProcessed: true,
        lockedMultiplier: 1.0,
        profileId: 'p1',
      },
    })
  );
  assert.ok(completedOutcomeHtml.includes('data-testid="outcome-exit-btn"'));
  assert.ok(!completedOutcomeHtml.includes('data-testid="music-mini-player"'), 'Mini-player must NOT render on session outcome screen');
});

test('LOFI-2 Mini-Player Empty/Error state: stays visible with Retry button in both EN and VI', () => {
  const emptyEn = renderPlayer(
    'en',
    [],
    makeMusicState([], { status: 'ERROR', currentTrackId: null, durationSec: null, lastErrorCode: 'network' })
  );
  assert.ok(emptyEn.includes('data-testid="music-mini-player"'));
  assert.ok(emptyEn.includes('Music not loaded yet'));
  assert.ok(emptyEn.includes('data-testid="music-mini-retry-btn"'));
  assert.ok(emptyEn.includes('>Retry<'));

  const emptyVi = renderPlayer(
    'vi',
    [],
    makeMusicState([], { status: 'ERROR', currentTrackId: null, durationSec: null, lastErrorCode: 'network' })
  );
  assert.ok(emptyVi.includes('data-testid="music-mini-player"'));
  assert.ok(emptyVi.includes('Chưa tải được nhạc'));
  assert.ok(emptyVi.includes('data-testid="music-mini-retry-btn"'));
  assert.ok(emptyVi.includes('>Thử lại<'));
});

test('LOFI-2 Bottom Sheet: taller rounded-t-[22px] sheet, 56px cover, 52px play button, no artist chips, equalizer, short license badges, and footer credits toggle', () => {
  const catalog = buildFixtureCatalog();
  const expandedVi = renderPlayer(
    'vi',
    catalog,
    makeMusicState(catalog, {
      status: 'PLAYING',
      currentTrackId: catalog[0].id,
      positionSec: 45,
      durationSec: 175,
    }),
    { isExpanded: true, defaultCreditsOpen: false }
  );

  // Sheet geometry & header
  assert.ok(expandedVi.includes('data-testid="music-sheet-backdrop"'));
  assert.ok(expandedVi.includes('backdrop-blur-xs'));
  assert.ok(expandedVi.includes('rounded-t-[22px]'));
  assert.ok(expandedVi.includes('h-[560px]'));
  assert.ok(expandedVi.includes('max-h-[95%]'));
  assert.ok(expandedVi.includes('Nhạc Lofi tập trung'));
  assert.ok(expandedVi.includes('data-testid="music-sheet-close-btn"'));

  // 56px cover (w-14 h-14) + 52px play/pause button
  assert.ok(expandedVi.includes('data-testid="music-sheet-cover"'));
  assert.ok(expandedVi.includes('w-14 h-14'));
  assert.ok(expandedVi.includes('w-[52px] h-[52px]'));

  // Artist filter chips removed so playlist has room for 4-5+ visible tracks
  assert.ok(!expandedVi.includes('data-testid="music-artist-filters"'));
  assert.ok(!expandedVi.includes('data-testid="music-artist-filter-all"'));

  // Track rows ~46px with equalizer + short badges (CC0, BY, BY-SA) while preserving full SPDX in Catalog
  assert.ok(expandedVi.includes('min-h-[46px]'));
  assert.ok(expandedVi.includes('data-testid="music-playing-equalizer"'));
  assert.equal(formatShortLicenseBadge('CC0-1.0'), 'CC0');
  assert.equal(formatShortLicenseBadge('CC-BY-4.0'), 'BY');
  assert.equal(formatShortLicenseBadge('CC-BY-SA-3.0'), 'BY-SA');
  assert.equal(catalog[0].license, 'CC-BY-4.0', 'Underlying catalog license must remain unmodified SPDX');

  // Footer button collapses attribution panel by default and exposes toggle
  assert.ok(expandedVi.includes('data-testid="music-credits-toggle-btn"'));
  assert.ok(expandedVi.includes('Ghi công &amp; giấy phép'));
  assert.ok(!expandedVi.includes('data-testid="music-credits-section"'), 'Credits panel closed by default');

  // When attribution drawer opened, displays active track SPDX attribution
  const withCredits = renderPlayer(
    'vi',
    catalog,
    makeMusicState(catalog, { status: 'PLAYING', currentTrackId: catalog[3].id, durationSec: 66 }),
    { isExpanded: true, defaultCreditsOpen: true }
  );
  assert.ok(withCredits.includes('data-testid="music-credits-section"'));
  assert.ok(withCredits.includes('CC-BY-SA-3.0'));
  assert.ok(withCredits.includes('soundcloud.com/ikkunwastaken'));
  assert.ok(!withCredits.includes('data-testid="music-sync-session-toggle"'), 'Obsolete stop-on-end checkbox must be removed');
  assert.ok(!withCredits.includes('data-testid="music-play-during-break-toggle"'), 'Obsolete play-during-break toggle must be removed');
});

test('LOFI-2 Header Anti-Overlap & Cleanup: zero music open button and collision-free 400px layout in EN & VI', () => {
  for (const locale of ['en', 'vi'] as const) {
    const html = renderToString(
      React.createElement(
        I18nProvider,
        { locale },
        React.createElement(Header, {
          economy: { focusCoins: 1250.5, totalXP: 2400, level: 7 },
          activeProfile: {
            id: 'prof-work',
            name: 'Deep Work / Research',
            allowedDomains: ['github.com'],
            createdAt: 1,
            updatedAt: 1,
          },
          isBlockingActive: true,
          isSessionActive: true,
          era: 'BRONZE_AGE',
          onOpenProfiles: () => {},
          onOpenHelp: () => {},
          onNavigateHome: () => {},
        })
      )
    );

    assert.ok(!html.includes('data-testid="music-player-open-btn"'));
    assert.ok(html.includes('data-testid="header-era-badge"'));
    assert.ok(html.includes('overflow-hidden'));
    assert.ok(html.includes('min-w-0'));
    assert.ok(html.includes('data-testid="help-btn"'));
    assert.ok(html.includes('data-testid="language-toggle-btn"'));
    assert.ok(html.includes('Lv. '));
    assert.ok(html.includes('1250.5'));
    if (locale === 'vi') {
      assert.ok(html.includes('Đồ Đồng'));
    } else {
      assert.ok(html.includes('Bronze Age'));
    }
  }
});

test('LOFI-2 FocusSceneArea: always bright daytime/sunset skies across all states with accessible scrim contrast', () => {
  for (const state of ['working', 'paused', 'resting'] as const) {
    const html = renderToString(
      React.createElement(
        I18nProvider,
        { locale: 'en' },
        React.createElement(FocusSceneArea, {
          era: 'STONE_AGE',
          sceneState: state,
          statusLabel: state.toUpperCase(),
          chimeEnabled: true,
          onToggleChime: () => {},
          chimeAriaLabel: 'Toggle chime',
          chimeTitle: 'Chime',
        })
      )
    );

    assert.ok(!html.includes('dark:from-slate-900'));
    assert.ok(!html.includes('dark:via-slate-800'));
    assert.ok(!html.includes('dark:via-indigo-950'));
    assert.ok(!html.includes('fq-scene-star'));
    assert.ok(html.includes('bg-slate-900/75'), 'Overlay chips must use dark translucent scrim for contrast on bright sky');
    assert.ok(html.includes('text-white'));
  }
});

test('LOFI-2 Persistence: SET_MUSIC_PLAYER_EXPANDED persists musicPlayerExpanded without changing schemaVersion (defaults false)', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const profileManager = new ProfileManager(storage);
  const alarms = new MockAlarmsAdapter();
  const notifications = new MockNotificationsAdapter();
  const badge = new MockBadgeAdapter();
  const dnr = new MockDNRAdapter();
  const blockingCoordinator = new BlockingCoordinator(dnr);
  const sessionCoordinator = new SessionCoordinator(
    storage,
    profileManager,
    alarms,
    notifications,
    badge,
    blockingCoordinator
  );
  const handler = new MessageHandler(sessionCoordinator, profileManager, storage);

  const initialFull = await handler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.equal(initialFull.success, true);
  const initialSettings = (initialFull.data as { settings?: { musicPlayerExpanded?: boolean } }).settings;
  assert.equal(Boolean(initialSettings?.musicPlayerExpanded), false);

  const invalidRes = await handler.handleMessage({
    action: 'SET_MUSIC_PLAYER_EXPANDED',
    payload: { expanded: 'yes' as unknown as boolean },
  });
  assert.equal(invalidRes.success, false);

  const expandRes = await handler.handleMessage({
    action: 'SET_MUSIC_PLAYER_EXPANDED',
    payload: { expanded: true },
  });
  assert.equal(expandRes.success, true);
  assert.equal((expandRes.data as { musicPlayerExpanded?: boolean }).musicPlayerExpanded, true);

  const afterFull = await handler.handleMessage({ action: 'GET_SESSION_STATE' });
  assert.equal(
    (afterFull.data as { settings?: { musicPlayerExpanded?: boolean } }).settings?.musicPlayerExpanded,
    true
  );

  // Preview simulator also persists musicPlayerExpanded cleanly
  const simRes = await sendExtensionMessage<{ musicPlayerExpanded?: boolean }>({
    action: 'SET_MUSIC_PLAYER_EXPANDED',
    payload: { expanded: true },
  });
  assert.equal(simRes.success, true);
  assert.equal(simRes.data?.musicPlayerExpanded, true);

  await sendExtensionMessage({
    action: 'SET_MUSIC_PLAYER_EXPANDED',
    payload: { expanded: false },
  });
});

test('LOFI-2 i18n parity: EN and VI dictionaries maintain 100% key parity including LOFI-2 keys', () => {
  assert.deepEqual(Object.keys(EN_MESSAGES).sort(), Object.keys(VI_MESSAGES).sort());
  assert.equal(EN_MESSAGES['music.lofiSheetTitle'], 'Focus Lofi Music');
  assert.equal(VI_MESSAGES['music.lofiSheetTitle'], 'Nhạc Lofi tập trung');
  assert.equal(VI_MESSAGES['music.miniNotLoaded'], 'Chưa tải được nhạc');
});
