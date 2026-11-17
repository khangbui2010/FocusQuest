import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GridMap,
  INITIAL_GRID_WIDTH,
  INITIAL_GRID_HEIGHT,
  CHUNK_WIDTH,
  CHUNK_HEIGHT,
  INITIAL_TOTAL_CELLS,
} from '../../src/core/civilization/index.ts';

test('GridMap: initializes with exact 8x8 dimensions and 64 unlocked cells', () => {
  const map = new GridMap();

  assert.strictEqual(map.getUnlockedCellCount(), INITIAL_TOTAL_CELLS);
  assert.strictEqual(map.getUnlockedCellCount(), 64);
  assert.strictEqual(map.getOccupiedCellCount(), 0);
  assert.strictEqual(map.getEmptyCellCount(), 64);
  assert.strictEqual(map.getPlacedBuildingCount(), 0);
  assert.strictEqual(map.getUnlockedChunkCount(), 4);

  const box = map.getBoundingBox();
  assert.strictEqual(box.minX, 0);
  assert.strictEqual(box.maxX, 7);
  assert.strictEqual(box.minY, 0);
  assert.strictEqual(box.maxY, 7);
  assert.strictEqual(box.width, INITIAL_GRID_WIDTH);
  assert.strictEqual(box.height, INITIAL_GRID_HEIGHT);
});

test('GridMap: four initial 4x4 chunks cover [0,7]x[0,7] without gaps or overlaps', () => {
  const map = new GridMap();
  const chunks = map.getUnlockedChunks();

  assert.strictEqual(chunks.length, 4);

  const origins = chunks.map((c) => `${c.origin.x},${c.origin.y}`).sort();
  assert.deepStrictEqual(origins, ['0,0', '0,4', '4,0', '4,4']);

  for (const chunk of chunks) {
    assert.strictEqual(chunk.dimensions.width, CHUNK_WIDTH);
    assert.strictEqual(chunk.dimensions.height, CHUNK_HEIGHT);
  }

  // Verify all 64 individual cells are unlocked and EMPTY
  for (let y = 0; y < INITIAL_GRID_HEIGHT; y++) {
    for (let x = 0; x < INITIAL_GRID_WIDTH; x++) {
      assert.strictEqual(map.isCellUnlocked(x, y), true, `Cell (${x}, ${y}) must be unlocked`);
      assert.strictEqual(map.getCellState(x, y).status, 'EMPTY');
    }
  }
});

test('GridMap: two separate instances do not share mutable state', () => {
  const map1 = new GridMap();
  const map2 = new GridMap();

  map1.placeBuilding('b1', { x: 4, y: 4 }, { width: 2, height: 2 });

  assert.strictEqual(map1.getPlacedBuildingCount(), 1);
  assert.strictEqual(map1.getOccupiedCellCount(), 4);

  assert.strictEqual(map2.getPlacedBuildingCount(), 0);
  assert.strictEqual(map2.getOccupiedCellCount(), 0);
  assert.strictEqual(map2.getCellState(4, 4).status, 'EMPTY');
});

test('GridMap: boundary checks and coordinates outside initial grid are BLOCKED', () => {
  const map = new GridMap();

  // Valid 4 corners of 8x8 map
  assert.strictEqual(map.isCellUnlocked(0, 0), true);
  assert.strictEqual(map.isCellUnlocked(7, 0), true);
  assert.strictEqual(map.isCellUnlocked(0, 7), true);
  assert.strictEqual(map.isCellUnlocked(7, 7), true);

  // Directly outside edges
  assert.strictEqual(map.isCellUnlocked(-1, 0), false);
  assert.strictEqual(map.isCellUnlocked(0, -1), false);
  assert.strictEqual(map.isCellUnlocked(8, 0), false);
  assert.strictEqual(map.isCellUnlocked(0, 8), false);
  assert.strictEqual(map.isCellUnlocked(8, 8), false);
  assert.strictEqual(map.isCellUnlocked(-1, -1), false);

  // Non-integer and malformed coordinates
  assert.strictEqual(map.isCellUnlocked(1.5, 2), false);
  assert.strictEqual(map.isCellUnlocked(0, 3.14), false);
  assert.strictEqual(map.isCellUnlocked(Number.NaN, 0), false);
  assert.strictEqual(map.isCellUnlocked(0, Number.POSITIVE_INFINITY), false);

  // Query cell status outside returns BLOCKED
  assert.strictEqual(map.getCellState(-1, 0).status, 'BLOCKED');
  assert.strictEqual(map.getCellState(8, 4).status, 'BLOCKED');
  assert.strictEqual(map.getCellState(5, 12).status, 'BLOCKED');
});

