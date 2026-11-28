import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { EraAdvanceModal } from '../../src/ui/components/civilization/EraAdvanceModal.tsx';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import { Header } from '../../src/ui/components/Header.tsx';
import {
  EraAdvanceCheckItem,
  STONE_TO_BRONZE_ADVANCE_REQUIREMENTS,
} from '../../src/core/civilization/eraRules.ts';
import { EraAdvanceStatusResponseData } from '../../src/types/messages.ts';
import { ERA_ADVANCE_ENABLED } from '../../src/core/civilization/constants.ts';
import { SupportedLocale } from '../../src/i18n/types.ts';

function buildSampleChecks(allMet: boolean): EraAdvanceCheckItem[] {
  return [
    ...STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.buildingRequirements.map((r, idx) => ({
      id: `building:${r.definitionId}` as const,
      current: allMet ? r.minCount : idx === 0 ? 1 : 0,
      required: r.minCount,
      met: allMet ? true : idx === 0,
    })),
    ...STONE_TO_BRONZE_ADVANCE_REQUIREMENTS.villagerRequirements.map((r) => ({
      id: `villager:${r.role}` as const,
      current: allMet ? r.minCount : 0,
      required: r.minCount,
      met: allMet,
    })),
    {
      id: 'land_expansions',
      current: allMet ? 3 : 1,
      required: 3,
      met: allMet,
    },
    {
      id: 'player_level',
      current: allMet ? 9 : 4,
      required: 9,
      met: allMet,
    },
    {
      id: 'total_focus_minutes',
      current: allMet ? 520 : 120,
      required: 500,
      met: allMet,
    },
    {
      id: 'fee_coins',
      current: allMet ? 600 : 150,
      required: 500,
      met: allMet,
    },
  ];
}

function renderWithLocale(locale: SupportedLocale, element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

test('5C-2a UI: EraAdvanceModal renders switch-OFF disabled banner, checklist & unmet statuses in EN and VI', () => {
  const status: EraAdvanceStatusResponseData = {
    enabled: false,
    currentEra: 'STONE_AGE',
    nextEra: 'BRONZE_AGE',
    eligible: false,
    feeCoins: 500,
    checks: buildSampleChecks(false),
  };

  const enHtml = renderWithLocale(
    'en',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'STONE_AGE',
      status,
      onClose: () => {},
      onAdvanceEra: async () => {},
    })
  );

  assert.ok(enHtml.includes('data-testid="era-advance-modal"'));
  assert.ok(enHtml.includes('data-testid="era-disabled-banner"'));
  assert.ok(enHtml.includes('Era Advancement Not Yet Enabled'));
  assert.ok(enHtml.includes('Unavailable Yet'));
  assert.ok(enHtml.includes('data-met="true"'));
  assert.ok(enHtml.includes('data-met="false"'));
  assert.ok(enHtml.includes('Met'));
  assert.ok(enHtml.includes('Unmet'));
  assert.ok(enHtml.includes('Stone Age'));
  assert.ok(enHtml.includes('Bronze Age'));

  const viHtml = renderWithLocale(
    'vi',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'STONE_AGE',
      status,
      onClose: () => {},
      onAdvanceEra: async () => {},
    })
  );

  assert.ok(viHtml.includes('Chức Năng Lên Thời Đại Chưa Bật'));
  assert.ok(viHtml.includes('Chưa khả dụng'));
  assert.ok(viHtml.includes('Đạt'));
  assert.ok(viHtml.includes('Chưa đạt'));
  assert.ok(viHtml.includes('Thời đại Đồ Đá'));
  assert.ok(viHtml.includes('Thời đại Đồ Đồng'));
});

