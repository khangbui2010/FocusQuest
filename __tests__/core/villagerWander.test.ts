import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GridMap,
  BuildingInstance,
  VILLAGE_CAVE_DEFINITION_ID,
  Villager,
  buildWanderWorld,
  coordKey,
  createInitialWanderStates,
  getSpawnCell,
  getWalkAnimation,
  getWanderAttractors,
  pauseWanderStates,
  revalidateWanderStates,
  stepWander,
  syncWanderStates,
} from '../../src/core/civilization/index.ts';

function createExpandedMap(): GridMap {
  const map = new GridMap();
  // Initial 8x8 map already contains (0,0), (4,0), (0,4), (4,4).
  // Expand west and north-east to form an irregular L-shape with negative coordinates.
  map.expandChunk({ x: -4, y: 0 });
  map.expandChunk({ x: -4, y: 4 });
  map.expandChunk({ x: 8, y: 0 });
  return map;
}

function makeSampleVillagers(count: number): Villager[] {
  const roles = ['elder', 'crafter', 'woodworker'] as const;
  return Array.from({ length: count }, (_, idx) => ({
    id: `vil-${idx + 1}`,
    role: roles[idx % roles.length],
    recruitedAt: 1000 + idx * 100,
  }));
}

test('getWalkAnimation (Villager V3): maps cardinal deltas and handles walk_up horizontal fallback', () => {
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 3, y: 2 }, 'left'), 'walk_right');
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 1, y: 2 }, 'right'), 'walk_left');
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 2, y: 3 }, 'right'), 'walk_down');
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 2, y: 1 }, 'right'), 'walk_right');
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 2, y: 1 }, 'left'), 'walk_left');
  assert.equal(getWalkAnimation({ x: 2, y: 2 }, { x: 2, y: 2 }, 'left'), 'idle');
});

test('Villager Wander Engine (V3): strictly deterministic over 250 ticks for identical inputs', () => {
  const map = createExpandedMap();
  const cave: BuildingInstance = {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 3,
    placedAt: 100,
  };
  const campfire: BuildingInstance = {
    id: 'fire-1',
    definitionId: 'stone_age_campfire',
    position: { x: 5, y: 2 },
    level: 1,
    placedAt: 200,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });
  map.placeBuilding(campfire.id, campfire.position, { width: 1, height: 1 });

  const buildings = [cave, campfire];
  const worldA = buildWanderWorld(map, buildings);
  const worldB = buildWanderWorld(map, buildings);
  const villagers = makeSampleVillagers(5);

  let statesA = createInitialWanderStates(villagers, worldA);
  let statesB = createInitialWanderStates(villagers, worldB);

  const traceA: string[] = [];
  const traceB: string[] = [];

  for (let tick = 0; tick < 250; tick++) {
    statesA = stepWander(statesA, worldA, tick);
    statesB = stepWander(statesB, worldB, tick);
    traceA.push(
      statesA.map((s) => `${s.villagerId}:${s.cell.x},${s.cell.y}:${s.animation}`).join('|')
    );
    traceB.push(
      statesB.map((s) => `${s.villagerId}:${s.cell.x},${s.cell.y}:${s.animation}`).join('|')
    );
  }

  assert.deepEqual(traceA, traceB);
});

test('Villager Wander Engine (V3): zero building collisions, zero locked cells, zero villager overlaps over 300 ticks', () => {
  const map = createExpandedMap();
  const cave: BuildingInstance = {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 4,
    placedAt: 100,
  };
  const hut: BuildingInstance = {
    id: 'hut-1',
    definitionId: 'stone_age_elder_hut',
    position: { x: 4, y: 1 },
    level: 1,
    placedAt: 200,
  };
  const campfire: BuildingInstance = {
    id: 'fire-1',
    definitionId: 'stone_age_campfire',
    position: { x: -2, y: 2 },
    level: 1,
    placedAt: 300,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });
  map.placeBuilding(hut.id, hut.position, { width: 2, height: 2 });
  map.placeBuilding(campfire.id, campfire.position, { width: 1, height: 1 });

  const world = buildWanderWorld(map, [cave, hut, campfire]);
  const villagers = makeSampleVillagers(8);
  let states = createInitialWanderStates(villagers, world);

  assert.equal(states.length, 8);

  let walkCount = 0;
  let idleCount = 0;
  const visitedNegativeCoordVillagers = new Set<string>();

  for (let tick = 0; tick < 300; tick++) {
    const prevById = new Map(states.map((s) => [s.villagerId, s.cell]));
    states = stepWander(states, world, tick);
    assert.equal(states.length, 8);

    const frameCoords = new Set<string>();
    for (const s of states) {
      const key = coordKey(s.cell);
      // 1. Unlocked grass only
      assert.equal(
        map.isCellUnlocked(s.cell.x, s.cell.y),
        true,
        `Tick ${tick}: villager ${s.villagerId} stepped into locked cell ${key}`
      );
      // 2. Zero building footprint overlaps
      assert.equal(
        world.buildingOccupiedSet.has(key),
        false,
        `Tick ${tick}: villager ${s.villagerId} stepped onto building footprint ${key}`
      );
      assert.equal(
        map.getOccupyingBuilding(s.cell.x, s.cell.y),
        undefined,
        `Tick ${tick}: GridMap reports building at villager cell ${key}`
      );
      // 3. No two villagers share the same cell
      assert.equal(
        frameCoords.has(key),
        false,
        `Tick ${tick}: duplicate villager occupancy at ${key}`
      );
      frameCoords.add(key);

      // 4. Single-step orthogonal motion max (no teleporting)
      const prev = prevById.get(s.villagerId)!;
      const dist = Math.abs(s.cell.x - prev.x) + Math.abs(s.cell.y - prev.y);
      assert.ok(dist <= 1, `Tick ${tick}: villager moved ${dist} cells in 1 tick`);

      if (s.cell.x < 0) visitedNegativeCoordVillagers.add(s.villagerId);
      if (s.animation === 'idle') idleCount++;
      else walkCount++;
    }
  }

  assert.ok(walkCount > 50, `Expected active walking across 300 ticks, got ${walkCount}`);
  assert.ok(idleCount > 50, `Expected natural idle pauses across 300 ticks, got ${idleCount}`);
  assert.ok(
    visitedNegativeCoordVillagers.size > 0,
    'Expected villagers to seamlessly enter negative coordinate unlocked territory'
  );
});

