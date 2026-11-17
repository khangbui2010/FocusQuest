/**
 * Lifecycle reason taxonomy for Chrome MV3 Service Worker lifecycle coordination.
 */

export type LifecycleReason =
  | 'BROWSER_STARTUP'
  | 'SERVICE_WORKER_WAKE'
  | 'EXTENSION_RE_ENABLED'
  | 'EXTENSION_RELOADED'
  | 'EXTENSION_UPDATED'
  | 'BROWSER_UPDATED'
  | 'UNKNOWN';

export interface LifecycleEventContext {
  reason: LifecycleReason;
  isBrowserStartup?: boolean;
}
