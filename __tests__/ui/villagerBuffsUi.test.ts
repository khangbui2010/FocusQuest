import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { I18nProvider } from '../../src/i18n/I18nContext.tsx';
import { BuildingDetailsModal } from '../../src/ui/components/civilization/BuildingDetailsModal.tsx';
import { LandExpansionModal } from '../../src/ui/components/civilization/LandExpansionModal.tsx';
import { BuildingCatalogPanel } from '../../src/ui/components/civilization/BuildingCatalogPanel.tsx';
import { CivilizationHeader } from '../../src/ui/components/civilization/CivilizationHeader.tsx';
import { RewardHelpModal } from '../../src/ui/components/RewardHelpModal.tsx';
import { BuildingInstance } from '../../src/core/civilization/buildingTypes.ts';
import { Villager } from '../../src/core/civilization/villager.ts';
import { VillagerRole } from '../../src/ui/components/civilization/spriteRegistry.ts';

function renderLocale(locale: 'en' | 'vi', element: React.ReactElement): string {
  return renderToString(React.createElement(I18nProvider, { locale }, element));
}

function makeVillagers(spec: Partial<Record<VillagerRole, number>>): Villager[] {
  const result: Villager[] = [];
  let idx = 0;
  (['elder', 'crafter', 'woodworker'] as const).forEach((role) => {
    const count = spec[role] ?? 0;
    for (let i = 0; i < count; i += 1) {
      idx += 1;
      result.push({ id: `v_${idx}`, role, recruitedAt: 1000 + idx });
    }
  });
  return result;
}

test('VillagerBuffs UI (BuildingDetailsModal): Cave buff summary, At cap badges, selected role preview, and Elder upgrade discount', () => {
  const caveBuilding: BuildingInstance = {
    id: 'cave_1',
    definitionId: 'stone_age_study_cave',
    position: { x: 0, y: 0 },
    level: 5,
    placedAt: 1700000000000,
  };
  const foragingLv1: BuildingInstance = {
    id: 'forage_1',
    definitionId: 'stone_age_foraging_post',
    position: { x: 4, y: 0 },
    level: 1,
    placedAt: 1700000000000,
  };

  // Partial tribe with 0 woodworkers -> inactive tribe + Elder selected preview
  const cavePartialEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: caveBuilding,
      villagers: makeVillagers({ elder: 2, crafter: 1 }),
      playerLevel: 10,
      playerCoins: 1000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      onRecruitVillager: async () => {},
    })
  );
  assert.ok(cavePartialEn.includes('data-testid="selected-role-buff-preview"'));
  assert.ok(cavePartialEn.includes('-6% building upgrade cost'));
  assert.ok(cavePartialEn.includes('data-testid="villager-buff-summary"'));
  assert.ok(cavePartialEn.includes('Crafters (1): +5% CoinBonus'));
  assert.ok(cavePartialEn.includes('Elders (2): -12% Upgrade Cost'));
  assert.ok(cavePartialEn.includes('Complete Tribe Synergy: Need all 3 roles (+10% CoinBonus)'));
  assert.ok(!cavePartialEn.includes('>At cap<'));

  // Capped roster: 8 crafters, 8 woodworkers, 5 elders -> "At cap" / "Đạt trần" + Complete Tribe active
  const cappedRoster = makeVillagers({ crafter: 8, woodworker: 8, elder: 5 });
  const caveCappedEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: caveBuilding,
      villagers: cappedRoster,
      playerLevel: 10,
      playerCoins: 1000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      onRecruitVillager: async () => {},
    })
  );
  assert.strictEqual((caveCappedEn.match(/>At cap</g) ?? []).length, 3);
  assert.ok(caveCappedEn.includes('Complete Tribe Synergy: Active (+10% CoinBonus)'));

  const caveCappedVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: caveBuilding,
      villagers: cappedRoster,
      playerLevel: 10,
      playerCoins: 1000,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
      onRecruitVillager: async () => {},
    })
  );
  assert.strictEqual((caveCappedVi.match(/>Đạt trần</g) ?? []).length, 3);
  assert.ok(caveCappedVi.includes('Hiệp lực Bộ tộc: Đang bật (+10% CoinBonus)'));

  // Elder discount strikethrough & badge on upgradeable building (5 elders = -30% on baseCost 24 -> 17)
  const discountedEn = renderLocale(
    'en',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv1,
      villagers: makeVillagers({ elder: 5 }),
      playerLevel: 5,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(discountedEn.includes('Next Lv. 2 · Cost: 17 Coins'));
  assert.ok(discountedEn.includes('data-testid="upgrade-base-cost-strike"'));
  assert.ok(discountedEn.includes('>24<'));
  assert.ok(discountedEn.includes('data-testid="upgrade-discount-badge"'));
  assert.ok(discountedEn.includes('-30% Elder'));

  const discountedVi = renderLocale(
    'vi',
    React.createElement(BuildingDetailsModal, {
      building: foragingLv1,
      villagers: makeVillagers({ elder: 5 }),
      playerLevel: 5,
      playerCoins: 500,
      onClose: () => {},
      onRemove: async () => {},
      onUpgrade: async () => {},
    })
  );
  assert.ok(discountedVi.includes('Cấp kế Lv. 2 · Chi phí: 17 Coin'));
  assert.ok(discountedVi.includes('-30% Trưởng lão'));
});

