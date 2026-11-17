import {
  BuildingDefinition,
  CivilizationEra,
} from '../../core/civilization/buildingTypes.ts';
import { getBuildingDefinition } from '../../core/civilization/buildingCatalog.ts';
import { translate } from '../../i18n/translator.ts';
import { SupportedLocale, TranslationKey } from '../../i18n/types.ts';

const BUILDING_NAME_KEYS: Record<string, TranslationKey> = {
  stone_age_campfire: 'buildings.stone_age_campfire.name',
  stone_age_totem: 'buildings.stone_age_totem.name',
  stone_age_study_cave: 'buildings.stone_age_study_cave.name',
  stone_age_elder_hut: 'buildings.stone_age_elder_hut.name',
  stone_age_foraging_post: 'buildings.stone_age_foraging_post.name',
  stone_age_food_cache: 'buildings.stone_age_food_cache.name',
};

const BUILDING_DESC_KEYS: Record<string, TranslationKey> = {
  stone_age_campfire: 'buildings.stone_age_campfire.description',
  stone_age_totem: 'buildings.stone_age_totem.description',
  stone_age_study_cave: 'buildings.stone_age_study_cave.description',
  stone_age_elder_hut: 'buildings.stone_age_elder_hut.description',
  stone_age_foraging_post: 'buildings.stone_age_foraging_post.description',
  stone_age_food_cache: 'buildings.stone_age_food_cache.description',
};

const ERA_KEYS: Record<CivilizationEra, TranslationKey> = {
  STONE_AGE: 'eras.STONE_AGE',
  BRONZE_AGE: 'eras.BRONZE_AGE',
  IRON_AGE: 'eras.IRON_AGE',
  MEDIEVAL: 'eras.MEDIEVAL',
  EARLY_MODERN: 'eras.EARLY_MODERN',
  MODERN: 'eras.MODERN',
  FUTURISTIC: 'eras.FUTURISTIC',
  INTERPLANETARY: 'eras.INTERPLANETARY',
};

export function getLocalizedBuildingName(
  locale: SupportedLocale,
  defOrId: BuildingDefinition | string | null | undefined,
  fallbackName?: string
): string {
  const id = typeof defOrId === 'string' ? defOrId : defOrId?.id;
  if (id && BUILDING_NAME_KEYS[id]) {
    return translate(locale, BUILDING_NAME_KEYS[id]);
  }
  if (fallbackName) return fallbackName;
  if (typeof defOrId === 'object' && defOrId?.name) return defOrId.name;
  if (id) {
    const def = getBuildingDefinition(id);
    if (def?.name) return def.name;
  }
  return id ?? '';
}

export function getLocalizedBuildingDescription(
  locale: SupportedLocale,
  defOrId: BuildingDefinition | string | null | undefined,
  fallbackDescription?: string
): string {
  const id = typeof defOrId === 'string' ? defOrId : defOrId?.id;
  if (id && BUILDING_DESC_KEYS[id]) {
    return translate(locale, BUILDING_DESC_KEYS[id]);
  }
  if (fallbackDescription) return fallbackDescription;
  if (typeof defOrId === 'object' && defOrId?.description) return defOrId.description;
  if (id) {
    const def = getBuildingDefinition(id);
    if (def?.description) return def.description;
  }
  return '';
}

export function getLocalizedEraName(
  locale: SupportedLocale,
  era: CivilizationEra | string | null | undefined
): string {
  if (!era) {
    return translate(locale, 'eras.STONE_AGE');
  }
  if (era in ERA_KEYS) {
    return translate(locale, ERA_KEYS[era as CivilizationEra]);
  }
  return String(era)
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
}
