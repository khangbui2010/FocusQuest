export interface IBadgeAdapter {
  setBadgeText(text: string): Promise<void>;
  setBadgeBackgroundColor(color: string): Promise<void>;
  clearBadge(): Promise<void>;
}

export class ChromeBadgeAdapter implements IBadgeAdapter {
  async setBadgeText(text: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.action) return;
    return new Promise((resolve) => {
      chrome.action.setBadgeText({ text }, () => resolve());
    });
  }

  async setBadgeBackgroundColor(color: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.action) return;
    return new Promise((resolve) => {
      chrome.action.setBadgeBackgroundColor({ color }, () => resolve());
    });
  }

  async clearBadge(): Promise<void> {
    return this.setBadgeText('');
  }
}
