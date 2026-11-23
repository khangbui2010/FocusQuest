import { IDNRAdapter, DNRRule } from '../chrome/dnrAdapter.ts';
import { ITabsAdapter, ChromeTab } from '../chrome/tabsAdapter.ts';
import { FocusProfile } from '../types/profiles.ts';
import { SessionSnapshot } from '../types/session.ts';
import { DomainNormalizer } from '../core/profiles/domainNormalizer.ts';

export const FOCUS_BLOCK_RULE_BASE_ID = 20000;
export const BLOCKED_PAGE_PATH = '/blocked.html';

/**
 * Background session state is the single source of truth for whether Focus
 * Quest may block websites.
 *
 * Blocking is only allowed while a session is RUNNING and, for Pomodoro modes,
 * only during the FOCUS phase. Breaks (short and long) and PAUSED sessions must
 * leave every blocking mechanism disabled.
 */
export function isWebsiteBlockingActive(
  session: SessionSnapshot | null | undefined
): boolean {
  if (!session || session.status !== 'RUNNING') return false;
  if (session.mode === 'POMODORO_COUNTDOWN' || session.mode === 'POMODORO_STOPWATCH') {
    return session.pomodoroState?.currentPhase === 'FOCUS';
  }
  return true;
}

export class BlockingCoordinator {
  /**
   * Monotonic intent version used to make later phase decisions win over
   * in-flight DNR operations from an older phase. A stale FOCUS apply can
   * never re-enable rules after the session moved to a break.
   */
  private blockingIntentVersion = 0;
  private desiredBlocking = false;

  /**
   * Serializes DNR writes so the *last* phase intent always wins. Without this,
   * a slow FOCUS apply could finish after a newer break clear and leave rules
   * installed in Chrome.
   */
  private blockingQueue: Promise<void> = Promise.resolve();

  constructor(
    private dnr: IDNRAdapter,
    private tabs?: ITabsAdapter
  ) {}

  private beginBlockingSync(shouldBlock: boolean): number {
    this.blockingIntentVersion += 1;
    this.desiredBlocking = shouldBlock;
    return this.blockingIntentVersion;
  }

  private isIntentVersionCurrent(version: number): boolean {
    return version === this.blockingIntentVersion;
  }

  /**
   * Apply or clear *all* Focus Quest blocking mechanisms for the intended
   * state. Later calls supersede earlier in-flight ones.
   */
  async syncBlocking(shouldBlock: boolean, profile: FocusProfile | null): Promise<void> {
    const effective = shouldBlock && !!profile;
    const version = this.beginBlockingSync(effective);

    const run = this.blockingQueue.then(() =>
      this.applyBlockingIntent(version, effective, profile)
    );
    // Keep the queue alive even if one intent fails; the caller still sees the error.
    this.blockingQueue = run.catch(() => undefined);
    return run;
  }

  private async applyBlockingIntent(
    version: number,
    effective: boolean,
    profile: FocusProfile | null
  ): Promise<void> {
    // A newer intent is already queued behind us: let it decide the final state.
    if (!this.isIntentVersionCurrent(version)) return;

    if (effective && profile) {
      await this.applyAllowlistRules(profile, version);
      if (this.isIntentVersionCurrent(version) && this.desiredBlocking) {
        await this.redirectAlreadyOpenBlockedTabs(profile, version);
      }
      return;
    }

    await this.clearBlockingRules(version);
  }

  /**
   * Convert an array of user domain patterns (e.g. ['wikipedia.org', '*.github.com'])
   * into clean requestDomains suitable for declarativeNetRequest condition exclusion.
   */
  private extractExcludedDomains(allowedDomains: string[]): string[] {
    const cleanList: string[] = [];
    for (const pattern of allowedDomains) {
      const normalized = DomainNormalizer.normalizeHostname(pattern);
      if (!normalized) continue;
      // Strip leading '*.' if present for DNR domain matching
      const baseDomain = normalized.startsWith('*.') ? normalized.slice(2) : normalized;
      if (!cleanList.includes(baseDomain)) {
        cleanList.push(baseDomain);
      }
    }
    return cleanList;
  }

