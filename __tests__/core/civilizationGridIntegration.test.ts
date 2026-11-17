import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridMap } from '../../src/core/civilization/index.ts';

test('Integration: placeBuilding performs atomic placement and updates cell status', () => {
  const map = new GridMap();

  const result = map.placeBuilding('farm-1', { x: 2, y: 3 }, { width: 3, height: 2 });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.placedBuildingId, 'farm-1');

  assert.strictEqual(map.getPlacedBuildingCount(), 1);
  assert.strictEqual(map.getOccupiedCellCount(), 6);
  assert.strictEqual(map.hasBuilding('farm-1'), true);

  // Check each cell of the 3x2 footprint
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const cellState = map.getCellState(2 + dx, 3 + dy);
      assert.strictEqual(cellState.status, 'OCCUPIED');
      assert.strictEqual(cellState.buildingInstanceId, 'farm-1');
      assert.strictEqual(map.getOccupyingBuilding(2 + dx, 3 + dy), 'farm-1');
    }
  }

  // Neighbor cell is still EMPTY
  assert.strictEqual(map.getCellState(1, 3).status, 'EMPTY');
  assert.strictEqual(map.getCellState(5, 3).status, 'EMPTY');
});

test('Integration: placeBuilding guarantees atomicity and zero partial writes on failure', () => {
  const map = new GridMap();
  map.placeBuilding('existing-1', { x: 5, y: 5 }, { width: 2, height: 2 });

  // Attempt to place a 3x3 building at (4, 4) which overlaps at (5, 5)
  // Cells (4, 4), (5, 4), (6, 4), (4, 5) would be valid, but (5, 5) collides!
  const failed = map.placeBuilding('failing-bld', { x: 4, y: 4 }, { width: 3, height: 3 });

  assert.strictEqual(failed.success, false);
  assert.strictEqual(failed.reason, 'CELL_OCCUPIED');
  assert.strictEqual(failed.conflictingBuildingId, 'existing-1');

  // Verify ZERO cells were marked for the failed building
  assert.strictEqual(map.hasBuilding('failing-bld'), false);
  assert.strictEqual(map.getPlacedBuildingCount(), 1);
  assert.strictEqual(map.getOccupiedCellCount(), 4); // Only the 4 cells of existing-1

  assert.strictEqual(map.getCellState(4, 4).status, 'EMPTY');
  assert.strictEqual(map.getCellState(5, 4).status, 'EMPTY');
  assert.strictEqual(map.getCellState(4, 5).status, 'EMPTY');
});

test('Integration: removeBuilding frees all cells of target building and leaves others untouched', () => {
  const map = new GridMap();
  map.placeBuilding('bld-A', { x: 1, y: 1 }, { width: 2, height: 2 });
  map.placeBuilding('bld-B', { x: 5, y: 5 }, { width: 3, height: 1 });

  assert.strictEqual(map.getPlacedBuildingCount(), 2);
  assert.strictEqual(map.getOccupiedCellCount(), 7); // 4 + 3

  // Remove bld-A
  const removeResult = map.removeBuilding('bld-A');
  assert.strictEqual(removeResult.success, true);
  assert.strictEqual(removeResult.freedCellCount, 4);
  assert.strictEqual(removeResult.removedBuildingId, 'bld-A');

  // Verify bld-A is gone
  assert.strictEqual(map.hasBuilding('bld-A'), false);
  assert.strictEqual(map.getPlacedBuildingCount(), 1);
  assert.strictEqual(map.getOccupiedCellCount(), 3);

  // bld-A footprint cells are now EMPTY again
  for (let y = 1; y <= 2; y++) {
    for (let x = 1; x <= 2; x++) {
      assert.strictEqual(map.getCellState(x, y).status, 'EMPTY');
      assert.strictEqual(map.getOccupyingBuilding(x, y), undefined);
    }
  }

  // bld-B is completely intact
  assert.strictEqual(map.hasBuilding('bld-B'), true);
  for (let x = 5; x <= 7; x++) {
    assert.strictEqual(map.getCellState(x, 5).status, 'OCCUPIED');
    assert.strictEqual(map.getCellState(x, 5).buildingInstanceId, 'bld-B');
  }

  // Can immediately re-occupy vacated space
  const reuseResult = map.placeBuilding('bld-C', { x: 1, y: 1 }, { width: 1, height: 2 });
  assert.strictEqual(reuseResult.success, true);
  assert.strictEqual(map.getCellState(1, 1).buildingInstanceId, 'bld-C');
  assert.strictEqual(map.getCellState(1, 2).buildingInstanceId, 'bld-C');
});

