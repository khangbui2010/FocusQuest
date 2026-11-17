export interface NotificationOptions {
  title: string;
  message: string;
  iconUrl?: string;
  type?: 'basic' | 'image' | 'list' | 'progress';
  priority?: number;
}

export interface INotificationsAdapter {
  create(id: string, options: NotificationOptions): Promise<string | null>;
  clear(id: string): Promise<boolean>;
}

export class ChromeNotificationsAdapter implements INotificationsAdapter {
  async create(id: string, options: NotificationOptions): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      console.warn('ChromeNotificationsAdapter: chrome.notifications API not available.');
      return null;
    }

    return new Promise((resolve) => {
      try {
        const defaultIcon = (chrome.runtime?.getURL && chrome.runtime.getURL('icons/icon128.png')) || '';
        const chromeOpts: chrome.notifications.NotificationOptions = {
          type: options.type || 'basic',
          iconUrl: options.iconUrl || defaultIcon || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          title: options.title,
          message: options.message,
          priority: options.priority ?? 2,
        };

        chrome.notifications.create(id, chromeOpts as chrome.notifications.NotificationCreateOptions, (createdId) => {
          if (chrome.runtime?.lastError) {
            console.warn('Failed to dispatch notification:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(createdId || id);
          }
        });
      } catch (err) {
        console.warn('Exception during notification creation:', err);
        resolve(null);
      }
    });
  }

  async clear(id: string): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      return false;
    }

    return new Promise((resolve) => {
      try {
        chrome.notifications.clear(id, (wasCleared) => {
          resolve(wasCleared);
        });
      } catch {
        resolve(false);
      }
    });
  }
}