test('VillagerBuffs UI (LandExpansionModal): Woodworker discount strikethrough & badge in EN/VI', () => {
  const noDiscountHtml = renderLocale(
    'en',
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: [],
      onConfirm: async () => {},
      onClose: () => {},
    })
  );
  assert.ok(!noDiscountHtml.includes('data-testid="expand-base-cost-strike"'));
  assert.ok(!noDiscountHtml.includes('data-testid="expand-discount-badge"'));

  const woodworkers = makeVillagers({ woodworker: 4 }); // -20% of 30 = 24 Coins
  const discountEn = renderLocale(
    'en',
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: woodworkers,
      onConfirm: async () => {},
      onClose: () => {},
    })
  );
  assert.ok(discountEn.includes('data-testid="expand-base-cost-strike"'));
  assert.ok(discountEn.includes('30 Coins'));
  assert.ok(discountEn.includes('data-testid="expand-discount-badge"'));
  assert.ok(discountEn.includes('-20% Woodworker'));
  assert.ok(discountEn.includes('24 Coins'));

  const discountVi = renderLocale(
    'vi',
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: woodworkers,
      onConfirm: async () => {},
      onClose: () => {},
    })
  );
  assert.ok(discountVi.includes('-20% Tiều phu'));
  assert.ok(discountVi.includes('24 Coin'));

  const founderWoodworkerHtml = renderLocale(
    'en',
    React.createElement(LandExpansionModal, {
      isOpen: true,
      selectedOrigin: { x: 8, y: 0 },
      chunksCount: 4,
      playerLevel: 3,
      playerCoins: 120,
      villagers: makeVillagers({ elder: 1 }),
      founderRole: 'woodworker',
      onConfirm: async () => {},
      onClose: () => {},
    })
  );
  assert.ok(founderWoodworkerHtml.includes('-5% Woodworker'));
  assert.ok(founderWoodworkerHtml.includes('29 Coins'));
});

test('VillagerBuffs UI (RewardHelpModal, CivilizationHeader, BuildingCatalogPanel): Bilingual villager buffs, combined bonus, and era max level', () => {
  const helpEn = renderLocale(
    'en',
    React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
  );
  assert.ok(helpEn.includes('data-testid="help-villager-buffs"'));
  assert.ok(helpEn.includes('Villager Role Buffs &amp; Tribe Synergy'));
  assert.ok(helpEn.includes('Crafter: +5% additive Focus CoinBonus per villager (cap +40%). Focus Coins only.'));
  assert.ok(helpEn.includes('Woodworker: -5% land expansion Coin cost per villager (cap -40%). Player Level gate unchanged.'));
  assert.ok(helpEn.includes('Elder: -6% building upgrade Coin cost per villager (cap -30%). Upgrades only.'));
  assert.ok(helpEn.includes('Complete Tribe: having at least 1 Elder, 1 Crafter, and 1 Woodworker grants +10% additive CoinBonus.'));

  const helpVi = renderLocale(
    'vi',
    React.createElement(RewardHelpModal, { isOpen: true, onClose: () => {} })
  );
  assert.ok(helpVi.includes('data-testid="help-villager-buffs"'));
  assert.ok(helpVi.includes('Hiệu ứng Dân làng &amp; Hiệp lực Bộ tộc'));
  assert.ok(helpVi.includes('Thợ thủ công: +5% CoinBonus cộng dồn mỗi dân (trần +40%). Chỉ áp dụng cho Focus Coin.'));
  assert.ok(helpVi.includes('Tiều phu: giảm 5% chi phí Coin mở đất mỗi dân (trần -40%). Giữ nguyên mốc Level.'));
  assert.ok(helpVi.includes('Trưởng lão: giảm 6% chi phí Coin nâng cấp công trình mỗi dân (trần -30%). Chỉ áp dụng cho nâng cấp.'));
  assert.ok(helpVi.includes('Đủ 3 vai trò: có ít nhất 1 Trưởng lão, 1 Thợ thủ công và 1 Tiều phu tặng thêm +10% CoinBonus.'));

  // CivilizationHeader reflects combined building + villager CoinBonus (+14%)
  const headerHtml = renderLocale(
    'en',
    React.createElement(CivilizationHeader, {
      era: 'STONE_AGE',
      focusCoins: 500,
      lifetimeFocusMinutes: 300,
      activeBonusRate: 0.14,
      isPlacementMode: false,
      selectedBuildingDef: null,
      onCancelPlacement: () => {},
      onOpenCatalog: () => {},
      onOpenExpansion: () => {},
    })
  );
  assert.ok(headerHtml.includes('+14%'));

  // BuildingCatalogPanel respects currentEra when displaying effective max level
  const catalogHtml = renderLocale(
    'en',
    React.createElement(BuildingCatalogPanel, {
      isOpen: true,
      onClose: () => {},
      playerLevel: 5,
      playerCoins: 500,
      lifetimeFocusMinutes: 300,
      currentEra: 'STONE_AGE',
      placedBuildings: [],
      onSelectBuilding: () => {},
    })
  );
  assert.ok(catalogHtml.includes('Max Lv. 5'));
});