test('Villager Wander Engine (V3): weighted attractors bias trajectories significantly toward Campfire vs uniform baseline', () => {
  const map = new GridMap();

  const cave: BuildingInstance = {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 2,
    placedAt: 100,
  };
  const campfire: BuildingInstance = {
    id: 'fire-1',
    definitionId: 'stone_age_campfire',
    position: { x: 6, y: 6 },
    level: 1,
    placedAt: 200,
  };
  const totem: BuildingInstance = {
    id: 'totem-1',
    definitionId: 'stone_age_totem',
    position: { x: 1, y: 6 },
    level: 1,
    placedAt: 300,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });
  map.placeBuilding(campfire.id, campfire.position, { width: 1, height: 1 });
  map.placeBuilding(totem.id, totem.position, { width: 1, height: 1 });

  const buildings = [cave, campfire, totem];
  const attractors = getWanderAttractors(buildings, map);
  const maxCampfireWeight = Math.max(
    ...attractors.filter((a) => a.definitionId === 'stone_age_campfire').map((a) => a.weight)
  );
  const maxTotemWeight = Math.max(
    ...attractors.filter((a) => a.definitionId === 'stone_age_totem').map((a) => a.weight)
  );
  assert.ok(maxCampfireWeight > maxTotemWeight);

  const world = buildWanderWorld(map, buildings);
  const villagers = makeSampleVillagers(4);
  let states = createInitialWanderStates(villagers, world);

  const distancesToFire: number[] = [];
  for (let tick = 0; tick < 500; tick++) {
    states = stepWander(states, world, tick);
    if (tick >= 40) {
      for (const s of states) {
        distancesToFire.push(
          Math.abs(s.cell.x - campfire.position.x) + Math.abs(s.cell.y - campfire.position.y)
        );
      }
    }
  }

  const uniformMean =
    world.walkableCells.reduce(
      (sum, c) =>
        sum + Math.abs(c.x - campfire.position.x) + Math.abs(c.y - campfire.position.y),
      0
    ) / world.walkableCells.length;

  const wanderMean =
    distancesToFire.reduce((sum, d) => sum + d, 0) / distancesToFire.length;

  assert.ok(
    wanderMean < uniformMean * 0.85,
    `Expected Campfire attractor bias (${wanderMean.toFixed(2)}) < 85% of uniform (${uniformMean.toFixed(2)})`
  );
});

test('Villager Wander Engine (V3): Cave-only fallback attractors, zero-attractor safety & pauseWanderStates', () => {
  const map = new GridMap();
  const cave: BuildingInstance = {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 1,
    placedAt: 100,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });

  const world = buildWanderWorld(map, [cave]);
  assert.ok(world.attractors.length > 0, 'Expected Cave entrance fallback attractors');
  assert.ok(world.attractors.every((a) => a.definitionId === VILLAGE_CAVE_DEFINITION_ID));

  // No buildings at all still walks cleanly over unlocked grass
  const emptyWorld = buildWanderWorld(new GridMap(), []);
  assert.equal(emptyWorld.attractors.length, 0);
  const steppedEmpty = stepWander(createInitialWanderStates([], emptyWorld), emptyWorld, 0);
  assert.deepEqual(steppedEmpty, []);

  // pauseWanderStates freezes walking animations cleanly
  const movingSample = [
    {
      villagerId: 'v1',
      role: 'elder' as const,
      recruitedAt: 100,
      cell: { x: 1, y: 3 },
      facing: 'right' as const,
      animation: 'walk_right' as const,
      waitTicks: 0,
      path: [{ x: 2, y: 3 }],
    },
  ];
  const paused = pauseWanderStates(movingSample);
  assert.equal(paused[0].animation, 'idle');
  assert.deepEqual(paused[0].cell, { x: 1, y: 3 });
});

