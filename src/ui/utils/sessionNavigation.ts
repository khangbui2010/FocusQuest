import { SessionSnapshot } from '../../types/session.ts';
import type { ActiveTab } from '../components/Navbar.tsx';

export interface ResetSessionResponse {
  success: boolean;
  error?: string;
}

export interface ExitSessionActionDeps {
  sendReset: () => Promise<ResetSessionResponse>;
  refreshState: () => Promise<void>;
  onNavigateToMap: () => void;
  fallbackError?: string;
}

/**
 * Derive strictly from the background session snapshot whether the user is
 * currently inside a Focus Session flow (running, paused, short/long break,
 * or finished/abandoned/interrupted awaiting Exit confirmation).
 */
export function isInFocusSession(session: SessionSnapshot | null | undefined): boolean {
  return Boolean(session && session.status !== 'IDLE');
}

/**
 * Resolve the effective tab from user tab state and background session snapshot.
 * While inside a focus session flow, navigation is locked to the Focus view.
 */
export function resolveEffectiveTab(
  requestedTab: ActiveTab,
  session: SessionSnapshot | null | undefined
): ActiveTab {
  return isInFocusSession(session) ? 'focus' : requestedTab;
}

/**
 * Execute the terminal Exit transition:
 * 1. Call the existing terminal-to-idle reset mechanism (RESET_SESSION).
 * 2. Refresh UI state and navigate to the Map tab ONLY on success.
 * 3. On failure, throw cleanly without navigating away so Exit can be retried.
 */
export async function executeExitSessionAction({
  sendReset,
  refreshState,
  onNavigateToMap,
  fallbackError = 'Failed to exit session.',
}: ExitSessionActionDeps): Promise<void> {
  const res = await sendReset();
  if (!res.success) {
    throw new Error(res.error || fallbackError);
  }
  await refreshState();
  onNavigateToMap();
}
