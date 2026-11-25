import { createDevBackgroundController, DevBackgroundController, DevBackgroundDeps } from './devBackgroundService.ts';
import { MessageResponse } from '../types/messages.ts';

let singletonController: DevBackgroundController | null = null;
let lastDeps: DevBackgroundDeps | null = null;

function ensureController(deps: DevBackgroundDeps): DevBackgroundController {
  if (!singletonController || lastDeps !== deps) {
    lastDeps = deps;
    singletonController = createDevBackgroundController(deps);
  }
  return singletonController;
}

export async function handleDevBackgroundMessage(
  message: unknown,
  deps: DevBackgroundDeps
): Promise<MessageResponse<unknown> | null> {
  if (
    typeof import.meta === 'undefined' ||
    typeof import.meta.env === 'undefined' ||
    import.meta.env.DEV !== true
  ) {
    return null;
  }

  const controller = ensureController(deps);
  return controller.handleMessage(message);
}
