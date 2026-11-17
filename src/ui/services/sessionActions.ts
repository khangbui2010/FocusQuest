import { ExtensionMessage, MessageResponse } from '../../types/messages.ts';
import { sendExtensionMessage } from './extensionClient.ts';

export type SendMessageFn = (message: ExtensionMessage) => Promise<MessageResponse<unknown>>;

/**
 * Skips an active Pomodoro break phase (SHORT_BREAK or LONG_BREAK), transitions
 * immediately to the next Focus interval, refreshes UI state, and throws on failure
 * so the caller can surface the authoritative backend error message.
 */
export async function skipPomodoroBreakAction(
  refreshState: () => Promise<void>,
  sendMessage: SendMessageFn = sendExtensionMessage
): Promise<void> {
  const res = await sendMessage({ action: 'SKIP_POMODORO_BREAK' });
  await refreshState();
  if (!res.success) {
    throw new Error(res.error || 'Failed to skip Pomodoro break.');
  }
}