test('GridMap: chunk expansion East adds 16 cells and updates bounding box', () => {
  const map = new GridMap();

  // Expand East from (4, 0) -> new chunk at (8, 0)
  const result = map.expandChunk({ x: 8, y: 0 });
  assert.strictEqual(result.success, true);
  assert.ok(result.chunk);
  assert.strictEqual(result.chunk!.id, 'chunk_8_0');
  assert.strictEqual(map.getUnlockedChunkCount(), 5);
  assert.strictEqual(map.getUnlockedCellCount(), 80);
  assert.strictEqual(map.getEmptyCellCount(), 80);

  // Bounding box maxX expands to 11
  const box = map.getBoundingBox();
  assert.strictEqual(box.minX, 0);
  assert.strictEqual(box.maxX, 11);
  assert.strictEqual(box.minY, 0);
  assert.strictEqual(box.maxY, 7);

  // New cells are now unlocked and EMPTY
  for (let x = 8; x <= 11; x++) {
    for (let y = 0; y <= 3; y++) {
      assert.strictEqual(map.isCellUnlocked(x, y), true);
      assert.strictEqual(map.getCellState(x, y).status, 'EMPTY');
    }
  }

  // (8, 4) is still locked since we only expanded (8, 0)
  assert.strictEqual(map.isCellUnlocked(8, 4), false);
});

test('GridMap: chunk expansion North and West supports negative coordinates seamlessly', () => {
  const map = new GridMap();

  // Expand North: (0, -4)
  const northResult = map.expandChunk({ x: 0, y: -4 });
  assert.strictEqual(northResult.success, true);
  assert.strictEqual(map.isCellUnlocked(0, -1), true);
  assert.strictEqual(map.isCellUnlocked(3, -4), true);

  // Expand West: (-4, 0)
  const westResult = map.expandChunk({ x: -4, y: 0 });
  assert.strictEqual(westResult.success, true);
  assert.strictEqual(map.isCellUnlocked(-1, 0), true);
  assert.strictEqual(map.isCellUnlocked(-4, 3), true);

  const box = map.getBoundingBox();
  assert.strictEqual(box.minX, -4);
  assert.strictEqual(box.minY, -4);
  assert.strictEqual(box.maxX, 7);
  assert.strictEqual(box.maxY, 7);
});

test('GridMap: rejects non-adjacent (disconnected) chunk expansion', () => {
  const map = new GridMap();

  // Disconnected chunk at (16, 16)
  const result = map.expandChunk({ x: 16, y: 16 });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'CHUNK_NOT_ADJACENT');
  assert.strictEqual(map.getUnlockedChunkCount(), 4);
  assert.strictEqual(map.getUnlockedCellCount(), 64);

  // Diagonal only at (8, 8) with no orthogonal neighbor
  const diagonalResult = map.expandChunk({ x: 8, y: 8 });
  assert.strictEqual(diagonalResult.success, false);
  assert.strictEqual(diagonalResult.reason, 'CHUNK_NOT_ADJACENT');
});

test('GridMap: rejects duplicate chunk expansion and preserves state', () => {
  const map = new GridMap();

  // (0, 0) already exists
  const dupResult = map.expandChunk({ x: 0, y: 0 });
  assert.strictEqual(dupResult.success, false);
  assert.strictEqual(dupResult.reason, 'CHUNK_ALREADY_EXISTS');
  assert.strictEqual(map.getUnlockedChunkCount(), 4);
  assert.strictEqual(map.getUnlockedCellCount(), 64);
});

test('GridMap: rejects unaligned chunk origin coordinates', () => {
  const map = new GridMap();

  // Not aligned to 4-cell multiples
  const unaligned1 = map.expandChunk({ x: 5, y: 0 });
  assert.strictEqual(unaligned1.success, false);
  assert.strictEqual(unaligned1.reason, 'INVALID_ORIGIN');

  const unaligned2 = map.expandChunk({ x: 8, y: 3 });
  assert.strictEqual(unaligned2.success, false);
  assert.strictEqual(unaligned2.reason, 'INVALID_ORIGIN');

  const unaligned3 = map.expandChunk({ x: 8.5, y: 0 });
  assert.strictEqual(unaligned3.success, false);
  assert.strictEqual(unaligned3.reason, 'INVALID_ORIGIN');
});

