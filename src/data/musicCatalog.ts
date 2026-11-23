import {
  CachedMusicCatalog,
  MusicTrack,
  RemoteMusicCatalog,
  RemoteMusicTrackRaw,
} from '../types/music.ts';

export const LOFI_BASE_URL = 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks/';
export const LOFI_CATALOG_URL = 'https://khangbui2010.github.io/FocusQuest-LOFI-archive/tracks.json';
export const LOFI_CATALOG_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const MAX_CATALOG_TRACKS = 200;
export const MAX_TRACK_STRING_LENGTH = 200;
export const MAX_TRACK_URL_LENGTH = 500;
export const MAX_TRACK_DURATION_SEC = 86400;
export const VALID_TRACK_ID_REGEX = /^[a-z0-9-]+$/;

export const ALLOWED_REMOTE_LICENSES = [
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
] as const;

const ALLOWED_REMOTE_LICENSE_SET = new Set<string>(ALLOWED_REMOTE_LICENSES);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ParsedRemoteCatalogResult {
  schemaVersion: number;
  updatedAt: string;
  tracks: MusicTrack[];
  skippedCount: number;
  skippedReasons: string[];
}

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
 * Validates that a remote license SPDX identifier belongs strictly to the approved commercial-friendly CC allowlist.
 */
export function isAllowedRemoteLicense(license: unknown): license is string {
  if (typeof license !== 'string') return false;
  return ALLOWED_REMOTE_LICENSE_SET.has(license.trim());
}

/**
 * Validates an HTTPS URL within strict length bounds. Rejects http:, javascript:, data:, file:, etc.
 */
export function isValidHttpsUrl(urlValue: unknown): urlValue is string {
  if (typeof urlValue !== 'string') return false;
  if (urlValue.length > MAX_TRACK_URL_LENGTH) return false;
  const trimmed = urlValue.trim();
  if (!trimmed || !/^https:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Strict validator for a remote track `file` field inside untrusted tracks.json:
 * rejects empty strings, oversized names, traversal ('..'), slashes ('/', '\'), URI schemes, or non-.mp3 files.
 */
export function isSafeRemoteTrackFilename(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false;
  if (filePath.length > MAX_TRACK_STRING_LENGTH) return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return false;
  }
  if (trimmed.includes(':') || trimmed.includes('?') || trimmed.includes('#')) {
    return false;
  }
  return trimmed.toLowerCase().endsWith('.mp3') && trimmed.length > 4;
}

/**
 * Validates that a track file entry is either a clean relative audio filename (e.g. 'track.mp3')
 * or an explicit HTTPS URL, rejecting local extension paths, traversal, and unsafe URI schemes.
 */
export function isValidStreamFileOrUrl(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  if (filePath.length > MAX_TRACK_URL_LENGTH) return false;
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

  if (trimmed.includes('/') || trimmed.includes(':') || trimmed.startsWith('assets/')) {
    return false;
  }

  return isSafeRemoteTrackFilename(trimmed);
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

  if (!isSafeRemoteTrackFilename(trimmed)) {
    throw new Error(`Invalid track stream file path: '${trimmed}'.`);
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(trimmed, normalizedBase).toString();
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

function validateRawRemoteTrackEntry(
  entry: unknown,
  seenIds: Set<string>
): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return 'entry is not an object';
  }
  const raw = entry as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.length > MAX_TRACK_STRING_LENGTH) {
    return 'invalid or oversized track id';
  }
  const id = raw.id.trim();
  if (!id || !VALID_TRACK_ID_REGEX.test(id)) {
    return `id '${id}' does not match ^[a-z0-9-]+$`;
  }
  if (seenIds.has(id)) {
    return `duplicate track id '${id}'`;
  }

  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > MAX_TRACK_STRING_LENGTH) {
    return `track '${id}' has missing or oversized title`;
  }
  if (typeof raw.artist !== 'string' || !raw.artist.trim() || raw.artist.length > MAX_TRACK_STRING_LENGTH) {
    return `track '${id}' has missing or oversized artist`;
  }
  if (raw.album !== undefined && (typeof raw.album !== 'string' || raw.album.length > MAX_TRACK_STRING_LENGTH)) {
    return `track '${id}' has invalid or oversized album`;
  }

  if (typeof raw.license !== 'string' || !raw.license.trim() || raw.license.length > MAX_TRACK_STRING_LENGTH) {
    return `track '${id}' has missing or oversized license`;
  }
  const trimmedLicense = raw.license.trim();
  if (!isAllowedRemoteLicense(trimmedLicense)) {
    return `track '${id}' has disallowed license '${trimmedLicense}'`;
  }

  if (!isValidHttpsUrl(raw.licenseUrl)) {
    return `track '${id}' has missing, oversized, or non-HTTPS licenseUrl`;
  }
  if (!isValidHttpsUrl(raw.sourceUrl)) {
    return `track '${id}' has missing, oversized, or non-HTTPS sourceUrl`;
  }

  if (!isSafeRemoteTrackFilename(raw.file)) {
    return `track '${id}' has unsafe or invalid file '${String(raw.file ?? '')}'`;
  }

  if (
    raw.durationSec !== undefined &&
    (typeof raw.durationSec !== 'number' ||
      !Number.isFinite(raw.durationSec) ||
      raw.durationSec < 0 ||
      raw.durationSec > MAX_TRACK_DURATION_SEC)
  ) {
    return `track '${id}' has invalid durationSec`;
  }

  return null;
}