  /**
   * Apply allowlist-only blocking rules for an active session.
   * If allowedDomains is empty, ALL external web pages are blocked.
   * If allowedDomains has domains, only those domains are accessible; all others are blocked/redirected.
   */
  async applyAllowlistRules(profile: FocusProfile, intentVersion?: number): Promise<void> {
    if (intentVersion !== undefined && !this.isIntentVersionCurrent(intentVersion)) return;

    const existingRules = await this.dnr.getDynamicRules();
    if (intentVersion !== undefined && !this.isIntentVersionCurrent(intentVersion)) return;

    const existingRuleIds = existingRules.map((r) => r.id);

    const excludedDomains = this.extractExcludedDomains(profile.allowedDomains);

    // Build the primary blocking rule
    // Priority: 1
    // Condition: All main_frame HTTP/HTTPS web navigations EXCEPT allowed domains
    const blockRule: DNRRule = {
      id: FOCUS_BLOCK_RULE_BASE_ID,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: BLOCKED_PAGE_PATH,
        },
      },
      condition: {
        urlFilter: '|http*', // Match http:// and https:// URLs
        resourceTypes: ['main_frame'],
        // Exclude allowed domains from being blocked
        excludedRequestDomains: excludedDomains.length > 0 ? excludedDomains : undefined,
      },
    };

    await this.dnr.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: [blockRule],
    });
  }

  /**
   * Remove all active blocking rules (when session is idle, completed, or stopped).
   */
  async clearBlockingRules(intentVersion?: number): Promise<void> {
    if (intentVersion !== undefined && !this.isIntentVersionCurrent(intentVersion)) return;

    const existingRules = await this.dnr.getDynamicRules();
    if (intentVersion !== undefined && !this.isIntentVersionCurrent(intentVersion)) return;
    if (existingRules.length === 0) return;

    const existingRuleIds = existingRules.map((r) => r.id);
    await this.dnr.updateDynamicRules({
      removeRuleIds: existingRuleIds,
    });
  }

  /**
   * Reconcile current DNR state with expected session status.
   * Ensures blocking is active only when session is RUNNING.
   * When PAUSED, IDLE, COMPLETED, ABANDONED, or INTERRUPTED, blocking is cleared.
   */
  async reconcile(sessionStatus: string | null | undefined, activeProfile: FocusProfile | null): Promise<void> {
    const isActiveSession = sessionStatus === 'RUNNING';

    if (isActiveSession && activeProfile) {
      await this.applyAllowlistRules(activeProfile);
      await this.redirectAlreadyOpenBlockedTabs(activeProfile);
    } else {
      await this.clearBlockingRules();
    }
  }

  /**
   * Redirect any currently open tabs that are not in the profile's allowlist to blocked.html.
   * Strictly preserves internal Chrome pages (chrome://, about:, etc.) and allowlisted tabs.
   * Safe against API absence or errors.
   */
  async redirectAlreadyOpenBlockedTabs(profile: FocusProfile, intentVersion?: number): Promise<number> {
    if (!this.tabs) return 0;
    try {
      const openTabs = await this.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      let redirectedCount = 0;
      const targetBlockedUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('blocked.html')
          : BLOCKED_PAGE_PATH;

      for (const tab of openTabs) {
        // Stop as soon as a newer phase intent (e.g. a break) supersedes this one.
        if (
          intentVersion !== undefined &&
          (!this.isIntentVersionCurrent(intentVersion) || !this.desiredBlocking)
        ) {
          return redirectedCount;
        }

        if (!tab.id || !tab.url) continue;

        // Never touch Chrome internal pages or extension resources
        if (
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('about:') ||
          tab.url.startsWith('edge://') ||
          tab.url.includes('chromewebstore.google.com')
        ) {
          continue;
        }

        const isAllowed = DomainNormalizer.isUrlAllowed(tab.url, profile.allowedDomains);
        if (!isAllowed) {
          await this.tabs.update(tab.id, { url: targetBlockedUrl });
          redirectedCount++;
        }
      }
      return redirectedCount;
    } catch (err) {
      console.warn('BlockingCoordinator: safe warning during redirectAlreadyOpenBlockedTabs:', err);
      return 0;
    }
  }

  /**
   * Evaluate a tab update event during an active session.
   * If the tab navigates to a domain not in the allowlist, redirects to blocked.html.
   * Strictly preserves internal Chrome/browser pages and allowlisted domains.
   */
  async handleTabUpdate(
    tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: ChromeTab,
    activeProfile: FocusProfile | null,
    session?: SessionSnapshot | null
  ): Promise<boolean> {
    // When the caller supplies the authoritative session, enforce the phase
    // gate here as well so breaks can never redirect navigations.
    if (session !== undefined && !isWebsiteBlockingActive(session)) return false;
    if (!this.tabs || !activeProfile) return false;
    const url = changeInfo.url || tab.url;
    if (!url) return false;

    // Never touch internal browser pages, extension resources, or already blocked pages
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url === BLOCKED_PAGE_PATH ||
      url.endsWith('/blocked.html') ||
      url.includes('chromewebstore.google.com')
    ) {
      return false;
    }

    const isAllowed = DomainNormalizer.isUrlAllowed(url, activeProfile.allowedDomains);
    if (!isAllowed) {
      const targetBlockedUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('blocked.html')
          : BLOCKED_PAGE_PATH;
      await this.tabs.update(tabId, { url: targetBlockedUrl });
      return true;
    }
    return false;
  }
}
