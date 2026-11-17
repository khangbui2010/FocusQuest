import {
  CachedMusicCatalog,
  MusicTrack,
  RemoteMusicCatalog,
  RemoteMusicTrackRaw,
} from '../types/music.ts';

export const LOFI_BASE_URL = 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks/';
export const LOFI_CATALOG_URL = 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json';
export const LOFI_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Determine if a track's license requires attribution (e.g. CC-BY-4.0, CC-BY-SA-3.0, CC BY, CC BY-SA).
 * Preserves exact license label semantics from tracks.json; CC0* does not require attribution.
 */
export function isAttributionRequired(license: string): boolean {
  if (!license || typeof license !== 'string') return false;
  const trimmed = license.trim();
  if (/^cc0\b/i.test(trimmed)) return false;
  return /^cc[\s-]*by/i.test(trimmed);
}

/**
 * Validates that a track file entry is either a clean relative audio filename (e.g. 'track.mp3')
 * or an explicit HTTPS URL, rejecting local extension paths, traversal, and unsafe URI schemes.
 */
export function isValidStreamFileOrUrl(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;
  if (/^(data|blob|file|javascript):/i.test(trimmed)) return false;
  if (/^http:\/\//i.test(trimmed)) return false;
  if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
    return false;
  }

  if (/^https:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' && parsed.pathname.toLowerCase().endsWith('.mp3');
    } catch {
      return false;
    }
  }

  if (trimmed.includes('://') || trimmed.startsWith('assets/music/')) {
    return false;
  }

  return trimmed.toLowerCase().endsWith('.mp3');
}

/**
 * Resolves a track `file` value (or track object) into an HTTPS streaming URL under LOFI_BASE_URL.
 */
export function resolveTrackStreamUrl(
  fileOrTrack: string | Pick<MusicTrack, 'file' | 'streamUrl'>,
  baseUrl: string = LOFI_BASE_URL
): string {
  const file =
    typeof fileOrTrack === 'string'
      ? fileOrTrack
      : fileOrTrack.streamUrl || fileOrTrack.file;

  const trimmed = (file || '').trim();
  if (!trimmed) {
    throw new Error('Track file path is empty.');
  }

  if (/^https:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS streaming URLs are supported.');
    }
    return parsed.toString();
  }

  if (!isValidStreamFileOrUrl(trimmed)) {
    throw new Error(`Invalid track stream file path: '${trimmed}'.`);
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanRelative = trimmed.replace(/^\/+/, '');
  return new URL(cleanRelative, normalizedBase).toString();
}

export function buildTrackAttribution(raw: {
  title: string;
  artist: string;
  license: string;
  licenseUrl?: string;
  sourceUrl?: string;
}): string {
  const title = raw.title?.trim() || 'Untitled';
  const artist = raw.artist?.trim() || 'Unknown Artist';
  const license = raw.license?.trim() || 'Unknown License';
  const sourcePart = raw.sourceUrl?.trim() ? ` (${raw.sourceUrl.trim()})` : '';
  const licensePart = raw.licenseUrl?.trim()
    ? `${license}: ${raw.licenseUrl.trim()}`
    : license;
  return `${title} by ${artist}${sourcePart} — ${licensePart}`;
}

export function normalizeRemoteTrack(
  raw: RemoteMusicTrackRaw,
  baseUrl: string = LOFI_BASE_URL
): MusicTrack {
  const durationSec =
    typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec) && raw.durationSec >= 0
      ? raw.durationSec
      : undefined;
  const modified = Boolean(raw.modified);
  const artist = String(raw.artist ?? '').trim();
  const license = String(raw.license ?? '').trim();
  const licenseUrl = String(raw.licenseUrl ?? '').trim();
  const sourceUrl = String(raw.sourceUrl ?? '').trim();
  const file = String(raw.file ?? '').trim();

  return {
    id: String(raw.id ?? '').trim(),
    title: String(raw.title ?? '').trim(),
    artist,
    album: String(raw.album ?? '').trim(),
    file,
    streamUrl: resolveTrackStreamUrl(file, baseUrl),
    durationSec,
    duration: durationSec,
    license,
    licenseUrl,
    creator: artist,
    sourceUrl,
    attribution: buildTrackAttribution({
      title: String(raw.title ?? ''),
      artist,
      license,
      licenseUrl,
      sourceUrl,
    }),
    isModified: modified,
    modified,
  };
}

