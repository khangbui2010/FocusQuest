import { MusicLicenseType, MusicTrack } from '../types/music.ts';

const PURRPLE_CAT_CREDIT =
  'Music by Purrple Cat (purrplecat.com), licensed under CC BY 4.0: creativecommons.org/licenses/by/4.0/';

const HOLIZNA_CC0_CREDIT =
  'Music by HoliznaCC0 — CC0 1.0 Universal (Public Domain): freemusicarchive.org/music/holiznacc0/public-domain-lofi';

const IKKUN_BARRADEEN_WHISPER_CREDIT =
  'whisper by ikkun (ex. Barradeen) | https://soundcloud.com/ikkunwastaken — Royalty Free Music by https://www.free-stock-music.com — Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0): https://creativecommons.org/licenses/by-sa/3.0/deed.en_US';

/**
 * Internal music catalog bundled inside the Focus Quest Chrome Extension.
 * Supports arbitrary track counts; UI and MusicCoordinator read dynamically from this catalog.
 * Only bundled MP3 assets in `assets/music/` are permitted (no external audio URLs, no user uploads).
 */
export const MUSIC_CATALOG: readonly MusicTrack[] = Object.freeze([
  {
    id: 'purrple-cat-twilight-market',
    title: 'Twilight Market',
    artist: 'Purrple Cat',
    album: 'City Nights 2',
    file: 'assets/music/purrple-cat-city-nights-2-01-twilight-market_afce47e2.mp3',
    duration: 175,
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    creator: 'Purrple Cat',
    sourceUrl: 'https://purrplecat.com',
    attribution: PURRPLE_CAT_CREDIT,
    isModified: false,
  },
  {
    id: 'purrple-cat-rooftop-rendezvous',
    title: 'Rooftop Rendezvous',
    artist: 'Purrple Cat',
    album: 'City Nights 2',
    file: 'assets/music/purrple-cat-city-nights-2-02-rooftop-rendezvous_25a6b224.mp3',
    duration: 184,
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    creator: 'Purrple Cat',
    sourceUrl: 'https://purrplecat.com',
    attribution: PURRPLE_CAT_CREDIT,
    isModified: false,
  },
  {
    id: 'purrple-cat-lonely',
    title: 'Lonely',
    artist: 'Purrple Cat',
    album: 'City Nights 2',
    file: 'assets/music/purrple-cat-city-nights-2-07-lonely_26f60337.mp3',
    duration: 176,
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    creator: 'Purrple Cat',
    sourceUrl: 'https://purrplecat.com',
    attribution: PURRPLE_CAT_CREDIT,
    isModified: false,
  },
  {
    id: 'purrple-cat-walking-to-the-park-at-3am',
    title: 'Walking to the Park at 3 A.M.',
    artist: 'Purrple Cat',
    album: 'Indigo Dreams',
    file: 'assets/music/purrple-cat-indigo-dreams-07-walking-to-the-park-at-3-a-m_8fae33b8.mp3',
    duration: 202,
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    creator: 'Purrple Cat',
    sourceUrl: 'https://purrplecat.com',
    attribution: PURRPLE_CAT_CREDIT,
    isModified: false,
  },
  {
    id: 'purrple-cat-starlit-beach',
    title: 'Starlit Beach',
    artist: 'Purrple Cat',
    album: 'Sea of Stars 2',
    file: 'assets/music/purrple-cat-sea-of-stars-2-10-starlit-beach_715e8b5f.mp3',
    duration: 174,
    license: 'CC BY',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    creator: 'Purrple Cat',
    sourceUrl: 'https://purrplecat.com',
    attribution: PURRPLE_CAT_CREDIT,
    isModified: false,
  },
  {
    id: 'holizna-cc0-into-the-mist',
    title: 'Into The Mist',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'assets/music/holizna-cc0-into-the-mist.mp3',
    duration: 130,
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
    attribution: HOLIZNA_CC0_CREDIT,
    isModified: false,
  },
  {
    id: 'holizna-cc0-before-everything',
    title: 'Before Everything',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'assets/music/holizna-cc0-before-everything.mp3',
    duration: 171,
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
    attribution: HOLIZNA_CC0_CREDIT,
    isModified: false,
  },
  {
    id: 'holizna-cc0-theta-frequency',
    title: 'Theta Frequency',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'assets/music/holizna-cc0-theta-frequency.mp3',
    duration: 127,
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
    attribution: HOLIZNA_CC0_CREDIT,
    isModified: false,
  },
  {
    id: 'holizna-cc0-birds',
    title: 'Birds',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'assets/music/holizna-cc0-birds.mp3',
    duration: 170,
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
    attribution: HOLIZNA_CC0_CREDIT,
    isModified: false,
  },
  {
    id: 'holizna-cc0-when-time-called-me-darling',
    title: 'When Time Called Me Darling',
    artist: 'HoliznaCC0',
    album: 'Public Domain Lofi',
    file: 'assets/music/holizna-cc0-when-time-called-me-darling.mp3',
    duration: 215,
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    creator: 'HoliznaCC0',
    sourceUrl: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi',
    attribution: HOLIZNA_CC0_CREDIT,
    isModified: false,
  },
  {
    id: 'ikkun-barradeen-whisper',
    title: 'whisper',
    artist: 'ikkun (ex. Barradeen)',
    album: 'Free Stock Music',
    file: 'assets/music/ikkun-barradeen-whisper.mp3',
    duration: 66,
    license: 'CC BY-SA',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en_US',
    creator: 'ikkun (ex. Barradeen)',
    sourceUrl: 'https://soundcloud.com/ikkunwastaken',
    attribution: IKKUN_BARRADEEN_WHISPER_CREDIT,
    isModified: false,
  },
]);

