import { IAlarmsAdapter, AlarmInfo } from '../../src/chrome/alarmsAdapter.ts';
import { INotificationsAdapter, NotificationOptions } from '../../src/chrome/notificationsAdapter.ts';
import { IDNRAdapter, DNRRule } from '../../src/chrome/dnrAdapter.ts';
import { IBadgeAdapter } from '../../src/chrome/badgeAdapter.ts';

export class MockAlarmsAdapter implements IAlarmsAdapter {
  public alarms: Map<string, AlarmInfo> = new Map();
  public listeners: ((alarm: { name: string }) => void)[] = [];

  async create(
    name: string,
    alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }
  ): Promise<void> {
    const scheduledTime =
      alarmInfo.when ??
      (alarmInfo.delayInMinutes ? Date.now() + alarmInfo.delayInMinutes * 60000 : Date.now());
    this.alarms.set(name, {
      name,
      scheduledTime,
      periodInMinutes: alarmInfo.periodInMinutes,
    });
  }

  async clear(name: string): Promise<boolean> {
    const existed = this.alarms.has(name);
    this.alarms.delete(name);
    return existed;
  }

  async clearAll(): Promise<boolean> {
    this.alarms.clear();
    return true;
  }

  async get(name: string): Promise<AlarmInfo | undefined> {
    return this.alarms.get(name);
  }

  onAlarm(listener: (alarm: { name: string }) => void): void {
    this.listeners.push(listener);
  }

  // Test helper to simulate alarm firing
  async triggerAlarm(name: string): Promise<void> {
    const alarm = this.alarms.get(name);
    if (alarm) {
      for (const listener of this.listeners) {
        listener({ name: alarm.name });
      }
    }
  }
}

export class MockNotificationsAdapter implements INotificationsAdapter {
  public notifications: Map<string, NotificationOptions> = new Map();
  public dispatchCount = 0;

  async create(id: string, options: NotificationOptions): Promise<string | null> {
    this.notifications.set(id, options);
    this.dispatchCount++;
    return id;
  }

  async clear(id: string): Promise<boolean> {
    return this.notifications.delete(id);
  }
}

export class MockDNRAdapter implements IDNRAdapter {
  public rules: DNRRule[] = [];

  async updateDynamicRules(options: {
    addRules?: DNRRule[];
    removeRuleIds?: number[];
  }): Promise<void> {
    if (options.removeRuleIds && options.removeRuleIds.length > 0) {
      const set = new Set(options.removeRuleIds);
      this.rules = this.rules.filter((r) => !set.has(r.id));
    }
    if (options.addRules && options.addRules.length > 0) {
      this.rules.push(...options.addRules);
    }
  }

  async getDynamicRules(): Promise<DNRRule[]> {
    return JSON.parse(JSON.stringify(this.rules));
  }
}

export class MockBadgeAdapter implements IBadgeAdapter {
  public text = '';
  public color = '';

  async setBadgeText(text: string): Promise<void> {
    this.text = text;
  }

  async setBadgeBackgroundColor(color: string): Promise<void> {
    this.color = color;
  }

  async clearBadge(): Promise<void> {
    this.text = '';
  }
}

import { ITabsAdapter, ChromeTab, TabUpdateListener } from '../../src/chrome/tabsAdapter.ts';

export class MockTabsAdapter implements ITabsAdapter {
  public tabs: ChromeTab[] = [];
  public updateHistory: { tabId: number; newUrl: string }[] = [];
  public updateListeners: TabUpdateListener[] = [];

  constructor(initialTabs: ChromeTab[] = []) {
    this.tabs = JSON.parse(JSON.stringify(initialTabs));
  }

  createTab(tab: ChromeTab): ChromeTab {
    const copy = JSON.parse(JSON.stringify(tab));
    this.tabs.push(copy);
    return copy;
  }

  async get(tabId: number): Promise<ChromeTab> {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);
    return JSON.parse(JSON.stringify(tab));
  }

  async query(queryInfo: { url?: string | string[] }): Promise<ChromeTab[]> {
    return JSON.parse(JSON.stringify(this.tabs));
  }

  async update(tabId: number, updateProperties: { url: string }): Promise<ChromeTab | undefined> {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return undefined;
    tab.url = updateProperties.url;
    this.updateHistory.push({ tabId, newUrl: updateProperties.url });
    return JSON.parse(JSON.stringify(tab));
  }

  onUpdated(listener: TabUpdateListener): void {
    this.updateListeners.push(listener);
  }

  triggerTabUpdate(tabId: number, changeInfo: { status?: string; url?: string }, tab: ChromeTab): void {
    for (const listener of this.updateListeners) {
      listener(tabId, changeInfo, tab);
    }
  }
}
