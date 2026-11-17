import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';

test('ProfileManager: creates profile with stable ID, trimmed name and empty allowlist', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const profile = await manager.createProfile('  Reading & Writing  ');
  assert.strictEqual(profile.name, 'Reading & Writing');
  assert.ok(profile.id.startsWith('prof_'));
  assert.deepStrictEqual(profile.allowedDomains, []);
  assert.strictEqual(profile.isDefault, true, 'First created profile is default');

  const retrieved = await manager.getProfileById(profile.id);
  assert.deepStrictEqual(retrieved, profile);
});

test('ProfileManager: rejects empty or whitespace-only name', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  await assert.rejects(
    async () => manager.createProfile('   '),
    /cannot be empty/
  );
});

test('ProfileManager: rejects duplicate profile name (case-insensitive)', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  await manager.createProfile('Chemistry');
  await assert.rejects(
    async () => manager.createProfile('chemistry'),
    /already exists/
  );
});

test('ProfileManager: renames profile while preserving ID, creation date and allowlist', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('Maths', ['khanacademy.org']);
  const renamed = await manager.renameProfile(p1.id, 'Advanced Mathematics');

  assert.strictEqual(renamed.id, p1.id, 'ID must remain stable');
  assert.strictEqual(renamed.name, 'Advanced Mathematics');
  assert.deepStrictEqual(renamed.allowedDomains, ['khanacademy.org'], 'Allowlist must be preserved');
  assert.strictEqual(renamed.createdAt, p1.createdAt);
});

test('ProfileManager: adds and removes domains with normalization and deduplication', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p = await manager.createProfile('Study');

  // Add domain with scheme and uppercase
  const updated1 = await manager.addDomainToProfile(p.id, 'HTTPS://WIKIPEDIA.ORG/wiki/Test');
  assert.deepStrictEqual(updated1.allowedDomains, ['wikipedia.org']);

  // Add duplicate domain after normalization -> should not add duplicate
  const updated2 = await manager.addDomainToProfile(p.id, 'wikipedia.org');
  assert.strictEqual(updated2.allowedDomains.length, 1);

  // Add wildcard subdomain
  const updated3 = await manager.addDomainToProfile(p.id, '*.github.com');
  assert.deepStrictEqual(updated3.allowedDomains, ['wikipedia.org', '*.github.com']);

  // Remove domain
  const updated4 = await manager.removeDomainFromProfile(p.id, 'wikipedia.org');
  assert.deepStrictEqual(updated4.allowedDomains, ['*.github.com']);
});

test('ProfileManager: rejects dangerous wildcards and invalid domains', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p = await manager.createProfile('Test');

  await assert.rejects(
    async () => manager.addDomainToProfile(p.id, '*'),
    /too broad/
  );

  await assert.rejects(
    async () => manager.addDomainToProfile(p.id, '*.com'),
    /too broad/
  );
});

test('ProfileManager: ensures allowlists of different profiles are completely independent', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('Profile A', ['coursera.org']);
  const p2 = await manager.createProfile('Profile B', ['stackoverflow.com']);

  await manager.addDomainToProfile(p1.id, 'wikipedia.org');

  const freshP1 = await manager.getProfileById(p1.id);
  const freshP2 = await manager.getProfileById(p2.id);

  assert.deepStrictEqual(freshP1?.allowedDomains, ['coursera.org', 'wikipedia.org']);
  assert.deepStrictEqual(freshP2?.allowedDomains, ['stackoverflow.com'], 'Profile B must NOT be modified');
});

test('ProfileManager: handles active profile selection and rejects non-existent ID', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('English');
  const p2 = await manager.createProfile('French');

  await manager.setActiveProfile(p2.id);
  const active = await manager.getActiveProfile();
  assert.strictEqual(active.id, p2.id);

  await assert.rejects(
    async () => manager.setActiveProfile('fake-id-123'),
    /not found/
  );
});

test('ProfileManager: deletes non-active profile safely', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('P1');
  const p2 = await manager.createProfile('P2');
  await manager.setActiveProfile(p1.id);

  const { deletedProfile, newActiveProfileId } = await manager.deleteProfile(p2.id);
  assert.strictEqual(deletedProfile.id, p2.id);
  assert.strictEqual(newActiveProfileId, p1.id);

  const profiles = await manager.getProfiles();
  assert.strictEqual(profiles.length, 1);
  assert.strictEqual(profiles[0].id, p1.id);
});

test('ProfileManager: deleting active profile with explicit replacement switches active safely', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('Active P1');
  const p2 = await manager.createProfile('Backup P2');
  await manager.setActiveProfile(p1.id);

  const { newActiveProfileId } = await manager.deleteProfile(p1.id, p2.id);
  assert.strictEqual(newActiveProfileId, p2.id);

  const active = await manager.getActiveProfile();
  assert.strictEqual(active.id, p2.id);
});

test('ProfileManager: deleting active profile without replacement falls back cleanly to remaining profile', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('P1');
  const p2 = await manager.createProfile('P2');
  await manager.setActiveProfile(p1.id);

  const { newActiveProfileId } = await manager.deleteProfile(p1.id);
  assert.strictEqual(newActiveProfileId, p2.id);

  const active = await manager.getActiveProfile();
  assert.strictEqual(active.id, p2.id, 'Active profile must point to remaining profile, not orphan');
});

test('ProfileManager: refuses to delete the only remaining profile in the system', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  const onlyProfile = await manager.createProfile('Sole Profile');

  await assert.rejects(
    async () => manager.deleteProfile(onlyProfile.id),
    /Cannot delete the only remaining profile/
  );
});

test('ProfileManager: maintains persistence across separate module re-instantiations', async () => {
  const adapter = new MemoryStorageAdapter();

  // First session
  {
    const storage = new StorageManager(adapter);
    const manager = new ProfileManager(storage);
    const p = await manager.createProfile('Persistent Profile', ['example.com']);
    await manager.setActiveProfile(p.id);
  }

  // Second fresh session reading same storage adapter
  {
    const storage = new StorageManager(adapter);
    const manager = new ProfileManager(storage);
    const profiles = await manager.getProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.strictEqual(profiles[0].name, 'Persistent Profile');
    assert.deepStrictEqual(profiles[0].allowedDomains, ['example.com']);

    const active = await manager.getActiveProfile();
    assert.strictEqual(active.name, 'Persistent Profile');
  }
});

test('ProfileManager: handles concurrent profile operations safely without data loss', async () => {
  const adapter = new MemoryStorageAdapter();
  const storage = new StorageManager(adapter);
  const manager = new ProfileManager(storage);

  // Concurrently create 10 distinct profiles
  const promises = Array.from({ length: 10 }, (_, i) =>
    manager.createProfile(`Concurrent Profile ${i}`)
  );
  await Promise.all(promises);

  const profiles = await manager.getProfiles();
  assert.strictEqual(profiles.length, 10, 'All 10 profiles must be persisted without race condition drops');
});
