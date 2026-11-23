import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GridMap,
  isValidCoordinate,
  isValidFootprint,
  isValidBuildingId,
  getFootprintCoordinates,
} from '../../src/core/civilization/index.ts';

test('placementValidator: coordinate type guard validates integer coordinates strictly', () => {
  assert.strictEqual(isValidCoordinate({ x: 0, y: 0 }), true);
  assert.strictEqual(isValidCoordinate({ x: 19, y: 19 }), true);
  assert.strictEqual(isValidCoordinate({ x: -10, y: 25 }), true);

  assert.strictEqual(isValidCoordinate({ x: 1.5, y: 2 }), false);
  assert.strictEqual(isValidCoordinate({ x: 0, y: 3.14 }), false);
  assert.strictEqual(isValidCoordinate({ x: Number.NaN, y: 0 }), false);
  assert.strictEqual(isValidCoordinate({ x: 0, y: Number.POSITIVE_INFINITY }), false);
  assert.strictEqual(isValidCoordinate(null), false);
  assert.strictEqual(isValidCoordinate(undefined), false);
  assert.strictEqual(isValidCoordinate('0,0'), false);
  assert.strictEqual(isValidCoordinate({ x: 10 }), false);
});

test('placementValidator: footprint type guard requires positive integer width and height', () => {
  assert.strictEqual(isValidFootprint({ width: 1, height: 1 }), true);
  assert.strictEqual(isValidFootprint({ width: 2, height: 3 }), true);
  assert.strictEqual(isValidFootprint({ width: 5, height: 5 }), true);

  // Zero or negative
  assert.strictEqual(isValidFootprint({ width: 0, height: 1 }), false);
  assert.strictEqual(isValidFootprint({ width: 1, height: 0 }), false);
  assert.strictEqual(isValidFootprint({ width: -1, height: 2 }), false);
  assert.strictEqual(isValidFootprint({ width: 2, height: -3 }), false);

  // Floats or NaN
  assert.strictEqual(isValidFootprint({ width: 1.5, height: 1 }), false);
  assert.strictEqual(isValidFootprint({ width: 2, height: 2.2 }), false);
  assert.strictEqual(isValidFootprint({ width: Number.NaN, height: 1 }), false);

  // Malformed objects
  assert.strictEqual(isValidFootprint(null), false);
  assert.strictEqual(isValidFootprint(undefined), false);
  assert.strictEqual(isValidFootprint({ width: 2 }), false);
});

test('placementValidator: building ID validator requires non-empty string', () => {
  assert.strictEqual(isValidBuildingId('b1'), true);
  assert.strictEqual(isValidBuildingId('camp-fire-01'), true);

  assert.strictEqual(isValidBuildingId(''), false);
  assert.strictEqual(isValidBuildingId('   '), false);
  assert.strictEqual(isValidBuildingId(null), false);
  assert.strictEqual(isValidBuildingId(undefined), false);
  assert.strictEqual(isValidBuildingId(123), false);
});

test('placementValidator: getFootprintCoordinates expands right and down accurately', () => {
  // 1x1
  const coords1x1 = getFootprintCoordinates({ x: 5, y: 5 }, { width: 1, height: 1 });
  assert.deepStrictEqual(coords1x1, [{ x: 5, y: 5 }]);

  // 2x3
  const coords2x3 = getFootprintCoordinates({ x: 10, y: 20 }, { width: 2, height: 3 });
  assert.strictEqual(coords2x3.length, 6);
  assert.deepStrictEqual(coords2x3, [
    { x: 10, y: 20 },
    { x: 11, y: 20 },
    { x: 10, y: 21 },
    { x: 11, y: 21 },
    { x: 10, y: 22 },
    { x: 11, y: 22 },
  ]);
});

test('placementValidator: canPlaceBuilding allows valid placement across corners and edges', () => {
  const map = new GridMap();

  // Top-left corner: 1x1 at (0, 0)
  const check1 = map.canPlaceBuilding({ x: 0, y: 0 }, { width: 1, height: 1 });
  assert.strictEqual(check1.isValid, true);

  // Bottom-right corner: 2x2 at (6, 6) covers up to (7, 7)
  const check2 = map.canPlaceBuilding({ x: 6, y: 6 }, { width: 2, height: 2 });
  assert.strictEqual(check2.isValid, true);

  // 1x1 at exact bottom-right (7, 7)
  const check3 = map.canPlaceBuilding({ x: 7, y: 7 }, { width: 1, height: 1 });
  assert.strictEqual(check3.isValid, true);

  // 2x3 in center-right at (4, 4) covering (4..5, 4..6)
  const check4 = map.canPlaceBuilding({ x: 4, y: 4 }, { width: 2, height: 3 });
  assert.strictEqual(check4.isValid, true);
});

test('placementValidator: rejects invalid coordinates with INVALID_COORDINATE', () => {
  const map = new GridMap();

  const check1 = map.canPlaceBuilding({ x: 1.5, y: 2 }, { width: 1, height: 1 });
  assert.strictEqual(check1.isValid, false);
  assert.strictEqual(check1.reason, 'INVALID_COORDINATE');

  const check2 = map.canPlaceBuilding({ x: Number.NaN, y: 0 }, { width: 1, height: 1 });
  assert.strictEqual(check2.isValid, false);
  assert.strictEqual(check2.reason, 'INVALID_COORDINATE');
});

