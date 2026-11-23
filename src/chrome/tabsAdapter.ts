export interface ChromeTab {
  id?: number;
  url?: string;
  status?: string;
}

export type TabUpdateListener = (
  tabId: number,
  changeInfo: { status?: string; url?: string },
  tab: ChromeTab
) => void;

export interface ITabsAdapter {
  query(queryInfo: { url?: string | string[] }): Promise<ChromeTab[]>;
  update(tabId: number, updateProperties: { url: string }): Promise<ChromeTab | undefined>;
  onUpdated?(listener: TabUpdateListener): void;
}

export class ChromeTabsAdapter implements ITabsAdapter {
  async query(queryInfo: { url?: string | string[] }): Promise<ChromeTab[]> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      return [];
    }
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(queryInfo as chrome.tabs.QueryInfo, (tabs) => {
          if (chrome.runtime?.lastError) {
            resolve([]);
          } else {
            resolve(tabs as ChromeTab[]);
          }
        });
      } catch {
        resolve([]);
      }
    });
  }

  async update(tabId: number, updateProperties: { url: string }): Promise<ChromeTab | undefined> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.update) {
      return undefined;
    }
    return new Promise((resolve) => {
      try {
        chrome.tabs.update(tabId, updateProperties as chrome.tabs.UpdateProperties, (tab) => {
          if (chrome.runtime?.lastError) {
            resolve(undefined);
          } else {
            resolve(tab as ChromeTab);
          }
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  onUpdated(listener: TabUpdateListener): void {
    if (typeof chrome === 'undefined' || !chrome.tabs?.onUpdated) return;
    chrome.tabs.onUpdated.addListener(listener);
  }
}
