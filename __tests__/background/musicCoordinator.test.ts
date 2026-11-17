import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { STORAGE_KEYS } from '../../src/storage/storageKeys.ts';
import { IOffscreenAdapter } from '../../src/chrome/offscreenAdapter.ts';
import {
  AudioStatusSnapshot,
  MusicTrack,
  OffscreenMusicCommand,
} from '../../src/types/music.ts';
import { MusicCoordinator } from '../../src/background/musicCoordinator.ts';
import { MUSIC_CATALOG } from '../../src/data/musicCatalog.ts';

class MockOffscreenAdapter implements IOffscreenAdapter {
  public documentOpen = false;
  public ensureCount = 0;
  public closeCount = 0;
  public commands: OffscreenMusicCommand[] = [];
  public failNextCommandError: Error | null = null;
  public audioStatus: AudioStatusSnapshot = {
    isPlaying: false,
    paused: true,
    currentTime: 0,
    duration: null,
    trackId: null,
    src: '',
  };

  async hasDocument(): Promise<boolean> {
    return this.documentOpen;
  }

  async ensureDocument(): Promise<void> {
    this.ensureCount++;
    this.documentOpen = true;
  }

  async closeDocument(): Promise<void> {
    this.closeCount++;
    this.documentOpen = false;
    this.audioStatus = {
      isPlaying: false,
      paused: true,
      currentTime: 0,
      duration: null,
      trackId: null,
      src: '',
    };
  }

  async sendCommand<T = unknown>(command: OffscreenMusicCommand): Promise<T | null> {
    this.commands.push(command);
    if (this.failNextCommandError) {
      const err = this.failNextCommandError;
      this.failNextCommandError = null;
      throw err;
    }

    switch (command.action) {
      case 'LOAD_AND_PLAY':
        this.audioStatus = {
          isPlaying: true,
          paused: false,
          currentTime: command.payload.positionSec,
          duration: 180,
          trackId: command.payload.trackId,
          src: command.payload.trackUrl,
        };
        return { ...this.audioStatus } as unknown as T;
      case 'PAUSE':
        this.audioStatus = { ...this.audioStatus, isPlaying: false, paused: true };
        return { ...this.audioStatus } as unknown as T;
      case 'RESUME':
        this.audioStatus = { ...this.audioStatus, isPlaying: true, paused: false };
        return { ...this.audioStatus } as unknown as T;
      case 'STOP':
        this.audioStatus = {
          isPlaying: false,
          paused: true,
          currentTime: 0,
          duration: null,
          trackId: null,
          src: '',
        };
        return { ...this.audioStatus } as unknown as T;
      case 'SEEK':
        this.audioStatus = { ...this.audioStatus, currentTime: command.payload.positionSec };
        return { ...this.audioStatus } as unknown as T;
      case 'SET_VOLUME':
        return { ...this.audioStatus } as unknown as T;
      case 'GET_AUDIO_STATUS':
        return { ...this.audioStatus } as unknown as T;
      default:
        return null;
    }
  }
}

test('MusicCoordinator: Play, Pause, Resume, Stop, Seek, Volume/Mute, Next, Previous', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const mc = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);

  // 1. Play default first track
  let state = await mc.playTrack();
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, MUSIC_CATALOG[0].id);
  assert.equal(offscreen.documentOpen, true);

  // 2. Seek to 42s and Pause
  state = await mc.seek(42);
  assert.equal(state.positionSec, 42);
  state = await mc.pause();
  assert.equal(state.status, 'PAUSED');
  assert.equal(state.positionSec, 42);

  // 3. Resume preserves paused position
  state = await mc.resume();
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.positionSec, 42);

  // 4. Volume & Mute
  state = await mc.setVolume(0.4, true);
  assert.equal(state.volume, 0.4);
  assert.equal(state.muted, true);

  // 5. Next & Previous dynamically traverse catalog
  state = await mc.next();
  assert.equal(state.currentTrackId, MUSIC_CATALOG[1].id);
  assert.equal(state.positionSec, 0);

  state = await mc.previous();
  assert.equal(state.currentTrackId, MUSIC_CATALOG[0].id);

  // Wrap around Previous -> last track
  state = await mc.previous();
  assert.equal(state.currentTrackId, MUSIC_CATALOG[MUSIC_CATALOG.length - 1].id);

  // 6. Stop closes offscreen document and resets position
  state = await mc.stop();
  assert.equal(state.status, 'STOPPED');
  assert.equal(state.positionSec, 0);
  assert.equal(offscreen.documentOpen, false);
});

