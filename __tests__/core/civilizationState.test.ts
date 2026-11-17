import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialCivilizationState,
  validateCivilizationState,
  sanitizeCivilizationState,
  GridMap,
  CivilizationState,
  BuildingInstance,
} from '../../src/core/civilization/index.ts';

test('CivilizationState: createInitialCivilizationState seeds pristine 8x8 Stone Age state', () => {
  const state = createInitialCivilizationState();

  assert.strictEqual(state.schemaVersion, 2);
  assert.strictEqual(state.era, 'STONE_AGE');
  assert.strictEqual(state.buildings.length, 0);
  assert.ok(state.lastUpdated > 0);

  // Validate grid snapshot structure (pre-4a-2 keys: chunks + buildings only)
  assert.strictEqual(state.grid.chunks.length, 4);
  assert.strictEqual(state.grid.buildings.length, 0);
  assert.deepStrictEqual(Object.keys(state.grid).sort(), ['buildings', 'chunks']);

  // Reconstitute GridMap and verify initial 64 cells
  const map = GridMap.fromSnapshot(state.grid);
  assert.strictEqual(map.getUnlockedCellCount(), 64);
  assert.strictEqual(map.getOccupiedCellCount(), 0);
  assert.strictEqual(map.getEmptyCellCount(), 64);

  // Initial state must pass full validation
  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, true);
  assert.deepStrictEqual(validation.errors, []);
});

test('CivilizationState: validates populated state with multiple valid building instances', () => {
  const map = new GridMap();
  map.placeBuilding('inst-1', { x: 2, y: 2 }, { width: 1, height: 1 });
  map.placeBuilding('inst-2', { x: 5, y: 5 }, { width: 2, height: 2 });

  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'inst-1',
        definitionId: 'stone_age_campfire', // 1x1
        position: { x: 2, y: 2 },
        level: 1,
        placedAt: 1000,
      },
      {
        id: 'inst-2',
        definitionId: 'stone_age_study_cave', // 2x2
        position: { x: 5, y: 5 },
        level: 2,
        placedAt: 1000,
      },
    ],
    lastUpdated: 2000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, true);
  assert.deepStrictEqual(validation.errors, []);
});

test('CivilizationState: rejects invalid schemaVersion and era', () => {
  const base = createInitialCivilizationState();

  const invalidVersion = validateCivilizationState({ ...base, schemaVersion: 0 });
  assert.strictEqual(invalidVersion.isValid, false);
  assert.ok(invalidVersion.errors.some((e) => e.includes('schemaVersion')));

  const invalidEra = validateCivilizationState({ ...base, era: 'SPACE_AGE' });
  assert.strictEqual(invalidEra.isValid, false);
  assert.ok(invalidEra.errors.some((e) => e.includes('Invalid era')));
});

test('CivilizationState: rejects duplicate building instance IDs', () => {
  const map = new GridMap();
  map.placeBuilding('dup-id', { x: 0, y: 0 }, { width: 1, height: 1 });
  map.placeBuilding('dup-id-2', { x: 5, y: 5 }, { width: 1, height: 1 });

  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'dup-id',
        definitionId: 'stone_age_campfire',
        position: { x: 0, y: 0 },
        level: 1,
        placedAt: 1000,
      },
      {
        id: 'dup-id', // Duplicate!
        definitionId: 'stone_age_campfire',
        position: { x: 5, y: 5 },
        level: 1,
        placedAt: 1000,
      },
    ],
    lastUpdated: 1000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('Duplicate building instance id')));
});

test('CivilizationState: rejects unknown building definition ID', () => {
  const map = new GridMap();
  map.placeBuilding('inst-1', { x: 0, y: 0 }, { width: 1, height: 1 });

  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'inst-1',
        definitionId: 'alien_laser_cannon', // Non-existent!
        position: { x: 0, y: 0 },
        level: 1,
        placedAt: 1000,
      },
    ],
    lastUpdated: 1000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('unknown definitionId')));
});

test('CivilizationState: rejects level out of allowed bounds', () => {
  const map = new GridMap();
  map.placeBuilding('inst-1', { x: 0, y: 0 }, { width: 1, height: 1 });

  // stone_age_campfire maxLevel is 3
  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'inst-1',
        definitionId: 'stone_age_campfire',
        position: { x: 0, y: 0 },
        level: 10, // Exceeds maxLevel 3!
        placedAt: 1000,
      },
    ],
    lastUpdated: 1000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('out of range')));
});

test('CivilizationState: rejects spatial occupancy mismatch between instances and grid', () => {
  const map = new GridMap();
  // Place on map at (5, 5), but instance records position as (0, 0)
  map.placeBuilding('inst-mismatch', { x: 5, y: 5 }, { width: 1, height: 1 });

  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'inst-mismatch',
        definitionId: 'stone_age_campfire',
        position: { x: 0, y: 0 }, // Mismatch!
        level: 1,
        placedAt: 1000,
      },
    ],
    lastUpdated: 1000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('occupancy mismatch')));
});

test('CivilizationState: validates negative coordinates when map is expanded North/West', () => {
  const map = new GridMap();
  map.expandChunk({ x: -4, y: 0 }); // West expansion (4x4 chunk)
  map.placeBuilding('inst-west', { x: -4, y: 0 }, { width: 1, height: 1 });

  const state: CivilizationState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: map.toSnapshot(),
    buildings: [
      {
        id: 'inst-west',
        definitionId: 'stone_age_campfire',
        position: { x: -4, y: 0 },
        level: 1,
        placedAt: 1000,
      },
    ],
    lastUpdated: 1000,
  };

  const validation = validateCivilizationState(state);
  assert.strictEqual(validation.isValid, true);
});

test('sanitizeCivilizationState: preserves valid state and returns null for corrupt or legacy 10x10 state', () => {
  const valid = createInitialCivilizationState();
  assert.deepStrictEqual(sanitizeCivilizationState(valid), valid);

  assert.strictEqual(sanitizeCivilizationState(null), null);
  assert.strictEqual(sanitizeCivilizationState(undefined), null);
  assert.strictEqual(sanitizeCivilizationState({ corrupt: true }), null);

  // Legacy pre-4a-2 state (10x10 chunks) must be rejected so storage re-seeds 8x8
  const legacyState = {
    schemaVersion: 2,
    era: 'STONE_AGE',
    grid: {
      chunks: [
        { id: 'chunk_0_0', origin: { x: 0, y: 0 }, dimensions: { width: 10, height: 10 } },
        { id: 'chunk_10_0', origin: { x: 10, y: 0 }, dimensions: { width: 10, height: 10 } },
        { id: 'chunk_0_10', origin: { x: 0, y: 10 }, dimensions: { width: 10, height: 10 } },
        { id: 'chunk_10_10', origin: { x: 10, y: 10 }, dimensions: { width: 10, height: 10 } },
      ],
      buildings: [],
    },
    buildings: [],
    lastUpdated: 1000,
  };
  assert.strictEqual(sanitizeCivilizationState(legacyState), null);
});