test('placementValidator: rejects invalid footprints with INVALID_FOOTPRINT', () => {
  const map = new GridMap();

  const check1 = map.canPlaceBuilding({ x: 5, y: 5 }, { width: 0, height: 2 });
  assert.strictEqual(check1.isValid, false);
  assert.strictEqual(check1.reason, 'INVALID_FOOTPRINT');

  const check2 = map.canPlaceBuilding({ x: 5, y: 5 }, { width: -1, height: -2 });
  assert.strictEqual(check2.isValid, false);
  assert.strictEqual(check2.reason, 'INVALID_FOOTPRINT');

  const check3 = map.canPlaceBuilding({ x: 5, y: 5 }, { width: 1.5, height: 2 });
  assert.strictEqual(check3.isValid, false);
  assert.strictEqual(check3.reason, 'INVALID_FOOTPRINT');
});

test('placementValidator: rejects duplicate building instance ID with DUPLICATE_BUILDING_ID', () => {
  const map = new GridMap();
  map.placeBuilding('shelter-1', { x: 2, y: 2 }, { width: 2, height: 2 });

  const check = map.canPlaceBuilding({ x: 6, y: 6 }, { width: 1, height: 1 }, 'shelter-1');
  assert.strictEqual(check.isValid, false);
  assert.strictEqual(check.reason, 'DUPLICATE_BUILDING_ID');
});

test('placementValidator: rejects placements exceeding map boundary with OUT_OF_BOUNDS', () => {
  const map = new GridMap();

  // Anchor is inside (tree-free), but 2x1 footprint extends right to x=8 (outside x: 0..7)
  const overflowRight = map.canPlaceBuilding({ x: 7, y: 2 }, { width: 2, height: 1 });
  assert.strictEqual(overflowRight.isValid, false);
  assert.strictEqual(overflowRight.reason, 'OUT_OF_BOUNDS');
  assert.deepStrictEqual(overflowRight.conflictingCoordinate, { x: 8, y: 2 });

  // Anchor inside, but footprint extends bottom to y=8 (outside y: 0..7)
  const overflowBottom = map.canPlaceBuilding({ x: 0, y: 7 }, { width: 1, height: 2 });
  assert.strictEqual(overflowBottom.isValid, false);
  assert.strictEqual(overflowBottom.reason, 'OUT_OF_BOUNDS');
  assert.deepStrictEqual(overflowBottom.conflictingCoordinate, { x: 0, y: 8 });

  // Anchor completely outside map
  const completelyOutside = map.canPlaceBuilding({ x: 12, y: 12 }, { width: 1, height: 1 });
  assert.strictEqual(completelyOutside.isValid, false);
  assert.strictEqual(completelyOutside.reason, 'OUT_OF_BOUNDS');
});

test('placementValidator: detects collision with CELL_OCCUPIED and identifies conflict', () => {
  const map = new GridMap();
  map.placeBuilding('market-1', { x: 4, y: 4 }, { width: 3, height: 2 });

  // 1. Exact full overlap
  const exactOverlap = map.canPlaceBuilding({ x: 4, y: 4 }, { width: 3, height: 2 }, 'new-bld');
  assert.strictEqual(exactOverlap.isValid, false);
  assert.strictEqual(exactOverlap.reason, 'CELL_OCCUPIED');
  assert.strictEqual(exactOverlap.conflictingBuildingId, 'market-1');
  assert.deepStrictEqual(exactOverlap.conflictingCoordinate, { x: 4, y: 4 });

  // 2. Partial 1-cell overlap at corner: new building at (3, 3) with 2x2 extends into (4, 4)
  const cornerOverlap = map.canPlaceBuilding({ x: 3, y: 3 }, { width: 2, height: 2 });
  assert.strictEqual(cornerOverlap.isValid, false);
  assert.strictEqual(cornerOverlap.reason, 'CELL_OCCUPIED');
  assert.strictEqual(cornerOverlap.conflictingBuildingId, 'market-1');
  assert.deepStrictEqual(cornerOverlap.conflictingCoordinate, { x: 4, y: 4 });

  // 3. Immediately adjacent without overlap is VALID
  const adjacentNorth = map.canPlaceBuilding({ x: 4, y: 2 }, { width: 2, height: 2 });
  assert.strictEqual(adjacentNorth.isValid, true);

  const adjacentWest = map.canPlaceBuilding({ x: 2, y: 3 }, { width: 2, height: 2 });
  assert.strictEqual(adjacentWest.isValid, true);
});

test('placementValidator: canPlaceBuilding is purely functional with zero side-effects', () => {
  const map = new GridMap();

  // Test multiple queries
  map.canPlaceBuilding({ x: 5, y: 5 }, { width: 2, height: 2 });
  map.canPlaceBuilding({ x: -1, y: 0 }, { width: 1, height: 1 });
  map.canPlaceBuilding({ x: 7, y: 7 }, { width: 5, height: 5 });

  // Map state must be completely untouched
  assert.strictEqual(map.getPlacedBuildingCount(), 0);
  assert.strictEqual(map.getOccupiedCellCount(), 0);
  assert.strictEqual(map.getEmptyCellCount(), 64);
});
