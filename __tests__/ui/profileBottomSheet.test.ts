import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ProfileBottomSheet, ProfileBottomSheetProps } from '../../src/ui/components/ProfileBottomSheet.tsx';
import { FocusProfile } from '../../src/types/profiles.ts';
import { DomainNormalizer } from '../../src/core/profiles/domainNormalizer.ts';
import { ProfileManager } from '../../src/core/profiles/profileManager.ts';
import { MemoryStorageAdapter } from '../../src/storage/memoryStorageAdapter.ts';
import { StorageManager } from '../../src/storage/storageManager.ts';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';

function makeProfile(overrides: Partial<FocusProfile> = {}): FocusProfile {
  return {
    id: 'profile-study',
    name: 'Study & Research',
    allowedDomains: ['github.com', 'wikipedia.org'],
    isDefault: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function makeProps(overrides: Partial<ProfileBottomSheetProps> = {}): ProfileBottomSheetProps {
  const p1 = makeProfile();
  const p2 = makeProfile({
    id: 'profile-coding',
    name: 'Deep Coding',
    allowedDomains: ['localhost', 'typescriptlang.org'],
    isDefault: false,
  });
  return {
    isOpen: true,
    onClose: () => {},
    profiles: [p1, p2],
    activeProfile: p1,
    isSessionActive: false,
    isLoading: false,
    initialError: null,
    onSwitchProfile: async () => {},
    onCreateProfile: async () => {},
    onRenameProfile: async () => {},
    onDeleteProfile: async () => {},
    onAddDomain: async () => {},
    onRemoveDomain: async () => {},
    ...overrides,
  };
}

test('ProfileBottomSheet (5b): renders nothing when closed', () => {
  const html = renderToString(React.createElement(ProfileBottomSheet, makeProps({ isOpen: false })));
  assert.equal(html, '');
});

test('ProfileBottomSheet (5b): renders profiles, active badge, domain counts, and allowed domains when open', () => {
  const html = renderToString(React.createElement(ProfileBottomSheet, makeProps()));

  assert.ok(html.includes('data-testid="profile-bottom-sheet"'));
  assert.ok(html.includes('data-testid="profile-sheet-backdrop"'));
  assert.ok(html.includes('data-testid="profile-sheet-close-btn"'));
  assert.ok(html.includes('Focus Profiles &amp; Allowlist'));
  assert.ok(html.includes('Study &amp; Research'));
  assert.ok(html.includes('Deep Coding'));
  assert.ok(html.includes('Active'));
  assert.ok(html.includes('2 domains allowed'));
  assert.ok(html.includes('data-testid="switch-profile-profile-coding"'));
  assert.ok(html.includes('data-testid="rename-profile-profile-study"'));
  assert.ok(html.includes('data-testid="delete-profile-profile-coding"'));
  assert.ok(html.includes('github.com'));
  assert.ok(html.includes('wikipedia.org'));
  assert.ok(!html.includes('data-testid="profile-sheet-lock-banner"'));
});

test('ProfileBottomSheet (5b): strictly locks all mutations during active focus session with no bypass', () => {
  const html = renderToString(
    React.createElement(ProfileBottomSheet, makeProps({ isSessionActive: true }))
  );

  assert.ok(html.includes('data-testid="profile-sheet-lock-banner"'));
  assert.ok(
    html.includes('Profiles and allowlist are locked during a focus session. Finish your session first.')
  );
  assert.ok(html.includes('Allowlist is locked during session'));
  assert.match(html, /data-testid="new-profile-toggle-btn"[^>]*disabled/);
  assert.match(html, /data-testid="switch-profile-profile-coding"[^>]*disabled/);
  assert.match(html, /data-testid="rename-profile-profile-study"[^>]*disabled/);
  assert.match(html, /data-testid="delete-profile-profile-study"[^>]*disabled/);
  assert.ok(!html.includes('Unlock'), 'Must not contain any unlock/bypass control');
});

test('ProfileBottomSheet (5b): blocks deleting the only remaining profile and shows clear message', () => {
  const single = makeProfile();
  const html = renderToString(
    React.createElement(
      ProfileBottomSheet,
      makeProps({
        profiles: [single],
        activeProfile: single,
        initialError: 'Cannot delete the only remaining profile in the system.',
      })
    )
  );

  assert.match(html, /data-testid="delete-profile-profile-study"[^>]*disabled/);
  assert.ok(html.includes('Cannot delete the only remaining profile in the system.'));
  assert.ok(html.includes('data-testid="profile-sheet-error"'));
});

test('ProfileBottomSheet (5b): renders empty allowlist strict blocking notice and loading state cleanly', () => {
  const emptyProfile = makeProfile({ allowedDomains: [] });
  const html = renderToString(
    React.createElement(
      ProfileBottomSheet,
      makeProps({
        profiles: [emptyProfile],
        activeProfile: emptyProfile,
        isLoading: true,
      })
    )
  );

  assert.ok(html.includes('data-testid="profile-sheet-loading"'));
  assert.ok(html.includes('Updating profiles...'));
  assert.ok(html.includes('data-testid="profile-sheet-empty-domains"'));
  assert.ok(html.includes('Allowlist is Empty'));
  assert.ok(html.includes('Strict blocking mode: all external websites will be blocked during focus sessions.'));
});

test('ProfileBottomSheet (5b): renders backend validation/conflict errors cleanly', () => {
  const html = renderToString(
    React.createElement(
      ProfileBottomSheet,
      makeProps({
        initialError: "A profile with the name 'Deep Coding' already exists.",
      })
    )
  );

  assert.ok(html.includes('data-testid="profile-sheet-error"'));
  assert.ok(html.includes("A profile with the name &#x27;Deep Coding&#x27; already exists.") ||
    html.includes("A profile with the name 'Deep Coding' already exists."));

  const wildcardCheck = DomainNormalizer.validateAllowlistPattern('*.com');
  assert.equal(wildcardCheck.isValid, false);
  assert.ok(wildcardCheck.error && wildcardCheck.error.length > 0);
});

test('ProfileBottomSheet (5b): supports full Vietnamese localization via I18nProvider', () => {
  const emptyProfile = makeProfile({ allowedDomains: [] });
  const html = renderToString(
    React.createElement(
      I18nProvider,
      { locale: 'vi', children: React.createElement(ProfileBottomSheet, makeProps({
        profiles: [emptyProfile],
        activeProfile: emptyProfile,
        isSessionActive: true,
      })) }
    )
  );

  assert.ok(html.includes('Hồ sơ Tập trung &amp; Danh sách Cho phép'));
  assert.ok(html.includes('Hồ sơ và danh sách cho phép bị khóa khi phiên tập trung đang chạy. Hãy hoàn thành phiên trước.'));
  assert.ok(html.includes('Danh sách Cho phép Trống'));
  assert.ok(html.includes('+ Hồ sơ mới'));
});

test('ProfileBottomSheet (5b): backend rules parity - trim, 50-char limit, case-insensitive uniqueness, last-profile protection', async () => {
  const storage = new StorageManager(new MemoryStorageAdapter());
  const manager = new ProfileManager(storage);

  const p1 = await manager.createProfile('  Work  ');
  assert.equal(p1.name, 'Work');
  const p2 = await manager.createProfile('Reading');

  await assert.rejects(() => manager.createProfile('   '), /cannot be empty/i);
  await assert.rejects(() => manager.createProfile('x'.repeat(51)), /exceed 50 characters/i);
  await assert.rejects(() => manager.createProfile('work'), /already exists/i);
  await assert.rejects(() => manager.renameProfile(p2.id, 'WORK'), /already exists/i);

  const deleted = await manager.deleteProfile(p1.id);
  assert.equal(deleted.newActiveProfileId, p2.id);

  await assert.rejects(
    () => manager.deleteProfile(p2.id),
    /Cannot delete the only remaining profile in the system\./
  );
});