const VALID_LICENSES: ReadonlySet<MusicLicenseType> = new Set(['CC0', 'CC BY', 'CC BY-SA']);

export function isAttributionRequired(license: MusicLicenseType): boolean {
  return license === 'CC BY' || license === 'CC BY-SA';
}

export function isBundledMp3Path(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed.toLowerCase().endsWith('.mp3')) return false;
  if (!trimmed.startsWith('assets/music/')) return false;
  if (
    trimmed.includes('..') ||
    trimmed.includes('://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('\\')
  ) {
    return false;
  }
  return true;
}

export function validateMusicCatalog(
  catalog: readonly MusicTrack[] = MUSIC_CATALOG
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const track of catalog) {
    if (!track.id || !track.id.trim()) {
      errors.push('Track is missing a non-empty id.');
    } else if (seenIds.has(track.id)) {
      errors.push(`Duplicate track id '${track.id}'.`);
    } else {
      seenIds.add(track.id);
    }

    if (!track.title || !track.title.trim()) {
      errors.push(`Track '${track.id}' is missing title.`);
    }

    if (!isBundledMp3Path(track.file)) {
      errors.push(
        `Track '${track.id}' has invalid bundled MP3 path '${track.file}'. Must start with 'assets/music/' and end with '.mp3'.`
      );
    }

    if (
      track.duration !== undefined &&
      (typeof track.duration !== 'number' || !Number.isFinite(track.duration) || track.duration < 0)
    ) {
      errors.push(`Track '${track.id}' has invalid duration '${String(track.duration)}'.`);
    }

    if (!VALID_LICENSES.has(track.license)) {
      errors.push(`Track '${track.id}' has unsupported license '${String(track.license)}'.`);
    }

    if (isAttributionRequired(track.license)) {
      if (!track.creator.trim()) {
        errors.push(`Track '${track.id}' (${track.license}) requires non-empty creator.`);
      }
      if (!track.attribution.trim()) {
        errors.push(`Track '${track.id}' (${track.license}) requires non-empty attribution.`);
      }
      if (!track.licenseUrl.trim()) {
        errors.push(`Track '${track.id}' (${track.license}) requires non-empty licenseUrl.`);
      }
      if (!track.sourceUrl.trim()) {
        errors.push(`Track '${track.id}' (${track.license}) requires non-empty sourceUrl.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getTrackById(
  trackId: string | null | undefined,
  catalog: readonly MusicTrack[] = MUSIC_CATALOG
): MusicTrack | null {
  if (!trackId) return null;
  return catalog.find((track) => track.id === trackId) ?? null;
}

export function resolveTrackAssetUrl(file: string): string {
  const normalized = file.replace(/^\/+/, '');
  if (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    typeof chrome.runtime.getURL === 'function'
  ) {
    return chrome.runtime.getURL(normalized);
  }
  return `./${normalized}`;
}

export function formatMusicDuration(totalSeconds: number | null | undefined): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }
  const rounded = Math.floor(totalSeconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