test('5C-2a UI: EraAdvanceModal renders enabled eligible button, localized error banner, success banner, and Bronze already-advanced view', () => {
  const eligibleStatus: EraAdvanceStatusResponseData = {
    enabled: true,
    currentEra: 'STONE_AGE',
    nextEra: 'BRONZE_AGE',
    eligible: true,
    feeCoins: 500,
    checks: buildSampleChecks(true),
  };

  const enReady = renderWithLocale(
    'en',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'STONE_AGE',
      status: eligibleStatus,
      onClose: () => {},
      onAdvanceEra: async () => {},
      error: {
        code: 'CIV_INSUFFICIENT_BUILDING_COINS',
        message: 'Insufficient coins',
        params: { eraName: 'BRONZE_AGE', cost: 500, balance: 250 },
      },
    })
  );
  assert.ok(!enReady.includes('data-testid="era-disabled-banner"'));
  assert.ok(enReady.includes('Advance to Bronze Age'));
  assert.ok(enReady.includes('data-testid="era-advance-error"'));
  assert.ok(enReady.includes('advancing to Bronze Age costs 500 Coins'));

  const enSuccess = renderWithLocale(
    'en',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'BRONZE_AGE',
      status: null,
      onClose: () => {},
      onAdvanceEra: async () => {},
      successEra: 'BRONZE_AGE',
      paidFeeCoins: 500,
    })
  );
  assert.ok(enSuccess.includes('Welcome to the Bronze Age!'));

  const viSuccess = renderWithLocale(
    'vi',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'BRONZE_AGE',
      status: null,
      onClose: () => {},
      onAdvanceEra: async () => {},
      successEra: 'BRONZE_AGE',
      paidFeeCoins: 500,
    })
  );
  assert.ok(viSuccess.includes('Chào mừng đến Thời đại Đồ Đồng!'));

  const bronzeAlreadyStatus: EraAdvanceStatusResponseData = {
    enabled: true,
    currentEra: 'BRONZE_AGE',
    nextEra: null,
    eligible: false,
    feeCoins: 0,
    checks: [],
  };

  const enAlready = renderWithLocale(
    'en',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'BRONZE_AGE',
      status: bronzeAlreadyStatus,
      onClose: () => {},
      onAdvanceEra: async () => {},
    })
  );
  assert.ok(enAlready.includes('data-testid="era-already-advanced-view"'));
  assert.ok(enAlready.includes('Iron Age: coming later'));
  assert.ok(!enAlready.includes('data-testid="era-advance-step1-btn"'));

  const viAlready = renderWithLocale(
    'vi',
    React.createElement(EraAdvanceModal, {
      isOpen: true,
      currentEra: 'BRONZE_AGE',
      status: bronzeAlreadyStatus,
      onClose: () => {},
      onAdvanceEra: async () => {},
    })
  );
  assert.ok(viAlready.includes('Thời đại Đồ Sắt: sẽ có sau'));
});

test('5C-2a UI: CivilizationHeader interactive Era button & top Header BRONZE_AGE display', () => {
  const civHeaderReady = renderWithLocale(
    'en',
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 600,
      lifetimeFocusMinutes: 500,
      activeBonusRate: 0.25,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
      onOpenEraModal: () => {},
      eraAdvanceEnabled: true,
      eraAdvanceEligible: true,
    })
  );
  assert.ok(civHeaderReady.includes('data-testid="civ-era-badge-btn"'));
  assert.ok(civHeaderReady.includes('data-testid="civ-era-ready-dot"'));

  const headerBronzeEn = renderWithLocale(
    'en',
    React.createElement(Header, {
      economy: { focusCoins: 42.38, totalXP: 3600, level: 9 },
      era: 'BRONZE_AGE',
    })
  );
  assert.ok(headerBronzeEn.includes('data-testid="header-era-badge"'));
  assert.ok(headerBronzeEn.includes('Bronze'));

  const headerBronzeVi = renderWithLocale(
    'vi',
    React.createElement(Header, {
      economy: { focusCoins: 42.38, totalXP: 3600, level: 9 },
      era: 'BRONZE_AGE',
    })
  );
  assert.ok(headerBronzeVi.includes('Đồ Đồng'));
});

test('5C-2a static audit: kill-switch OFF and no banned terminology or DEV_* leaks in 5C-2a production files', () => {
  assert.equal(ERA_ADVANCE_ENABLED, false);
  const root = path.resolve(import.meta.dirname, '../..');
  const prodFiles = [
    'src/core/civilization/eraRules.ts',
    'src/background/civilizationCoordinator.ts',
    'src/background/messageHandler.ts',
    'src/ui/services/extensionClient.ts',
    'src/ui/components/civilization/EraAdvanceModal.tsx',
    'src/ui/components/civilization/CivilizationHeader.tsx',
    'src/ui/components/civilization/CivilizationScreen.tsx',
  ];
  for (const rel of prodFiles) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/Ancient Totem|Vật tổ/i.test(src), false, `Banned totem label in ${rel}`);
    assert.equal(
      /GOD MODE|GOD_MODE|\bDEV_(?!SERVER_MOCK_LIMITS\b)[A-Z0-9_]+/.test(src),
      false,
      `Dev leak in ${rel}`
    );
  }
});