test('Integration: removeBuilding handles non-existent or invalid building ID gracefully', () => {
  const map = new GridMap();
  map.placeBuilding('b1', { x: 0, y: 0 }, { width: 1, height: 1 });

  const nonExistent = map.removeBuilding('does-not-exist');
  assert.strictEqual(nonExistent.success, false);
  assert.strictEqual(nonExistent.reason, 'BUILDING_NOT_FOUND');
  assert.strictEqual(nonExistent.freedCellCount, 0);

  const invalid = map.removeBuilding('');
  assert.strictEqual(invalid.success, false);
  assert.strictEqual(invalid.reason, 'INVALID_BUILDING_ID');

  assert.strictEqual(map.getPlacedBuildingCount(), 1);
});

test('Integration: stress & full lifecycle invariant test across placement, expansion, removal and re-placement', () => {
  const map = new GridMap();

  // Helper to assert all internal invariants
  function assertInvariants(stepName: string) {
    const buildings = map.getAllPlacedBuildings();
    let expectedOccupiedCount = 0;
    const seenOccupiedKeys = new Set<string>();

    for (const b of buildings) {
      assert.ok(map.hasBuilding(b.buildingInstanceId), `${stepName}: hasBuilding check`);
      assert.strictEqual(
        b.occupiedCellKeys.length,
        b.footprint.width * b.footprint.height,
        `${stepName}: footprint cell count check`
      );

      for (const key of b.occupiedCellKeys) {
        assert.ok(!seenOccupiedKeys.has(key), `${stepName}: duplicate occupancy detected at ${key}`);
        seenOccupiedKeys.add(key);

        const commaIndex = key.indexOf(',');
        const x = Number(key.slice(0, commaIndex));
        const y = Number(key.slice(commaIndex + 1));

        assert.strictEqual(map.isCellUnlocked(x, y), true, `${stepName}: cell must be unlocked`);
        assert.strictEqual(
          map.getOccupyingBuilding(x, y),
          b.buildingInstanceId,
          `${stepName}: cell must point to this building`
        );
      }
      expectedOccupiedCount += b.occupiedCellKeys.length;
    }

    assert.strictEqual(
      map.getOccupiedCellCount(),
      expectedOccupiedCount,
      `${stepName}: getOccupiedCellCount mismatch`
    );
    assert.strictEqual(
      map.getEmptyCellCount(),
      map.getUnlockedCellCount() - map.getOccupiedCellCount(),
      `${stepName}: getEmptyCellCount mismatch`
    );
  }

  // Step 1: Initial state
  assertInvariants('Step 1: Init');
  assert.strictEqual(map.getUnlockedCellCount(), 64);

  // Step 2: Place diverse buildings on tree-free coordinates of the 8x8 initial map
  const buildingsToPlace = [
    { id: 'tent-1', pos: { x: 0, y: 0 }, fp: { width: 1, height: 1 } },
    { id: 'tent-2', pos: { x: 1, y: 0 }, fp: { width: 1, height: 1 } },
    { id: 'campfire-1', pos: { x: 3, y: 3 }, fp: { width: 2, height: 2 } },
    { id: 'lodge-1', pos: { x: 4, y: 0 }, fp: { width: 2, height: 3 } },
    { id: 'wall-1', pos: { x: 5, y: 4 }, fp: { width: 3, height: 1 } },
    { id: 'monolith-1', pos: { x: 0, y: 6 }, fp: { width: 2, height: 2 } },
    { id: 'granary-1', pos: { x: 6, y: 5 }, fp: { width: 2, height: 2 } },
  ];

  for (const b of buildingsToPlace) {
    const res = map.placeBuilding(b.id, b.pos, b.fp);
    assert.strictEqual(res.success, true, `Placing ${b.id} must succeed`);
  }
  assert.strictEqual(map.getPlacedBuildingCount(), 7);
  assertInvariants('Step 2: Multiple buildings placed');

  // Step 3: Collisions and out of bounds must fail cleanly
  const collisions = [
    { id: 'col-1', pos: { x: 0, y: 0 }, fp: { width: 1, height: 1 } }, // On tent-1
    { id: 'col-2', pos: { x: 2, y: 2 }, fp: { width: 2, height: 2 } }, // Partially on campfire-1 (3,3)
    { id: 'col-3', pos: { x: 6, y: 6 }, fp: { width: 4, height: 2 } }, // Overflow edge of 8x8
  ];
  for (const col of collisions) {
    const res = map.placeBuilding(col.id, col.pos, col.fp);
    assert.strictEqual(res.success, false);
  }
  assert.strictEqual(map.getPlacedBuildingCount(), 7);
  assertInvariants('Step 3: After rejected collisions');

  // Step 4: Expand map in multiple directions (4x4 chunks)
  const expEast = map.expandChunk({ x: 8, y: 0 });
  assert.strictEqual(expEast.success, true);
  const expSouth = map.expandChunk({ x: 0, y: 8 });
  assert.strictEqual(expSouth.success, true);
  const expNorth = map.expandChunk({ x: 4, y: -4 });
  assert.strictEqual(expNorth.success, true);

  assert.strictEqual(map.getUnlockedChunkCount(), 7);
  assert.strictEqual(map.getUnlockedCellCount(), 112);
  assertInvariants('Step 4: After expansions');

  // Step 5: Place buildings in newly expanded chunks (pick a valid 2x2 spot inside each new chunk)
  const east2x2Pos = (() => {
    for (let y = 0; y <= 2; y++) {
      for (let x = 8; x <= 10; x++) {
        if (map.canPlaceBuilding({ x, y }, { width: 2, height: 2 }).isValid) return { x, y };
      }
    }
    throw new Error('Expected at least one free 2x2 block in East chunk (8,0)');
  })();
  const resNewEast = map.placeBuilding('harbor-1', east2x2Pos, { width: 2, height: 2 });
  assert.strictEqual(resNewEast.success, true);

  const north2x2Pos = (() => {
    for (let y = -4; y <= -2; y++) {
      for (let x = 4; x <= 6; x++) {
        if (map.canPlaceBuilding({ x, y }, { width: 2, height: 2 }).isValid) return { x, y };
      }
    }
    throw new Error('Expected at least one free 2x2 block in North chunk (4,-4)');
  })();
  const resNewNorth = map.placeBuilding('observatory-1', north2x2Pos, { width: 2, height: 2 });
  assert.strictEqual(resNewNorth.success, true);

  assert.strictEqual(map.getPlacedBuildingCount(), 9);
  assertInvariants('Step 5: Placed in new chunks');

  // Step 6: Remove 3 buildings
  map.removeBuilding('tent-1');
  map.removeBuilding('campfire-1');
  map.removeBuilding('monolith-1');
  assert.strictEqual(map.getPlacedBuildingCount(), 6);
  assertInvariants('Step 6: After removals');

  // Step 7: Place new building in space previously occupied by campfire-1 (3, 3)
  const replaceRes = map.placeBuilding('great-temple', { x: 3, y: 3 }, { width: 2, height: 2 });
  assert.strictEqual(replaceRes.success, true);
  assert.strictEqual(map.getPlacedBuildingCount(), 7);
  assertInvariants('Step 7: Re-placed in vacated spot');

  // Final check: verify snapshot roundtrip under stress state
  const snapshot = map.toSnapshot();
  const restored = GridMap.fromSnapshot(snapshot);
  assert.strictEqual(restored.getPlacedBuildingCount(), map.getPlacedBuildingCount());
  assert.strictEqual(restored.getOccupiedCellCount(), map.getOccupiedCellCount());
  assert.strictEqual(restored.getUnlockedCellCount(), map.getUnlockedCellCount());
});
