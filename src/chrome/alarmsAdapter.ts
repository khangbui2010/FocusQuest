export interface AlarmInfo {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

export interface IAlarmsAdapter {
  create(name: string, alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
  clearAll(): Promise<boolean>;
  get(name: string): Promise<AlarmInfo | undefined>;
  onAlarm(listener: (alarm: { name: string }) => void): void;
}

export class ChromeAlarmsAdapter implements IAlarmsAdapter {
  private ensureAvailable(): void {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
      throw new Error('ChromeAlarmsAdapter: chrome.alarms is not available in the current environment.');
    }
  }

  async create(
    name: string,
    alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }
  ): Promise<void> {
    this.ensureAvailable();
    return new Promise((resolve) => {
      chrome.alarms.create(name, alarmInfo as chrome.alarms.AlarmCreateInfo);
      resolve();
    });
  }

  async clear(name: string): Promise<boolean> {
    this.ensureAvailable();
    return new Promise((resolve) => {
      chrome.alarms.clear(name, (wasCleared) => {
        resolve(wasCleared ?? false);
      });
    });
  }

  async clearAll(): Promise<boolean> {
    this.ensureAvailable();
    return new Promise((resolve) => {
      chrome.alarms.clearAll((wasCleared) => {
        resolve(wasCleared ?? false);
      });
    });
  }

  async get(name: string): Promise<AlarmInfo | undefined> {
    this.ensureAvailable();
    return new Promise((resolve) => {
      chrome.alarms.get(name, (alarm) => {
        if (!alarm) {
          resolve(undefined);
        } else {
          resolve({
            name: alarm.name,
            scheduledTime: alarm.scheduledTime,
            periodInMinutes: alarm.periodInMinutes,
          });
        }
      });
    });
  }

  onAlarm(listener: (alarm: { name: string }) => void): void {
    this.ensureAvailable();
    chrome.alarms.onAlarm.addListener(listener);
  }
}