test('GridMap: getAvailableExpansionSlots returns all valid adjacent chunk origins', () => {
  const map = new GridMap();
  const slots = map.getAvailableExpansionSlots();

  // Initial 8x8 map has 4 chunks: (0,0), (4,0), (0,4), (4,4).
  // Exterior neighbors:
  // North: (0, -4), (4, -4)
  // South: (0, 8), (4, 8)
  // East: (8, 0), (8, 4)
  // West: (-4, 0), (-4, 4)
  // Total 8 available orthogonal expansion slots!
  assert.strictEqual(slots.length, 8);

  const formattedSlots = slots.map((s) => `${s.x},${s.y}`);
  assert.ok(formattedSlots.includes('0,-4'));
  assert.ok(formattedSlots.includes('4,-4'));
  assert.ok(formattedSlots.includes('8,0'));
  assert.ok(formattedSlots.includes('8,4'));
  assert.ok(formattedSlots.includes('0,8'));
  assert.ok(formattedSlots.includes('4,8'));
  assert.ok(formattedSlots.includes('-4,0'));
  assert.ok(formattedSlots.includes('-4,4'));

  // Every returned slot must be valid to expand
  for (const slot of slots) {
    const check = map.canExpandChunk(slot);
    assert.strictEqual(check.canExpand, true, `Slot (${slot.x}, ${slot.y}) should be expandable`);
  }
});

test('GridMap: directional expandInDirection helper is removed in favor of explicit origin slots', () => {
  const map = new GridMap();
  assert.strictEqual(
    (map as unknown as Record<string, unknown>).expandInDirection,
    undefined,
    'expandInDirection must be removed in 5B.6a'
  );

  const slots = map.getAvailableExpansionSlots();
  const eastTop = slots.find((s) => s.x === 8 && s.y === 0);
  const eastBottom = slots.find((s) => s.x === 8 && s.y === 4);
  assert.ok(eastTop && eastBottom);

  assert.strictEqual(map.expandChunk(eastTop).success, true);
  assert.strictEqual(map.expandChunk(eastBottom).success, true);
  assert.strictEqual(map.getUnlockedChunkCount(), 6);
});

test('GridMap: clone creates an independent deep copy with matching state', () => {
  const map = new GridMap();
  map.placeBuilding('b1', { x: 2, y: 2 }, { width: 2, height: 2 });
  map.expandChunk({ x: 8, y: 0 });

  const cloned = map.clone();

  assert.strictEqual(cloned.getUnlockedChunkCount(), 5);
  assert.strictEqual(cloned.getPlacedBuildingCount(), 1);
  assert.strictEqual(cloned.getOccupiedCellCount(), 4);
  assert.strictEqual(cloned.getCellState(2, 2).status, 'OCCUPIED');
  assert.strictEqual(cloned.getCellState(2, 2).buildingInstanceId, 'b1');

  // Modifying the clone does not alter original
  cloned.removeBuilding('b1');
  assert.strictEqual(cloned.getPlacedBuildingCount(), 0);
  assert.strictEqual(map.getPlacedBuildingCount(), 1);
});

test('GridMap: snapshot serialization and fromSnapshot roundtrip preserves chunks and buildings without terrainFeatures', () => {
  const map = new GridMap();
  map.placeBuilding('hut-1', { x: 0, y: 0 }, { width: 1, height: 1 });
  map.placeBuilding('granary-1', { x: 4, y: 4 }, { width: 2, height: 2 });
  map.expandChunk({ x: 8, y: 4 });

  const snapshot = map.toSnapshot();
  assert.deepStrictEqual(Object.keys(snapshot).sort(), ['buildings', 'chunks']);

  const reconstituted = GridMap.fromSnapshot(snapshot);

  assert.strictEqual(reconstituted.getUnlockedChunkCount(), map.getUnlockedChunkCount());
  assert.strictEqual(reconstituted.getUnlockedCellCount(), map.getUnlockedCellCount());
  assert.strictEqual(reconstituted.getPlacedBuildingCount(), 2);
  assert.strictEqual(reconstituted.hasBuilding('hut-1'), true);
  assert.strictEqual(reconstituted.hasBuilding('granary-1'), true);
  assert.strictEqual(reconstituted.getCellState(0, 0).buildingInstanceId, 'hut-1');
  assert.strictEqual(reconstituted.getCellState(4, 4).buildingInstanceId, 'granary-1');
  assert.strictEqual(reconstituted.getCellState(5, 5).buildingInstanceId, 'granary-1');
  assert.strictEqual(reconstituted.isCellUnlocked(9, 5), true);
});

test('GridMap.fromSnapshot: rejects legacy 10x10 chunk dimensions and unaligned origins', () => {
  // Legacy 10x10 chunk dimensions rejected
  assert.throws(() => {
    GridMap.fromSnapshot({
      chunks: [{ id: 'chunk_0_0', origin: { x: 0, y: 0 }, dimensions: { width: 10, height: 10 } }],
      buildings: [],
    });
  }, /4x4/);

  // Unaligned 4x4 chunk origin rejected
  assert.throws(() => {
    GridMap.fromSnapshot({
      chunks: [{ id: 'chunk_2_0', origin: { x: 2, y: 0 }, dimensions: { width: 4, height: 4 } }],
      buildings: [],
    });
  }, /Unaligned chunk origin/);
});
