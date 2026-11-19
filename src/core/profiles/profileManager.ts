import { FocusProfile } from '../../types/profiles.ts';
import { AppError, ErrorCode } from '../../types/errors.ts';
import { StorageManager } from '../../storage/storageManager.ts';
import { DomainNormalizer } from './domainNormalizer.ts';
import { TimerStateMachine } from '../timer/timerStateMachine.ts';

export class ProfileManager {
  constructor(private storage: StorageManager) {}

  /**
   * Asserts that no focus session is currently active (RUNNING or PAUSED).
   * Throws an error to prevent allowlist or profile modifications during an active session.
   */
  private async assertNoActiveSession(
    errorMessage?: string,
    code: ErrorCode = 'ACTIVE_SESSION_LOCK_ALLOWLIST'
  ): Promise<void> {
    const session = await this.storage.getCurrentSession();
    if (session && TimerStateMachine.isActive(session.status)) {
      throw new AppError(
        code,
        errorMessage || 'Allowlist cannot be modified during a focus session. Finish your session first.'
      );
    }
  }

  /**
   * Generate an immutable, unique ID for a profile.
   */
  private generateId(): string {
    return `prof_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Validate profile name: non-empty, trimmed, within reasonable bounds (1-50 chars).
   */
  private validateName(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new AppError('PROFILE_NAME_EMPTY', 'Profile name cannot be empty or whitespace.');
    }
    if (trimmed.length > 50) {
      throw new AppError('PROFILE_NAME_TOO_LONG', 'Profile name cannot exceed 50 characters.');
    }
    return trimmed;
  }

  /**
   * Check for duplicate name across existing profiles (case-insensitive),
   * optionally excluding a specific profile ID (for rename operations).
   */
  private ensureUniqueName(
    name: string,
    existingProfiles: FocusProfile[],
    excludeProfileId?: string
  ): void {
    const lower = name.toLowerCase();
    const duplicate = existingProfiles.some(
      (p) => p.id !== excludeProfileId && p.name.trim().toLowerCase() === lower
    );
    if (duplicate) {
      throw new AppError(
        'PROFILE_DUPLICATE_NAME',
        `A profile with the name '${name}' already exists.`,
        { name }
      );
    }
  }

  /**
   * Retrieve all profiles.
   */
  async getProfiles(): Promise<FocusProfile[]> {
    return this.storage.getProfiles();
  }

  /**
   * Retrieve a profile by ID, or null if not found.
   */
  async getProfileById(profileId: string): Promise<FocusProfile | null> {
    const profiles = await this.storage.getProfiles();
    return profiles.find((p) => p.id === profileId) ?? null;
  }

  /**
   * Create a new profile with an immutable ID and empty/custom allowlist.
   */
  async createProfile(name: string, initialDomains: string[] = []): Promise<FocusProfile> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Cannot create profile during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_PROFILE_CREATE'
      );
      const validName = this.validateName(name);
      const profiles = await this.storage.getProfiles();
      this.ensureUniqueName(validName, profiles);

      // Validate and normalize initial domains if provided
      const normalizedDomains: string[] = [];
      for (const d of initialDomains) {
        const val = DomainNormalizer.validateAllowlistPattern(d);
        if (!val.isValid) {
          throw new AppError(
            val.errorCode ?? 'DOMAIN_INVALID_FORMAT',
            `Cannot create profile: ${val.error}`,
            val.errorParams
          );
        }
        if (!normalizedDomains.includes(val.normalizedDomain)) {
          normalizedDomains.push(val.normalizedDomain);
        }
      }

      const now = Date.now();
      const newProfile: FocusProfile = {
        id: this.generateId(),
        name: validName,
        allowedDomains: normalizedDomains,
        isDefault: profiles.length === 0, // First created profile is default if none exist
        createdAt: now,
        updatedAt: now,
      };

      const updatedList = [...profiles, newProfile];
      await this.storage.setProfiles(updatedList);

      // If active profile ID is empty, set this new profile as active
      const currentActiveId = await this.storage.getActiveProfileId();
      if (!currentActiveId) {
        await this.storage.setActiveProfileId(newProfile.id);
      }

      return newProfile;
    });
  }

  /**
   * Rename an existing profile while preserving its ID and allowlist.
   */
  async renameProfile(profileId: string, newName: string): Promise<FocusProfile> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Cannot rename profile during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_PROFILE_RENAME'
      );
      const validName = this.validateName(newName);
      const profiles = await this.storage.getProfiles();
      const targetIndex = profiles.findIndex((p) => p.id === profileId);

      if (targetIndex === -1) {
        throw new AppError(
          'PROFILE_NOT_FOUND',
          `Profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      this.ensureUniqueName(validName, profiles, profileId);

      const target = profiles[targetIndex];
      const updatedProfile: FocusProfile = {
        ...target,
        name: validName,
        updatedAt: Date.now(),
      };

      profiles[targetIndex] = updatedProfile;
      await this.storage.setProfiles(profiles);
      return updatedProfile;
    });
  }

  /**
   * Add a domain to a specific profile's allowlist after normalization.
   * Prevents duplicates and dangerous wildcards.
   */
  async addDomainToProfile(profileId: string, domainPattern: string): Promise<FocusProfile> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Allowlist cannot be modified during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_ALLOWLIST'
      );
      const validation = DomainNormalizer.validateAllowlistPattern(domainPattern);
      if (!validation.isValid) {
        throw new AppError(
          validation.errorCode ?? 'DOMAIN_INVALID_FORMAT',
          `Cannot add domain: ${validation.error}`,
          validation.errorParams
        );
      }

      const profiles = await this.storage.getProfiles();
      const targetIndex = profiles.findIndex((p) => p.id === profileId);

      if (targetIndex === -1) {
        throw new AppError(
          'PROFILE_NOT_FOUND',
          `Profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      const target = profiles[targetIndex];
      const normalizedDomain = validation.normalizedDomain;

      // Duplicate check after normalization
      if (target.allowedDomains.includes(normalizedDomain)) {
        // Domain already exists in allowlist; return without duplicate
        return target;
      }

      const updatedProfile: FocusProfile = {
        ...target,
        allowedDomains: [...target.allowedDomains, normalizedDomain],
        updatedAt: Date.now(),
      };

      profiles[targetIndex] = updatedProfile;
      await this.storage.setProfiles(profiles);
      return updatedProfile;
    });
  }

  /**
   * Remove a domain from a specific profile's allowlist.
   */
  async removeDomainFromProfile(profileId: string, domainPattern: string): Promise<FocusProfile> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Allowlist cannot be modified during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_ALLOWLIST'
      );
      const normalizedTarget = DomainNormalizer.normalizeHostname(domainPattern);
      const profiles = await this.storage.getProfiles();
      const targetIndex = profiles.findIndex((p) => p.id === profileId);

      if (targetIndex === -1) {
        throw new AppError(
          'PROFILE_NOT_FOUND',
          `Profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      const target = profiles[targetIndex];
      const filtered = target.allowedDomains.filter(
        (d) => d.toLowerCase() !== normalizedTarget.toLowerCase()
      );

      const updatedProfile: FocusProfile = {
        ...target,
        allowedDomains: filtered,
        updatedAt: Date.now(),
      };

      profiles[targetIndex] = updatedProfile;
      await this.storage.setProfiles(profiles);
      return updatedProfile;
    });
  }

  /**
   * Replace the entire allowlist for a profile.
   */
  async updateProfileAllowlist(
    profileId: string,
    domainPatterns: string[]
  ): Promise<FocusProfile> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Allowlist cannot be modified during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_ALLOWLIST'
      );
      const profiles = await this.storage.getProfiles();
      const targetIndex = profiles.findIndex((p) => p.id === profileId);

      if (targetIndex === -1) {
        throw new AppError(
          'PROFILE_NOT_FOUND',
          `Profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      const normalizedList: string[] = [];
      for (const pattern of domainPatterns) {
        const val = DomainNormalizer.validateAllowlistPattern(pattern);
        if (!val.isValid) {
          throw new AppError(
            val.errorCode ?? 'DOMAIN_INVALID_FORMAT',
            `Cannot update allowlist: ${val.error}`,
            val.errorParams
          );
        }
        if (!normalizedList.includes(val.normalizedDomain)) {
          normalizedList.push(val.normalizedDomain);
        }
      }

      const target = profiles[targetIndex];
      const updatedProfile: FocusProfile = {
        ...target,
        allowedDomains: normalizedList,
        updatedAt: Date.now(),
      };

      profiles[targetIndex] = updatedProfile;
      await this.storage.setProfiles(profiles);
      return updatedProfile;
    });
  }

  /**
   * Delete a profile.
   * If deleting the active profile:
   * - Must specify a valid replacementProfileId, or
   * - Automatically falls back to the first remaining profile.
   * Refuses to delete the last remaining profile in storage.
   */
  async deleteProfile(
    profileId: string,
    replacementActiveProfileId?: string
  ): Promise<{ deletedProfile: FocusProfile; newActiveProfileId: string }> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Cannot delete profile during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_PROFILE_DELETE'
      );
      const profiles = await this.storage.getProfiles();
      const targetIndex = profiles.findIndex((p) => p.id === profileId);

      if (targetIndex === -1) {
        throw new AppError(
          'PROFILE_NOT_FOUND',
          `Profile with ID '${profileId}' not found.`,
          { profileId }
        );
      }

      if (profiles.length <= 1) {
        throw new AppError(
          'PROFILE_DELETE_LAST',
          'Cannot delete the only remaining profile in the system.'
        );
      }

      const targetProfile = profiles[targetIndex];
      const currentActiveId = await this.storage.getActiveProfileId();
      const isDeletingActive = currentActiveId === profileId;

      const remainingProfiles = profiles.filter((p) => p.id !== profileId);
      let nextActiveId = currentActiveId;

      if (isDeletingActive) {
        if (replacementActiveProfileId) {
          const replacementExists = remainingProfiles.some(
            (p) => p.id === replacementActiveProfileId
          );
          if (!replacementExists) {
            throw new AppError(
              'PROFILE_REPLACEMENT_NOT_FOUND',
              `Replacement active profile with ID '${replacementActiveProfileId}' does not exist.`,
              { replacementId: replacementActiveProfileId }
            );
          }
          nextActiveId = replacementActiveProfileId;
        } else {
          // Fallback to first remaining profile to avoid orphan reference
          nextActiveId = remainingProfiles[0].id;
        }
        await this.storage.setActiveProfileId(nextActiveId);
      }

      await this.storage.setProfiles(remainingProfiles);

      return {
        deletedProfile: targetProfile,
        newActiveProfileId: nextActiveId,
      };
    });
  }

  /**
   * Set the active profile ID, verifying existence.
   */
  async setActiveProfile(profileId: string): Promise<void> {
    return this.storage.runExclusive(async () => {
      await this.assertNoActiveSession(
        'Cannot switch active profile during a focus session. Finish your session first.',
        'ACTIVE_SESSION_LOCK_PROFILE_SWITCH'
      );
      const profiles = await this.storage.getProfiles();
      const exists = profiles.some((p) => p.id === profileId);
      if (!exists) {
        throw new AppError(
          'PROFILE_SET_ACTIVE_NOT_FOUND',
          `Cannot set active profile: ID '${profileId}' not found.`,
          { profileId }
        );
      }
      await this.storage.setActiveProfileId(profileId);
    });
  }

  /**
   * Get the active profile.
   * Auto-repairs if activeProfileId references a non-existent or corrupted profile.
   */
  async getActiveProfile(): Promise<FocusProfile> {
    const profiles = await this.storage.getProfiles();
    if (profiles.length === 0) {
      throw new AppError('NO_PROFILES_IN_STORAGE', 'No profiles found in storage.');
    }

    const activeId = await this.storage.getActiveProfileId();
    const found = profiles.find((p) => p.id === activeId);

    if (found) {
      return found;
    }

    // Auto-repair orphan or uninitialized active profile ID
    const fallback = profiles.find((p) => p.isDefault) ?? profiles[0];
    await this.storage.setActiveProfileId(fallback.id);
    return fallback;
  }
}