export function parseRemoteCatalog(
  rawData: unknown,
  baseUrl: string = LOFI_BASE_URL
): { schemaVersion: number; updatedAt: string; tracks: MusicTrack[] } {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid remote music catalog payload.');
  }

  const record = rawData as Partial<RemoteMusicCatalog>;
  if (typeof record.schemaVersion !== 'number' || !Number.isFinite(record.schemaVersion)) {
    throw new Error('Remote music catalog is missing schemaVersion.');
  }
  if (record.schemaVersion !== 1) {
    throw new Error(`Unsupported remote music catalog schemaVersion: ${record.schemaVersion}.`);
  }
  if (!Array.isArray(record.tracks)) {
    throw new Error('Remote music catalog is missing tracks array.');
  }

  const tracks = record.tracks.map((entry) => normalizeRemoteTrack(entry, baseUrl));
  const validation = validateMusicCatalog(tracks);
  if (!validation.valid) {
    throw new Error(`Invalid remote music catalog entries: ${validation.errors.join('; ')}`);
  }

  return {
    schemaVersion: record.schemaVersion,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    tracks,
  };
}

export function isCatalogCacheFresh(
  cache: CachedMusicCatalog | null | undefined,
  now: number = Date.now(),
  ttlMs: number = LOFI_CATALOG_CACHE_TTL_MS
): boolean {
  if (!cache || !Array.isArray(cache.tracks) || cache.tracks.length === 0) {
    return false;
  }
  if (typeof cache.fetchedAt !== 'number' || !Number.isFinite(cache.fetchedAt)) {
    return false;
  }
  const age = now - cache.fetchedAt;
  return age >= 0 && age < ttlMs;
}

export async function fetchRemoteMusicCatalog(
  fetchFn: FetchLike = (input, init) => fetch(input, init),
  catalogUrl: string = LOFI_CATALOG_URL,
  baseUrl: string = LOFI_BASE_URL
): Promise<CachedMusicCatalog> {
  if (typeof fetchFn !== 'function') {
    throw new Error('Fetch API is unavailable to load remote music catalog.');
  }

  const response = await fetchFn(catalogUrl, { cache: 'no-cache' });
  if (!response || !response.ok) {
    const statusText = response ? `HTTP ${response.status}` : 'No response';
    throw new Error(`Failed to fetch remote music catalog (${statusText}).`);
  }

  const rawJson = (await response.json()) as unknown;
  const parsed = parseRemoteCatalog(rawJson, baseUrl);
  return {
    schemaVersion: parsed.schemaVersion,
    updatedAt: parsed.updatedAt,
    fetchedAt: Date.now(),
    sourceUrl: catalogUrl,
    tracks: parsed.tracks,
  };
}

export function validateMusicCatalog(
  catalog: readonly MusicTrack[]
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

    if (!isValidStreamFileOrUrl(track.file)) {
      errors.push(
        `Track '${track.id}' has invalid stream file '${track.file}'. Expected remote filename or HTTPS URL ending with '.mp3'.`
      );
    }

    const dur = track.durationSec ?? track.duration;
    if (
      dur !== undefined &&
      (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0)
    ) {
      errors.push(`Track '${track.id}' has invalid durationSec '${String(dur)}'.`);
    }

    if (!track.license || !track.license.trim()) {
      errors.push(`Track '${track.id}' is missing license label.`);
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
  catalog: readonly MusicTrack[] = []
): MusicTrack | null {
  if (!trackId) return null;
  return catalog.find((track) => track.id === trackId) ?? null;
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
