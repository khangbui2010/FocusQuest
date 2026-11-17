import React, { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  AlertCircle,
  FolderPlus,
  Info,
  Loader2,
} from 'lucide-react';
import { FocusProfile } from '../../types/profiles.ts';
import { DomainNormalizer } from '../../core/profiles/domainNormalizer.ts';
import { useTranslation } from '../../i18n/I18nContext.tsx';
import { localizeErrorMessage } from '../../i18n/errorTranslator.ts';

export interface ProfileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: FocusProfile[];
  activeProfile: FocusProfile | null;
  isSessionActive: boolean;
  isLoading?: boolean;
  initialError?: string | null;
  onSwitchProfile: (profileId: string) => Promise<void>;
  onCreateProfile: (name: string) => Promise<void>;
  onRenameProfile: (profileId: string, newName: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onAddDomain: (profileId: string, domain: string) => Promise<void>;
  onRemoveDomain: (profileId: string, domain: string) => Promise<void>;
}

export const ProfileBottomSheet: React.FC<ProfileBottomSheetProps> = ({
  isOpen,
  onClose,
  profiles,
  activeProfile,
  isSessionActive,
  isLoading = false,
  initialError = null,
  onSwitchProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
  onAddDomain,
  onRemoveDomain,
}) => {
  const { locale, t } = useTranslation();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [newDomainInput, setNewDomainInput] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(initialError);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSheetError(initialError);
  }, [initialError]);

  // Clear pending edit drafts if a session becomes active while sheet is open
  useEffect(() => {
    if (isSessionActive) {
      setShowCreateForm(false);
      setRenamingId(null);
      setConfirmDeleteId(null);
    }
  }, [isSessionActive]);

  // Close sheet on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const safeProfiles = Array.isArray(profiles) ? profiles : [];
  const isBusy = isLoading || isSubmitting;
  const isMutateDisabled = isSessionActive || isBusy;

  const runMutation = async (fn: () => Promise<void>, setTargetError: (msg: string | null) => void) => {
    setTargetError(null);
    setIsSubmitting(true);
    try {
      await fn();
      return true;
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSessionActive) {
      setSheetError(t('profiles.sessionLockBanner'));
      return;
    }
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      setSheetError(t('profiles.emptyNameClientError'));
      return;
    }
    const ok = await runMutation(() => onCreateProfile(trimmed), setSheetError);
    if (ok) {
      setNewProfileName('');
      setShowCreateForm(false);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent, profileId: string) => {
    e.preventDefault();
    if (isSessionActive) {
      setSheetError(t('profiles.sessionLockBanner'));
      return;
    }
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setSheetError(t('profiles.emptyNameClientError'));
      return;
    }
    const ok = await runMutation(() => onRenameProfile(profileId, trimmed), setSheetError);
    if (ok) {
      setRenamingId(null);
      setRenameDraft('');
    }
  };

  const handleConfirmDelete = async (profileId: string) => {
    if (isSessionActive) {
      setSheetError(t('profiles.sessionLockBanner'));
      return;
    }
    if (safeProfiles.length <= 1) {
      setSheetError(t('profiles.cannotDeleteLast'));
      setConfirmDeleteId(null);
      return;
    }
    const ok = await runMutation(() => onDeleteProfile(profileId), setSheetError);
    if (ok) {
      setConfirmDeleteId(null);
    }
  };

  const handleAddDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError(null);

    if (isSessionActive) {
      setDomainError(t('profiles.sessionLockBanner'));
      return;
    }
    if (!activeProfile) return;

    const trimmed = newDomainInput.trim();
    if (!trimmed) {
      setDomainError(t('profiles.emptyDomainClientError'));
      return;
    }

    // Reuse existing DomainNormalizer allowlist validation from ProfileAllowlistView
    const validation = DomainNormalizer.validateAllowlistPattern(trimmed);
    if (!validation.isValid) {
      setDomainError(validation.error || 'Invalid domain pattern.');
      return;
    }

    if (activeProfile.allowedDomains.includes(validation.normalizedDomain)) {
      setDomainError(t('profiles.duplicateDomainClientError', { domain: validation.normalizedDomain }));
      return;
    }

    const ok = await runMutation(
      () => onAddDomain(activeProfile.id, validation.normalizedDomain),
      setDomainError
    );
    if (ok) {
      setNewDomainInput('');
    }
  };

  return (
    <div
      data-testid="profile-sheet-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('profiles.sheetTitle')}
        data-testid="profile-bottom-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] h-[85%] max-h-[510px] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sheet Header */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {t('profiles.sheetTitle')}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isBusy && (
              <span
                data-testid="profile-sheet-loading"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400"
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t('profiles.loading')}</span>
              </span>
            )}
            <button
              type="button"
              data-testid="profile-sheet-close-btn"
              aria-label={t('profiles.closeAria')}
              onClick={onClose}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sheet Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
          {/* Active Session Strict Lock Banner */}
          {isSessionActive && (
            <div
              data-testid="profile-sheet-lock-banner"
              role="status"
              className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-lg text-[11px] font-medium text-amber-800 dark:text-amber-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span>{t('profiles.sessionLockBanner')}</span>
            </div>
          )}

          {/* Sheet-level Backend Error */}
          {sheetError && (
            <div
              data-testid="profile-sheet-error"
              role="alert"
              className="flex items-start justify-between gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 rounded-lg text-[11px] text-rose-700 dark:text-rose-200"
            >
              <div className="flex items-start gap-1.5 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <span>{localizeErrorMessage(locale, sheetError)}</span>
              </div>
              <button
                type="button"
                aria-label={t('profiles.dismissErrorAria')}
                onClick={() => setSheetError(null)}
                className="text-rose-500 hover:text-rose-700 dark:text-rose-300 shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Profile List Header + New Profile Trigger */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('profiles.sheetTitle')}
              </span>
              <button
                type="button"
                data-testid="new-profile-toggle-btn"
                disabled={isMutateDisabled}
                onClick={() => {
                  if (isMutateDisabled) return;
                  setShowCreateForm((prev) => !prev);
                  setSheetError(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{t('profiles.newProfileBtn')}</span>
              </button>
            </div>

            {/* Inline Create Profile Form */}
            {showCreateForm && !isSessionActive && (
              <form
                onSubmit={handleCreateSubmit}
                className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2"
              >
                <span className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                  {t('profiles.createTitle')}
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder={t('profiles.createPlaceholder')}
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    maxLength={50}
                    disabled={isMutateDisabled}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isMutateDisabled}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {t('profiles.createSubmit')}
                  </button>
                </div>
              </form>
            )}

            {/* Profile Rows */}
            <div data-testid="profile-sheet-list" className="space-y-1.5">
              {safeProfiles.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                  {t('profiles.emptyList')}
                </div>
              ) : (
                safeProfiles.map((profile) => {
                  const isActive = activeProfile?.id === profile.id;
                  const isRenaming = renamingId === profile.id;
                  const isConfirmingDelete = confirmDeleteId === profile.id;
                  const isOnlyProfile = safeProfiles.length <= 1;

                  return (
                    <div
                      key={profile.id}
                      data-testid={`profile-row-${profile.id}`}
                      className={`p-2 rounded-lg border text-xs transition-colors ${
                        isActive
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700/80'
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/70'
                      }`}
                    >
                      {isRenaming ? (
                        <form
                          onSubmit={(e) => handleRenameSubmit(e, profile.id)}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            maxLength={50}
                            placeholder={t('profiles.renamePlaceholder')}
                            disabled={isMutateDisabled}
                            className="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="submit"
                            disabled={isMutateDisabled}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
                          >
                            {t('profiles.save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(null);
                              setRenameDraft('');
                            }}
                            className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-[11px] font-medium cursor-pointer"
                          >
                            {t('profiles.cancel')}
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              />
                              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {profile.name}
                              </span>
                              {isActive && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold shrink-0">
                                  {t('profiles.activeBadge')}
                                </span>
                              )}
                            </div>
                            <div className="pl-3.5 text-[10px] text-slate-500 dark:text-slate-400">
                              {t('profiles.domainsCount', {
                                count: (profile.allowedDomains || []).length,
                              })}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isActive && (
                              <button
                                type="button"
                                data-testid={`switch-profile-${profile.id}`}
                                disabled={isMutateDisabled}
                                onClick={() => runMutation(() => onSwitchProfile(profile.id), setSheetError)}
                                className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {t('profiles.useBtn')}
                              </button>
                            )}

                            <button
                              type="button"
                              data-testid={`rename-profile-${profile.id}`}
                              aria-label={t('profiles.renameAria', { name: profile.name })}
                              disabled={isMutateDisabled}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setRenamingId(profile.id);
                                setRenameDraft(profile.name);
                                setSheetError(null);
                              }}
                              className="p-1 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              data-testid={`delete-profile-${profile.id}`}
                              aria-label={
                                isOnlyProfile
                                  ? t('profiles.cannotDeleteLast')
                                  : t('profiles.deleteAria', { name: profile.name })
                              }
                              title={
                                isOnlyProfile
                                  ? t('profiles.cannotDeleteLast')
                                  : t('profiles.deleteAria', { name: profile.name })
                              }
                              disabled={isMutateDisabled || isOnlyProfile}
                              onClick={() => {
                                if (isMutateDisabled) return;
                                if (isOnlyProfile) {
                                  setSheetError(t('profiles.cannotDeleteLast'));
                                  return;
                                }
                                setRenamingId(null);
                                setConfirmDeleteId(profile.id);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 rounded disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 2-step Delete Confirmation */}
                      {isConfirmingDelete && !isSessionActive && (
                        <div className="mt-2 pt-2 border-t border-rose-200 dark:border-rose-900/50 space-y-1.5">
                          <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                            {t('profiles.confirmDeleteTitle', { name: profile.name })}
                          </div>
                          {isActive && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400">
                              {t('profiles.confirmDeleteActiveNote')}
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-[11px] rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                            >
                              {t('profiles.cancel')}
                            </button>
                            <button
                              type="button"
                              data-testid={`confirm-delete-${profile.id}`}
                              disabled={isMutateDisabled}
                              onClick={() => handleConfirmDelete(profile.id)}
                              className="px-2 py-1 text-[11px] rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-40"
                            >
                              {t('profiles.confirmDeleteBtn')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Allowed Domains Section for Active Profile */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">
                {t('profiles.allowedDomainsHeader', {
                  name: activeProfile?.name || '',
                  count: activeProfile?.allowedDomains.length || 0,
                })}
              </span>
            </div>

            <form onSubmit={handleAddDomainSubmit} className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder={
                    isSessionActive
                      ? t('profiles.addDomainLockedPlaceholder')
                      : t('profiles.addDomainPlaceholder')
                  }
                  value={newDomainInput}
                  disabled={isMutateDisabled || !activeProfile}
                  onChange={(e) => {
                    setNewDomainInput(e.target.value);
                    setDomainError(null);
                  }}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={isMutateDisabled || !activeProfile}
                  className="px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('profiles.addDomainBtn')}</span>
                </button>
              </div>

              {domainError && (
                <div
                  data-testid="profile-sheet-domain-error"
                  role="alert"
                  className="flex items-start gap-1 text-[11px] text-rose-600 dark:text-rose-400"
                >
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{localizeErrorMessage(locale, domainError)}</span>
                </div>
              )}
            </form>

            {/* Domain List */}
            <div className="min-h-[100px] max-h-[150px] overflow-y-auto space-y-1 border border-slate-200/80 dark:border-slate-800 rounded-lg p-2 bg-slate-50/50 dark:bg-slate-900/50">
              {!activeProfile?.allowedDomains || activeProfile.allowedDomains.length === 0 ? (
                <div
                  data-testid="profile-sheet-empty-domains"
                  className="py-3 flex flex-col items-center justify-center text-center"
                >
                  <Shield className="w-5 h-5 text-slate-300 dark:text-slate-600 mb-1" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t('profiles.emptyAllowlistTitle')}
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-[240px]">
                    {t('profiles.emptyAllowlistDesc')}
                  </p>
                </div>
              ) : (
                activeProfile.allowedDomains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center justify-between px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded text-xs font-mono text-slate-800 dark:text-slate-200"
                  >
                    <span className="truncate pr-2">{domain}</span>
                    <button
                      type="button"
                      aria-label={t('profiles.removeDomainAria', { domain })}
                      disabled={isMutateDisabled}
                      onClick={() =>
                        runMutation(() => onRemoveDomain(activeProfile.id, domain), setDomainError)
                      }
                      className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-0.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-start gap-1.5 p-2 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded text-[11px] text-slate-600 dark:text-slate-400">
              <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <span>{t('profiles.subdomainTip')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
