import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EN_MESSAGES } from '../../src/i18n/locales/en.ts';
import { VI_MESSAGES } from '../../src/i18n/locales/vi.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac']);

function collectFilesRecursive(dir: string, exts: Set<string>, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(full, exts, out);
    } else if (exts.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

test('i18n Static Guard: EN_MESSAGES and VI_MESSAGES have 100% key and placeholder parity and non-empty values', () => {
  const enKeys = Object.keys(EN_MESSAGES).sort();
  const viKeys = Object.keys(VI_MESSAGES).sort();
  assert.deepStrictEqual(viKeys, enKeys, 'VI_MESSAGES keys must match EN_MESSAGES keys identically');

  for (const key of enKeys) {
    const enVal = EN_MESSAGES[key as keyof typeof EN_MESSAGES];
    const viVal = VI_MESSAGES[key as keyof typeof VI_MESSAGES];
    assert.ok(enVal.trim().length > 0, `EN_MESSAGES['${key}'] must be non-empty`);
    assert.ok(viVal.trim().length > 0, `VI_MESSAGES['${key}'] must be non-empty`);
    assert.deepStrictEqual(
      extractPlaceholders(viVal),
      extractPlaceholders(enVal),
      `Placeholder mismatch for i18n key '${key}'`
    );
  }
});

test('i18n Static Guard: production UI files contain no hardcoded aria-label, title, or placeholder strings', () => {
  const uiFiles = [
    path.join(ROOT_DIR, 'src/App.tsx'),
    ...collectFilesRecursive(path.join(ROOT_DIR, 'src/ui/components'), new Set(['.tsx', '.ts'])),
  ].filter((filePath) => !filePath.endsWith(`${path.sep}SpriteGallery.tsx`));

  const hardcodedAttrPattern = /\b(?:aria-label|title|placeholder)="([^"]*)"/g;
  const violations: string[] = [];

  for (const filePath of uiFiles) {
    const src = fs.readFileSync(filePath, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = hardcodedAttrPattern.exec(src)) !== null) {
      const value = match[1].trim();
      // Ignore pure SVG attribute cases or purely numeric/symbol placeholders if any
      if (value && /[a-zA-ZÀ-ỹ]/.test(value)) {
        const line = src.slice(0, match.index).split('\n').length;
        const rel = path.relative(ROOT_DIR, filePath);
        violations.push(`${rel}:${line} -> ${match[0]}`);
      }
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Found hardcoded UI attribute string(s):\n${violations.join('\n')}`
  );
});

test('i18n Static Guard: Header, StatsView, MapGridView, and RewardHelpModal avoid former hardcoded display literals', () => {
  const headerSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/ui/components/Header.tsx'), 'utf8');
  assert.equal(/Lv\.\s*\{/.test(headerSrc), false, 'Header must use t("header.levelShort")');

  const mapSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/ui/components/civilization/MapGridView.tsx'),
    'utf8'
  );
  assert.equal(/Lv\.\{/.test(mapSrc), false, 'MapGridView must use t("civ.map.buildingLevelBadge")');

  const statsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/ui/components/StatsView.tsx'), 'utf8');
  assert.equal(/\}\s+C<\/div>/.test(statsSrc), false, 'StatsView must use t("timer.liveReward.coinUnit")');

  const helpSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/ui/components/RewardHelpModal.tsx'),
    'utf8'
  );
  assert.ok(helpSrc.includes('DEFAULT_REWARD_CONFIG'));
  assert.ok(helpSrc.includes('SESSION_MULTIPLIER_TIERS') || helpSrc.includes('MultiplierRules'));
  assert.equal(/>1\.5<\/td>/.test(helpSrc), false, 'RewardHelpModal must not hardcode 1.5');
  assert.equal(/>×2\.5<\/td>/.test(helpSrc), false, 'RewardHelpModal must not hardcode ×2.5');
});

test('Packaging Guard: public/ contains zero local audio files', () => {
  const audioInPublic = collectFilesRecursive(path.join(ROOT_DIR, 'public'), AUDIO_EXTENSIONS);
  assert.deepStrictEqual(audioInPublic, [], 'public/ must not contain local audio files');
});

test('i18n Static Key-Usage Guard: every t(...) and translate(...) key in src/ exists in EN_MESSAGES and VI_MESSAGES', async () => {
  const { getAllBuildingDefinitions } = await import('../../src/core/civilization/buildingCatalog.ts');
  const { ALL_QUEST_DEFINITIONS } = await import('../../src/core/quests/questCatalog.ts');
  const { VILLAGER_ROLES } = await import('../../src/ui/components/civilization/spriteRegistry.ts');
  const { CIVILIZATION_ERAS } = await import('../../src/core/civilization/buildingTypes.ts');

  const devPrefix = `${path.join(ROOT_DIR, 'src', 'dev')}${path.sep}`;
  const srcFiles = collectFilesRecursive(path.join(ROOT_DIR, 'src'), new Set(['.ts', '.tsx'])).filter(
    (filePath) => !filePath.endsWith(`${path.sep}SpriteGallery.tsx`) && !filePath.startsWith(devPrefix)
  );
  assert.ok(srcFiles.length >= 20, `Expected at least 20 files in src/, found ${srcFiles.length}`);

  const enSet = new Set(Object.keys(EN_MESSAGES));
  const viSet = new Set(Object.keys(VI_MESSAGES));
  const missingKeys: string[] = [];
  const unknownDynamicCalls: string[] = [];

  // Explicit allowlist of typed / domain-verified non-literal expressions passed to t(...)
  const ALLOWED_DYNAMIC_T_EXPRESSIONS = new Set([
    'tab.labelKey', // BuildingCatalogPanel typed filter tab key
    'CATEGORY_LABEL_KEYS[def.category]', // BuildingCatalogPanel Record<BuildingCategory, TranslationKey>
    'MONTH_SHORT_KEYS[monthNumber - 1]', // statsPeriod stats.monthShort.1..12 verified below
    'eraKey', // Header eras.<CivilizationEra> verified across ERA_ORDER below
    'eraShortKey', // Header header.eraShort.<CivilizationEra> verified across ERA_ORDER below
    'row.key', // RewardHelpModal MULTIPLIER_TIER_ROWS help.tier1..tier7
    'def.titleKey as TranslationKey', // QuestView QUEST_CATALOG verified below
    'def.descriptionKey as TranslationKey', // QuestView QUEST_CATALOG verified below
    'slotLabelKey', // QuestView SLOT_LABEL_KEYS verified below
  ]);

  const staticCallRe = /(?:^|[^.\w$])(?:t\(|translate\(\s*[^,]+,)\s*(['"])([a-zA-Z0-9_.-]+)\1/gm;
  const templateCallRe = /(?:^|[^.\w$])(?:t\(|translate\(\s*[^,]+,)\s*`([^`]+)`/gm;
  const anyTCallRe = /(?:^|[^.\w$])t\(([^)]+)\)/gm;

  for (const filePath of srcFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip block comments and full-line comments while preserving URLs inside string literals
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');

    let sm: RegExpExecArray | null;
    while ((sm = staticCallRe.exec(code)) !== null) {
      const key = sm[2];
      if (!enSet.has(key) || !viSet.has(key)) {
        const line = code.slice(0, sm.index).split('\n').length;
        missingKeys.push(`${rel}:${line} -> '${key}' (en=${enSet.has(key)}, vi=${viSet.has(key)})`);
      }
    }

    let tm: RegExpExecArray | null;
    while ((tm = templateCallRe.exec(code)) !== null) {
      const tpl = tm[1];
      if (tpl === 'civ.villager.role.${v.role}' || tpl === 'civ.villager.role.${role}' || tpl === 'civ.villager.role.${recruitSuccessRole}') {
        for (const role of VILLAGER_ROLES) {
          const resolved = `civ.villager.role.${role}`;
          if (!enSet.has(resolved) || !viSet.has(resolved)) {
            missingKeys.push(`${rel} -> '${resolved}'`);
          }
        }
      } else {
        const line = code.slice(0, tm.index).split('\n').length;
        unknownDynamicCalls.push(`${rel}:${line} -> \`${tpl}\``);
      }
    }

    // Ignore function definitions / type signatures in translator.ts and I18nContext.tsx
    if (rel === 'src/i18n/translator.ts' || rel === 'src/i18n/I18nContext.tsx') continue;

    let am: RegExpExecArray | null;
    while ((am = anyTCallRe.exec(code)) !== null) {
      const firstArg = am[1].split(',')[0].trim();
      if (
        (firstArg.startsWith("'") && firstArg.endsWith("'")) ||
        (firstArg.startsWith('"') && firstArg.endsWith('"')) ||
        (firstArg.startsWith('`') && firstArg.endsWith('`')) ||
        ALLOWED_DYNAMIC_T_EXPRESSIONS.has(firstArg)
      ) {
        continue;
      }
      const line = code.slice(0, am.index).split('\n').length;
      unknownDynamicCalls.push(`${rel}:${line} -> t(${firstArg})`);
    }
  }

  // Domain-driven dynamic key verification (eras, buildings, quests, months)
  for (const era of CIVILIZATION_ERAS) {
    for (const key of [`eras.${era}`, `header.eraShort.${era}`]) {
      if (!enSet.has(key) || !viSet.has(key)) {
        missingKeys.push(`CIVILIZATION_ERAS(${era}) -> '${key}'`);
      }
    }
  }
  for (const def of getAllBuildingDefinitions()) {
    for (const key of [`buildings.${def.id}.name`, `buildings.${def.id}.description`]) {
      if (!enSet.has(key) || !viSet.has(key)) {
        missingKeys.push(`BuildingCatalog(${def.id}) -> '${key}'`);
      }
    }
  }
  for (const quest of ALL_QUEST_DEFINITIONS) {
    for (const key of [quest.titleKey, quest.descriptionKey]) {
      if (!enSet.has(key) || !viSet.has(key)) {
        missingKeys.push(`ALL_QUEST_DEFINITIONS(${quest.id}) -> '${key}'`);
      }
    }
  }
  for (const period of ['DAILY', 'WEEKLY'] as const) {
    for (const slot of ['A', 'B', 'C'] as const) {
      const key = `quests.slot.${period}.${slot}`;
      if (!enSet.has(key) || !viSet.has(key)) {
        missingKeys.push(`QuestSlot(${period}:${slot}) -> '${key}'`);
      }
    }
  }
  for (let m = 1; m <= 12; m += 1) {
    const key = `stats.monthShort.${m}`;
    if (!enSet.has(key) || !viSet.has(key)) {
      missingKeys.push(`Months -> '${key}'`);
    }
  }

  assert.deepStrictEqual(missingKeys, [], `Missing i18n keys referenced in src/:\n${missingKeys.join('\n')}`);
  assert.deepStrictEqual(
    unknownDynamicCalls,
    [],
    `Unguarded dynamic t(...) expressions in src/:\n${unknownDynamicCalls.join('\n')}`
  );
});
