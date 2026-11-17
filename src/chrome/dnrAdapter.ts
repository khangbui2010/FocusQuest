export interface DNRRule {
  id: number;
  priority: number;
  action: {
    type: 'block' | 'redirect' | 'allow';
    redirect?: {
      extensionPath?: string;
      url?: string;
    };
  };
  condition: {
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes: ('main_frame' | 'sub_frame' | 'stylesheet' | 'script' | 'image' | 'xmlhttprequest')[];
    initiatorDomains?: string[];
    excludedInitiatorDomains?: string[];
    requestDomains?: string[];
    excludedRequestDomains?: string[];
  };
}

export interface IDNRAdapter {
  updateDynamicRules(options: {
    addRules?: DNRRule[];
    removeRuleIds?: number[];
  }): Promise<void>;
  getDynamicRules(): Promise<DNRRule[]>;
}

export class ChromeDNRAdapter implements IDNRAdapter {
  private ensureAvailable(): void {
    if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
      throw new Error('ChromeDNRAdapter: chrome.declarativeNetRequest API not available.');
    }
  }

  async updateDynamicRules(options: {
    addRules?: DNRRule[];
    removeRuleIds?: number[];
  }): Promise<void> {
    this.ensureAvailable();
    return new Promise((resolve, reject) => {
      chrome.declarativeNetRequest.updateDynamicRules(
        options as chrome.declarativeNetRequest.UpdateRuleOptions,
        () => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getDynamicRules(): Promise<DNRRule[]> {
    this.ensureAvailable();
    return new Promise((resolve, reject) => {
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(rules as unknown as DNRRule[]);
        }
      });
    });
  }
}