export function parseRemoteCatalog(
  rawData: unknown,
  baseUrl: string = LOFI_BASE_URL
): ParsedRemoteCatalogResult {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
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
  if (record.tracks.length > MAX_CATALOG_TRACKS) {
    throw new Error(
      `Remote music catalog exceeds maximum allowed track count (${MAX_CATALOG_TRACKS}).`
    );
  }
  if (
    record.updatedAt !== undefined &&
    (typeof record.updatedAt !== 'string' || record.updatedAt.length > MAX_TRACK_STRING_LENGTH)
  ) {
    throw new Error('Remote music catalog updatedAt is invalid or exceeds maximum length.');
  }

  const tracks: MusicTrack[] = [];
  const seenIds = new Set<string>();
  const skippedReasons: string[] = [];

  for (const entry of record.tracks) {
    const rejectionReason = validateRawRemoteTrackEntry(entry, seenIds);
    if (rejectionReason) {
      skippedReasons.push(rejectionReason);
      continue;
    }

    try {
      const normalized = normalizeRemoteTrack(entry as RemoteMusicTrackRaw, baseUrl);
      seenIds.add(normalized.id);
      tracks.push(normalized);
    } catch (err) {
      skippedReasons.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (skippedReasons.length > 0) {
    console.warn(
      `[MusicCatalog] Skipped ${skippedReasons.length} invalid track(s): ${skippedReasons.join('; ')}`
    );
  }

  return {
    schemaVersion: record.schemaVersion,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt.trim() : '',
    tracks,
    skippedCount: skippedReasons.length,
    skippedReasons,
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

  let rawJson: unknown;
  try {
    rawJson = (await response.json()) as unknown;
  } catch {
    throw new Error('Malformed JSON in remote music catalog.');
  }

  const parsed = parseRemoteCatalog(rawJson, baseUrl);
  return {
    schemaVersion: parsed.schemaVersion,
    updatedAt: parsed.updatedAt,
    fetchedAt: Date.now(),
    sourceUrl: catalogUrl,
    tracks: parsed.tracks,
    skippedCount: parsed.skippedCount,
  };
}

export function validateMusicCatalog(
  catalog: readonly MusicTrack[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (catalog.length > MAX_CATALOG_TRACKS) {
    errors.push(`Catalog exceeds maximum allowed track count (${MAX_CATALOG_TRACKS}).`);
  }

  for (const track of catalog) {
    if (!track.id || !track.id.trim()) {
      errors.push('Track is missing a non-empty id.');
    } else if (!VALID_TRACK_ID_REGEX.test(track.id.trim())) {
      errors.push(`Track '${track.id}' has invalid id format (expected ^[a-z0-9-]+$).`);
    } else if (track.id.length > MAX_TRACK_STRING_LENGTH) {
      errors.push(`Track '${track.id}' id exceeds maximum length.`);
    } else if (seenIds.has(track.id)) {
      errors.push(`Duplicate track id '${track.id}'.`);
    } else {
      seenIds.add(track.id);
    }

    if (!track.title || !track.title.trim()) {
      errors.push(`Track '${track.id}' is missing title.`);
    } else if (track.title.length > MAX_TRACK_STRING_LENGTH) {
      errors.push(`Track '${track.id}' title exceeds maximum length.`);
    }

    if (!track.artist || !track.artist.trim()) {
      errors.push(`Track '${track.id}' is missing artist.`);
    } else if (track.artist.length > MAX_TRACK_STRING_LENGTH) {
      errors.push(`Track '${track.id}' artist exceeds maximum length.`);
    }

    if (!isValidStreamFileOrUrl(track.file)) {
      errors.push(
        `Track '${track.id}' has invalid stream file '${track.file}'. Expected remote filename or HTTPS URL ending with '.mp3'.`
      );
    }

    const dur = track.durationSec ?? track.duration;
    if (
      dur !== undefined &&
      (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0 || dur > MAX_TRACK_DURATION_SEC)
    ) {
      errors.push(`Track '${track.id}' has invalid durationSec '${String(dur)}'.`);
    }

    if (!track.license || !track.license.trim()) {
      errors.push(`Track '${track.id}' is missing license label.`);
    }

    if (track.licenseUrl && !isValidHttpsUrl(track.licenseUrl)) {
      errors.push(`Track '${track.id}' has non-HTTPS or oversized licenseUrl.`);
    }
    if (track.sourceUrl && !isValidHttpsUrl(track.sourceUrl)) {
      errors.push(`Track '${track.id}' has non-HTTPS or oversized sourceUrl.`);
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
