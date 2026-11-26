import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DevGodModePanel } from '../../src/dev/DevGodModePanel.tsx';
import { DevGodModeMount } from '../../src/dev/DevGodModeMount.tsx';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function collectBuildFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectBuildFiles(full, out);
    } else if (/\.(js|mjs|html|css|json)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_DIST_MARKERS = [
  'GOD MODE',
  'GOD_MODE',
  'DEV_GET_SNAPSHOT',
  'DEV_SET_COINS',
  'DEV_SET_LEVEL',
  'DEV_SET_FOCUS_MINUTES',
  'DEV_SET_TIME_SPEED',
  'DEV_ADVANCE_ACTIVE_SESSION_MS',
  'DEV_SKIP_FOCUS_WAIT',
  'DEV_COMPLETE_ALL_JOBS',
  'DEV_PLACE_FREE_BUILDING',
  'DEV_MAX_BUILDINGS',
  'DEV_UNLOCK_LAND',
  'DEV_RECRUIT_FREE',
  'DEV_FILL_ALL_ROLES',
  'DEV_MEET_ERA_REQUIREMENTS',
  'DEV_COMPLETE_ALL_QUESTS',
  'DEV_ROLLOVER_QUESTS',
  'DEV_UNLOCK_ALL_AWARDS',
  'DEV_RESET_AWARDS',
  'DEV_FAST_FORWARD_DAY',
  'DEV_SEED_DEMO_DATA',
  'DEV_APPLY_PRESET',
  'DEV_EXPORT_STATE',
  'DEV_IMPORT_STATE',
  'DEV_RESET_ALL_DATA',
  'DevGodModePanel',
  'DevGodModeMount',
  'devBackgroundService',
  'devSimulatorPlugin',
  'devStateHelpers',
] as const;

export function assertDistBuildIsolation(distDir: string): void {
  assert.ok(
    fs.existsSync(distDir),
    `dist/ directory must exist at ${distDir} (run npm run clean && npm run build before npm test)`
  );

  const files = collectBuildFiles(distDir);
  assert.ok(files.length >= 4, `Expected built files in ${distDir}, found ${files.length}`);

  const leaks: string[] = [];
  for (const filePath of files) {
    const baseName = path.basename(filePath);
    const rel = path.relative(distDir, filePath);
    if (/^dev/i.test(baseName) || /godmode/i.test(baseName)) {
      leaks.push(`${rel} has dev/godmode filename`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const marker of FORBIDDEN_DIST_MARKERS) {
      if (content.includes(marker)) {
        leaks.push(`${rel} contains "${marker}"`);
      }
    }

    if (/\.(js|mjs)$/i.test(baseName)) {
      if (content.includes('import.meta.env')) {
        leaks.push(`${rel} contains unstripped import.meta.env reference`);
      }
      if (content.includes('validateDOMNesting') || content.includes('jsxDEV')) {
        leaks.push(`${rel} contains React development runtime code`);
      }
    }
  }

  assert.deepStrictEqual(
    leaks,
    [],
    `Found God Mode or dev-runtime markers leaked into production dist/:\n${leaks.join('\n')}`
  );
}

test('5E-2b/5E-2c Build Isolation: dist/ contains zero God Mode UI, strings, dev chunks, import.meta.env, or React dev runtime', () => {
  assertDistBuildIsolation(DIST_DIR);
});

test('5E-2c Build Isolation Fail-Loud Guard: missing or empty dist/ directory causes test assertion failure (never passes silently)', () => {
  const missingDir = path.join(os.tmpdir(), `fq-nonexistent-dist-${Date.now()}-${Math.random()}`);
  assert.throws(() => assertDistBuildIsolation(missingDir), /must exist/);

  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-empty-dist-'));
  try {
    assert.throws(() => assertDistBuildIsolation(emptyDir), /Expected built files/);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('5E-2b/5E-2c Source Guard & Lazy Mount SSR: production entrypoints contain zero DEV_* or GOD_MODE literals, and DevGodModeMount/Panel render chip collapsed in SSR', () => {
  const productionFiles = [
    'src/App.tsx',
    'src/ui/services/extensionClient.ts',
    'src/ui/services/devRuntimeBridge.ts',
    'src/ui/components/TimerView.tsx',
    'src/background/index.ts',
    'src/background/messageHandler.ts',
    'src/types/messages.ts',
  ];

  const sourceLeaks: string[] = [];
  for (const rel of productionFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    if (
      content.includes('GOD MODE') ||
      content.includes('GOD_MODE') ||
      /\bDEV_(?!SERVER_MOCK_LIMITS\b)[A-Z0-9_]+/.test(content)
    ) {
      sourceLeaks.push(rel);
    }
  }
  assert.deepStrictEqual(sourceLeaks, [], `Production source leaked dev tokens: ${sourceLeaks.join(', ')}`);

  const panelHtml = renderToString(
    React.createElement(DevGodModePanel, {
      onRefreshState: async () => {},
    })
  );
  assert.ok(panelHtml.includes('data-testid="dev-god-mode-toggle"'));
  assert.ok(panelHtml.includes('GOD MODE (dev)'));
  assert.strictEqual(panelHtml.includes('data-testid="dev-god-mode-drawer"'), false);

  const mountHtml = renderToString(
    React.createElement(DevGodModeMount, {
      onRefreshState: async () => {},
      activeTab: 'map',
      onSetActiveTab: () => {},
      session: null,
      economy: { focusCoins: 0, totalXP: 0, level: 1 },
      civState: null,
    })
  );
  assert.ok(
    mountHtml === '' ||
      (mountHtml.includes('data-testid="dev-god-mode-toggle"') &&
        !mountHtml.includes('data-testid="dev-god-mode-drawer"'))
  );
});