test('Villager Wander Engine (V3): getSpawnCell & syncWanderStates spawn new villagers at Cave entrance & revalidate placed buildings', () => {
  const map = new GridMap();
  const cave: BuildingInstance = {
    id: 'cave-1',
    definitionId: VILLAGE_CAVE_DEFINITION_ID,
    position: { x: 0, y: 0 },
    level: 2,
    placedAt: 100,
  };
  map.placeBuilding(cave.id, cave.position, { width: 3, height: 3 });

  const world1 = buildWanderWorld(map, [cave]);
  const spawn = getSpawnCell(cave, world1);
  // Direct entrance in front of (0+1, 0+2) is (1, 3)
  assert.deepEqual(spawn, { x: 1, y: 3 });

  // Skip occupied entrance
  const secondSpawn = getSpawnCell(cave, world1, new Set(['1,3']));
  assert.notDeepEqual(secondSpawn, { x: 1, y: 3 });
  assert.ok(secondSpawn && world1.walkableSet.has(coordKey(secondSpawn)));

  // Simulate two existing villagers that wandered elsewhere
  const v1: Villager = { id: 'vil-1', role: 'elder', recruitedAt: 100 };
  const v2: Villager = { id: 'vil-2', role: 'crafter', recruitedAt: 200 };
  const existingMoved = [
    {
      villagerId: 'vil-1',
      role: 'elder' as const,
      recruitedAt: 100,
      cell: { x: 5, y: 2 },
      facing: 'right' as const,
      animation: 'walk_right' as const,
      waitTicks: 0,
      path: [],
    },
    {
      villagerId: 'vil-2',
      role: 'crafter' as const,
      recruitedAt: 200,
      cell: { x: 6, y: 1 },
      facing: 'left' as const,
      animation: 'idle' as const,
      waitTicks: 2,
      path: [],
    },
  ];

  // Now recruit v3 while existing villagers are away on the map AND place a campfire directly on vil-1's cell (5,2)!
  const campfireOnV1: BuildingInstance = {
    id: 'fire-overlap',
    definitionId: 'stone_age_campfire',
    position: { x: 5, y: 2 },
    level: 1,
    placedAt: 250,
  };
  map.placeBuilding(campfireOnV1.id, campfireOnV1.position, { width: 1, height: 1 });
  const world2 = buildWanderWorld(map, [cave, campfireOnV1]);

  const v3: Villager = { id: 'vil-3', role: 'woodworker', recruitedAt: 300 };
  const synced = syncWanderStates(existingMoved, [v1, v2, v3], world2, false);
  assert.equal(synced.length, 3);

  const s1 = synced.find((s) => s.villagerId === 'vil-1')!;
  const s2 = synced.find((s) => s.villagerId === 'vil-2')!;
  const s3 = synced.find((s) => s.villagerId === 'vil-3')!;

  // vil-1 relocated off (5,2) onto valid free walkable cell
  assert.notDeepEqual(s1.cell, { x: 5, y: 2 });
  assert.equal(world2.walkableSet.has(coordKey(s1.cell)), true);

  // vil-2 preserved at (6,1) without teleporting
  assert.deepEqual(s2.cell, { x: 6, y: 1 });

  // Newly recruited vil-3 spawns right at Cave entrance (1,3) with waitTicks = 0
  assert.deepEqual(s3.cell, { x: 1, y: 3 });
  assert.equal(s3.waitTicks, 0);

  // Stepping forward makes vil-3 leave the entrance cleanly
  const afterOneTick = stepWander(synced, world2, 0);
  const s3After = afterOneTick.find((s) => s.villagerId === 'vil-3')!;
  assert.notDeepEqual(s3After.cell, { x: 1, y: 3 });

  // Direct revalidateWanderStates on completely full 8x8 map drops safely without crashing
  const tightMap = new GridMap();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      tightMap.placeBuilding(`b-${x}-${y}`, { x, y }, { width: 1, height: 1 });
    }
  }
  const tightWorld = buildWanderWorld(tightMap, []);
  assert.equal(tightWorld.walkableCells.length, 0);
  assert.deepEqual(revalidateWanderStates(synced, tightWorld), []);
});

test('Villager Wander Engine (V3): pure static checks — zero Date.now(), zero Math.random(), zero storage writes, Schema v4 unchanged', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { CURRENT_SCHEMA_VERSION } = await import('../../src/storage/migrations/migrationRunner.ts');

  assert.equal(CURRENT_SCHEMA_VERSION, 5);

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const engineSrc = stripComments(
    fs.readFileSync(path.resolve(process.cwd(), 'src/core/civilization/villagerWander.ts'), 'utf8')
  );
  const hookSrc = stripComments(
    fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/components/civilization/useVillagerWander.ts'),
      'utf8'
    )
  );

  assert.equal(/Date\.now\s*\(/.test(engineSrc), false);
  assert.equal(/Math\.random\s*\(/.test(engineSrc), false);
  assert.equal(/chrome\.storage|localStorage/.test(engineSrc), false);
  assert.equal(/chrome\.storage|localStorage|Date\.now\s*\(|Math\.random\s*\(/.test(hookSrc), false);
});

