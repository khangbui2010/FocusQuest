import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

interface ChromeMessagesMap {
  [key: string]: {
    message: string;
    description?: string;
  };
}

test('Stage E: manifest.json uses _locales placeholders and exposes blocked.js alongside blocked.html', () => {
  const manifest = JSON.parse(readText('public/manifest.json')) as {
    default_locale?: string;
    name?: string;
    description?: string;
    action?: { default_title?: string };
    web_accessible_resources?: Array<{ resources?: string[] }>;
  };

  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.equal(manifest.action?.default_title, '__MSG_extName__');

  const warResources = manifest.web_accessible_resources?.[0]?.resources ?? [];
  assert.ok(warResources.includes('blocked.html'));
  assert.ok(warResources.includes('blocked.js'));
  assert.ok(warResources.includes('assets/*'));
});

test('Stage E: public/_locales/en and public/_locales/vi messages.json have parity and valid lengths', () => {
  const enMessages = JSON.parse(readText('public/_locales/en/messages.json')) as ChromeMessagesMap;
  const viMessages = JSON.parse(readText('public/_locales/vi/messages.json')) as ChromeMessagesMap;

  const enKeys = Object.keys(enMessages).sort();
  const viKeys = Object.keys(viMessages).sort();

  assert.deepEqual(enKeys, ['extDescription', 'extName']);
  assert.deepEqual(viKeys, enKeys);

  for (const key of enKeys) {
    assert.ok(enMessages[key].message.trim().length > 0, `en ${key} must be non-empty`);
    assert.ok(viMessages[key].message.trim().length > 0, `vi ${key} must be non-empty`);
  }

  assert.ok(enMessages.extDescription.message.length <= 120);
  assert.ok(viMessages.extDescription.message.length <= 120);
});

test('Stage E: public/blocked.html has no inline script, loads blocked.js module, and defines i18n targets', () => {
  const html = readText('public/blocked.html');

  // Strict CSP check: no inline <script> body allowed
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'blocked.html must not contain inline script');
  assert.ok(html.includes('<script type="module" src="blocked.js"></script>'));

  for (const id of ['blocked-card', 'blocked-title', 'blocked-desc', 'blocked-badge']) {
    assert.ok(html.includes(`id="${id}"`), `blocked.html must contain #${id}`);
  }
});