test('MusicCoordinator: Repeat modes (off, all, one) and Shuffle queue handling', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const tracks: MusicTrack[] = MUSIC_CATALOG.slice(0, 3);
  const mc = new MusicCoordinator(storage, offscreen, tracks);

  // Repeat ONE replays same track on OFFSCREEN_TRACK_ENDED
  await mc.playTrack(tracks[1].id);
  await mc.setRepeatMode('one');
  let state = await mc.handleOffscreenEvent({
    scope: 'FQ_MUSIC_EVENT',
    action: 'OFFSCREEN_TRACK_ENDED',
    payload: { trackId: tracks[1].id },
  });
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, tracks[1].id);

  // Repeat OFF stops cleanly at last track
  await mc.setRepeatMode('off');
  await mc.playTrack(tracks[2].id);
  state = await mc.handleOffscreenEvent({
    scope: 'FQ_MUSIC_EVENT',
    action: 'OFFSCREEN_TRACK_ENDED',
    payload: { trackId: tracks[2].id },
  });
  assert.equal(state.status, 'STOPPED');
  assert.equal(offscreen.documentOpen, false);

  // Repeat ALL wraps last track -> first track
  await mc.setRepeatMode('all');
  await mc.playTrack(tracks[2].id);
  state = await mc.handleOffscreenEvent({
    scope: 'FQ_MUSIC_EVENT',
    action: 'OFFSCREEN_TRACK_ENDED',
    payload: { trackId: tracks[2].id },
  });
  assert.equal(state.status, 'PLAYING');
  assert.equal(state.currentTrackId, tracks[0].id);

  // Shuffle produces full permutation anchored on currentTrackId
  state = await mc.setShuffle(true);
  assert.equal(state.shuffle, true);
  assert.equal(state.shuffledOrder.length, 3);
  assert.equal(state.shuffledOrder[0], tracks[0].id);
  assert.deepEqual([...state.shuffledOrder].sort(), tracks.map((t) => t.id).sort());
});

test('MusicCoordinator: Service Worker restart recovery syncs with live Offscreen Document and recovers if closed', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();

  // Case A: SW restarts while Offscreen Document is STILL playing track 2 at 65s
  const mc1 = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);
  await mc1.playTrack(MUSIC_CATALOG[1].id);
  offscreen.audioStatus = {
    isPlaying: true,
    paused: false,
    currentTime: 65,
    duration: 184,
    trackId: MUSIC_CATALOG[1].id,
    src: MUSIC_CATALOG[1].file,
  };

  // Fresh MusicCoordinator simulates restarted Service Worker
  const commandsBeforeRehydrate = offscreen.commands.length;
  const mc2 = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);
  const rehydrated = await mc2.ensureInitialized();

  assert.equal(rehydrated.status, 'PLAYING');
  assert.equal(rehydrated.currentTrackId, MUSIC_CATALOG[1].id);
  assert.equal(rehydrated.positionSec, 65);
  // Must have queried GET_AUDIO_STATUS without calling LOAD_AND_PLAY again (no audio interruption)
  const newCmds = offscreen.commands.slice(commandsBeforeRehydrate);
  assert.equal(newCmds.some((c) => c.action === 'GET_AUDIO_STATUS'), true);
  assert.equal(newCmds.some((c) => c.action === 'LOAD_AND_PLAY'), false);

  // Case B: SW restarts after Offscreen Document was reclaimed while PLAYING at 65s
  offscreen.documentOpen = false;
  const mc3 = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);
  const recovered = await mc3.ensureInitialized();
  assert.equal(recovered.status, 'PLAYING');
  assert.equal(recovered.positionSec, 65);
  assert.equal(offscreen.documentOpen, true);
});

test('MusicCoordinator: never stores MP3 binary data in storage, only lightweight playback state', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const offscreen = new MockOffscreenAdapter();
  const mc = new MusicCoordinator(storage, offscreen, MUSIC_CATALOG);

  await mc.playTrack(MUSIC_CATALOG[0].id);
  const rawStored = await adapter.get<Record<string, unknown>>(STORAGE_KEYS.MUSIC_STATE);
  assert.ok(rawStored);
  const serialized = JSON.stringify(rawStored);
  assert.ok(serialized.length < 2048, 'Persisted music state must remain lightweight metadata');
  assert.equal(serialized.includes('ID3'), false);
  assert.equal(serialized.includes('base64'), false);
});
