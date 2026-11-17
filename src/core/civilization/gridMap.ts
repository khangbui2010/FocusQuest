/**
 * GridMap domain model for Focus Quest Civilization Map Engine.
 * Milestone 5B.1 & 5B.5 Stage 4a-2 (ĐC-12):
 * - Initial 8x8 map (64 cells) structured as four 4x4 chunks.
 * - Multi-directional 4x4 chunk expansion including negative coordinates.
 * - Atomic transactional placement and removal operations.
 * - Visual terrain/forest landscape is computed strictly in the UI layer.
 */

import {
  INITIAL_GRID_WIDTH,
  INITIAL_GRID_HEIGHT,
  CHUNK_WIDTH,
  CHUNK_HEIGHT,
  INITIAL_ORIGIN_X,
  INITIAL_ORIGIN_Y,
} from './constants.ts';
import {
  GridCoordinate,
  GridChunk,
  BuildingFootprint,
  CellState,
  PlacementValidationResult,
  PlacementOperationResult,
  RemovalOperationResult,
  PlacedBuildingRecord,
  MapBoundingBox,
  ChunkExpansionResult,
  ChunkExpansionFailureReason,
  GridMapSnapshot,
} from './types.ts';
import {
  isValidCoordinate,
  isValidFootprint,
  isValidBuildingId,
  getFootprintCoordinates,
  validatePlacement,
  PlacementValidationContext,
} from './placementValidator.ts';

/** Encode grid coordinate to a fast lookup hash key: "x,y" */
export function encodeCoordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Decode hash key back into GridCoordinate */
export function decodeCoordinateKey(key: string): GridCoordinate {
  const commaIndex = key.indexOf(',');
  const x = Number(key.slice(0, commaIndex));
  const y = Number(key.slice(commaIndex + 1));
  return { x, y };
}

/** Generate unique canonical chunk ID from origin */
export function encodeChunkId(originX: number, originY: number): string {
  return `chunk_${originX}_${originY}`;
}

export class GridMap {
  /** All unlocked chunks indexed by chunk ID */
  private readonly unlockedChunks = new Map<string, GridChunk>();

  /** All unlocked cells for O(1) membership check: Set of "x,y" */
  private readonly unlockedCellKeys = new Set<string>();

  /** Mapping from cell key ("x,y") to the buildingInstanceId occupying it */
  private readonly occupiedCellMap = new Map<string, string>();

  /** Mapping from buildingInstanceId to PlacedBuildingRecord */
  private readonly buildingPlacements = new Map<string, PlacedBuildingRecord>();

  /** Cached bounding box of all unlocked territory */
  private cachedBoundingBox: MapBoundingBox = {
    minX: 0,
    maxX: INITIAL_GRID_WIDTH - 1,
    minY: 0,
    maxY: INITIAL_GRID_HEIGHT - 1,
    width: INITIAL_GRID_WIDTH,
    height: INITIAL_GRID_HEIGHT,
  };

  constructor() {
    this.initializeInitialMap();
  }

  /**
   * Initializes the starting 8x8 grid (64 cells total).
   * Structured internally as four adjacent 4x4 chunks:
   * - (0, 0), (4, 0), (0, 4), (4, 4)
   */
  private initializeInitialMap(): void {
    const chunkCols = INITIAL_GRID_WIDTH / CHUNK_WIDTH; // 2
    const chunkRows = INITIAL_GRID_HEIGHT / CHUNK_HEIGHT; // 2

    for (let row = 0; row < chunkRows; row++) {
      for (let col = 0; col < chunkCols; col++) {
        const originX = INITIAL_ORIGIN_X + col * CHUNK_WIDTH;
        const originY = INITIAL_ORIGIN_Y + row * CHUNK_HEIGHT;
        this.unlockChunkCells(originX, originY);
      }
    }

    this.recalculateBoundingBox();
  }

  /**
   * Internal helper: unlocks a 4x4 chunk and its 16 constituent cells.
   */
  private unlockChunkCells(originX: number, originY: number): GridChunk {
    const chunkId = encodeChunkId(originX, originY);
    const chunk: GridChunk = {
      id: chunkId,
      origin: { x: originX, y: originY },
      dimensions: { width: CHUNK_WIDTH, height: CHUNK_HEIGHT },
    };

    this.unlockedChunks.set(chunkId, chunk);

    for (let dy = 0; dy < CHUNK_HEIGHT; dy++) {
      for (let dx = 0; dx < CHUNK_WIDTH; dx++) {
        this.unlockedCellKeys.add(encodeCoordinateKey(originX + dx, originY + dy));
      }
    }

    return chunk;
  }

  /**
   * Recalculate the bounding box from current unlocked chunks.
   */
  private recalculateBoundingBox(): void {
    if (this.unlockedChunks.size === 0) {
      this.cachedBoundingBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const chunk of this.unlockedChunks.values()) {
      if (chunk.origin.x < minX) minX = chunk.origin.x;
      const chunkMaxX = chunk.origin.x + chunk.dimensions.width - 1;
      if (chunkMaxX > maxX) maxX = chunkMaxX;

      if (chunk.origin.y < minY) minY = chunk.origin.y;
      const chunkMaxY = chunk.origin.y + chunk.dimensions.height - 1;
      if (chunkMaxY > maxY) maxY = chunkMaxY;
    }

    this.cachedBoundingBox = {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Check if a cell coordinate is within unlocked map territory */
  isCellUnlocked(x: number, y: number): boolean {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    return this.unlockedCellKeys.has(encodeCoordinateKey(x, y));
  }

  /** Check if a coordinate falls inside the outer bounding envelope of the map */
  isWithinMapEnvelope(x: number, y: number): boolean {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    const box = this.cachedBoundingBox;
    return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
  }

  /** Get the building instance ID occupying the specified cell, or undefined if none */
  getOccupyingBuilding(x: number, y: number): string | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return this.occupiedCellMap.get(encodeCoordinateKey(x, y));
  }

  /** Retrieve full status and occupancy information for any cell */
  getCellState(x: number, y: number): CellState {
    const coordinate: GridCoordinate = { x, y };

    if (!this.isCellUnlocked(x, y)) {
      return { coordinate, status: 'BLOCKED' };
    }

    const buildingInstanceId = this.getOccupyingBuilding(x, y);
    if (buildingInstanceId !== undefined) {
      return { coordinate, status: 'OCCUPIED', buildingInstanceId };
    }

    return { coordinate, status: 'EMPTY' };
  }

  /** Check if a building instance is currently placed on the map */
  hasBuilding(buildingInstanceId: string): boolean {
    if (!isValidBuildingId(buildingInstanceId)) return false;
    return this.buildingPlacements.has(buildingInstanceId);
  }

  /** Retrieve the placed record for a specific building */
  getPlacedBuilding(buildingInstanceId: string): PlacedBuildingRecord | undefined {
    return this.buildingPlacements.get(buildingInstanceId);
  }

  /** Get all active building placements */
  getAllPlacedBuildings(): readonly PlacedBuildingRecord[] {
    return Array.from(this.buildingPlacements.values());
  }

  /** Total count of placed buildings */
  getPlacedBuildingCount(): number {
    return this.buildingPlacements.size;
  }

  /** Total count of unlocked chunks */
  getUnlockedChunkCount(): number {
    return this.unlockedChunks.size;
  }

  /** Get all unlocked chunks as an array */
  getUnlockedChunks(): readonly GridChunk[] {
    return Array.from(this.unlockedChunks.values());
  }

  /** Check if a specific chunk origin is already unlocked */
  hasChunkAt(originX: number, originY: number): boolean {
    return this.unlockedChunks.has(encodeChunkId(originX, originY));
  }

  /** Total count of unlocked cells */
  getUnlockedCellCount(): number {
    return this.unlockedCellKeys.size;
  }

  /** Total count of cells occupied by placed buildings */
  getOccupiedCellCount(): number {
    return this.occupiedCellMap.size;
  }

  /** Total count of empty (unlocked & unoccupied) cells */
  getEmptyCellCount(): number {
    return this.unlockedCellKeys.size - this.occupiedCellMap.size;
  }

  /** Get current bounding dimensions of the unlocked map */
  getBoundingBox(): MapBoundingBox {
    return { ...this.cachedBoundingBox };
  }

  /**
   * Internal validator context implementation.
   */
  private getValidationContext(): PlacementValidationContext {
    return {
      isCellUnlocked: (x, y) => this.isCellUnlocked(x, y),
      getOccupyingBuilding: (x, y) => this.getOccupyingBuilding(x, y),
      hasBuilding: (id) => this.hasBuilding(id),
      isWithinMapEnvelope: (x, y) => this.isWithinMapEnvelope(x, y),
    };
  }

  // ---------------------------------------------------------------------------
  // Placement & Collision
  // ---------------------------------------------------------------------------

  /**
   * Query whether a proposed building footprint can be placed at the specified position.
   * Pure inspection: does NOT mutate state.
   */
  canPlaceBuilding(
    position: GridCoordinate,
    footprint: BuildingFootprint,
    buildingInstanceId?: string
  ): PlacementValidationResult {
    return validatePlacement(position, footprint, this.getValidationContext(), buildingInstanceId);
  }

  /**
   * Commits placement of a building instance onto the map.
   * Atomic operation:
   * - Validates footprint, boundaries, terrain collisions, and building collisions first.
   * - If validation fails, zero state changes occur.
   * - If validation succeeds, registers occupancy for every footprint cell.
   */
  placeBuilding(
    buildingInstanceId: string,
    position: GridCoordinate,
    footprint: BuildingFootprint
  ): PlacementOperationResult {
    // 1. Validate ID
    if (!isValidBuildingId(buildingInstanceId)) {
      return {
        success: false,
        reason: 'INVALID_BUILDING_ID',
      };
    }

    // 2. Validate placement against current map
    const validation = this.canPlaceBuilding(position, footprint, buildingInstanceId);
    if (!validation.isValid) {
      return {
        success: false,
        reason: validation.reason,
        conflictingCoordinate: validation.conflictingCoordinate,
        conflictingBuildingId: validation.conflictingBuildingId,
      };
    }

    // 3. Atomically register occupancy
    const footprintCells = getFootprintCoordinates(position, footprint);
    const cellKeys: string[] = [];

    for (const cell of footprintCells) {
      const key = encodeCoordinateKey(cell.x, cell.y);
      cellKeys.push(key);
      this.occupiedCellMap.set(key, buildingInstanceId);
    }

    const record: PlacedBuildingRecord = {
      buildingInstanceId,
      anchor: { x: position.x, y: position.y },
      footprint: { width: footprint.width, height: footprint.height },
      occupiedCellKeys: cellKeys,
    };

    this.buildingPlacements.set(buildingInstanceId, record);

    return {
      success: true,
      placedBuildingId: buildingInstanceId,
    };
  }

  /**
   * Removes an existing building instance from the map.
   * Atomically frees every cell belonging to its footprint.
   * Does NOT alter unlocked state or affect other buildings.
   */
  removeBuilding(buildingInstanceId: string): RemovalOperationResult {
    if (!isValidBuildingId(buildingInstanceId)) {
      return {
        success: false,
        freedCellCount: 0,
        reason: 'INVALID_BUILDING_ID',
      };
    }

    const record = this.buildingPlacements.get(buildingInstanceId);
    if (!record) {
      return {
        success: false,
        freedCellCount: 0,
        reason: 'BUILDING_NOT_FOUND',
      };
    }

    // Free all occupied cells belonging strictly to this building
    for (const key of record.occupiedCellKeys) {
      this.occupiedCellMap.delete(key);
    }

    this.buildingPlacements.delete(buildingInstanceId);

    return {
      success: true,
      freedCellCount: record.occupiedCellKeys.length,
      removedBuildingId: buildingInstanceId,
    };
  }

  // ---------------------------------------------------------------------------
  // Chunk Expansion Geometry
  // ---------------------------------------------------------------------------

  /**
   * Validates whether a new 4x4 chunk can be unlocked at the proposed origin coordinate.
   * Rules:
   * - Origin x and y must be integer multiples of CHUNK_WIDTH (4) and CHUNK_HEIGHT (4).
   * - Chunk must not already be unlocked (no duplicate / overlap).
   * - Chunk must be orthogonally adjacent (sharing a 4-cell edge) with at least one existing unlocked chunk.
   */
  canExpandChunk(origin: GridCoordinate): {
    canExpand: boolean;
    reason?: ChunkExpansionFailureReason;
  } {
    if (!isValidCoordinate(origin)) {
      return { canExpand: false, reason: 'INVALID_ORIGIN' };
    }

    // Must align to 4x4 chunk grid (safe for negative multiples in JS: -4 % 4 === -0, -0 !== 0 is false)
    if (origin.x % CHUNK_WIDTH !== 0 || origin.y % CHUNK_HEIGHT !== 0) {
      return { canExpand: false, reason: 'INVALID_ORIGIN' };
    }

    // Check if chunk already exists
    if (this.hasChunkAt(origin.x, origin.y)) {
      return { canExpand: false, reason: 'CHUNK_ALREADY_EXISTS' };
    }

    // Must be orthogonally adjacent to at least one existing chunk
    const hasNorthNeighbor = this.hasChunkAt(origin.x, origin.y - CHUNK_HEIGHT);
    const hasSouthNeighbor = this.hasChunkAt(origin.x, origin.y + CHUNK_HEIGHT);
    const hasEastNeighbor = this.hasChunkAt(origin.x + CHUNK_WIDTH, origin.y);
    const hasWestNeighbor = this.hasChunkAt(origin.x - CHUNK_WIDTH, origin.y);

    if (!hasNorthNeighbor && !hasSouthNeighbor && !hasEastNeighbor && !hasWestNeighbor) {
      return { canExpand: false, reason: 'CHUNK_NOT_ADJACENT' };
    }

    return { canExpand: true };
  }

  /**
   * Expands the map by unlocking a new 4x4 chunk at the specified origin.
   * Atomic operation:
   * - Validates geometry and adjacency first.
   * - Unlocks exactly 16 new cells without affecting existing buildings.
   * - Recalculates bounding box.
   */
  expandChunk(origin: GridCoordinate): ChunkExpansionResult {
    const check = this.canExpandChunk(origin);
    if (!check.canExpand) {
      return {
        success: false,
        reason: check.reason,
      };
    }

    const chunk = this.unlockChunkCells(origin.x, origin.y);
    this.recalculateBoundingBox();

    return {
      success: true,
      chunk,
    };
  }

  /**
   * Convenience helper: returns all valid chunk origins adjacent to current unlocked territory
   * that can be expanded immediately.
   */
  getAvailableExpansionSlots(): GridCoordinate[] {
    const candidateKeys = new Set<string>();
    const slots: GridCoordinate[] = [];

    for (const chunk of this.unlockedChunks.values()) {
      const neighbors: GridCoordinate[] = [
        { x: chunk.origin.x, y: chunk.origin.y - CHUNK_HEIGHT }, // North
        { x: chunk.origin.x, y: chunk.origin.y + CHUNK_HEIGHT }, // South
        { x: chunk.origin.x + CHUNK_WIDTH, y: chunk.origin.y },  // East
        { x: chunk.origin.x - CHUNK_WIDTH, y: chunk.origin.y },  // West
      ];

      for (const n of neighbors) {
        const id = encodeChunkId(n.x, n.y);
        if (!this.unlockedChunks.has(id) && !candidateKeys.has(id)) {
          candidateKeys.add(id);
          slots.push(n);
        }
      }
    }

    // Deterministic sort: ascending row (y), then ascending column (x)
    return slots.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  }

  // ---------------------------------------------------------------------------
  // Immutability & Serialization
  // ---------------------------------------------------------------------------

  /**
   * Creates an independent deep clone of this GridMap instance.
   * Modifications to the clone do not affect this instance.
   */
  clone(): GridMap {
    const snapshot = this.toSnapshot();
    return GridMap.fromSnapshot(snapshot);
  }

  /**
   * Serialize current GridMap into a plain JSON-compatible snapshot.
   */
  toSnapshot(): GridMapSnapshot {
    const chunks: GridChunk[] = Array.from(this.unlockedChunks.values()).map((c) => ({
      id: c.id,
      origin: { x: c.origin.x, y: c.origin.y },
      dimensions: { width: c.dimensions.width, height: c.dimensions.height },
    }));

    const buildings = Array.from(this.buildingPlacements.values()).map((b) => ({
      buildingInstanceId: b.buildingInstanceId,
      anchor: { x: b.anchor.x, y: b.anchor.y },
      footprint: { width: b.footprint.width, height: b.footprint.height },
    }));

    return {
      chunks,
      buildings,
    };
  }

  /**
   * Reconstitutes a GridMap instance from a snapshot.
   * Validates chunk dimensions (4x4 alignment) and re-places buildings cleanly.
   */
  static fromSnapshot(snapshot: GridMapSnapshot): GridMap {
    if (
      typeof snapshot !== 'object' ||
      snapshot === null ||
      !Array.isArray(snapshot.chunks) ||
      !Array.isArray(snapshot.buildings)
    ) {
      throw new Error('Invalid GridMapSnapshot: expected chunks and buildings arrays');
    }

    if (snapshot.chunks.length === 0) {
      throw new Error('Invalid GridMapSnapshot: chunks must be non-empty');
    }

    const map = new GridMap();

    // Clear initial state
    map.unlockedChunks.clear();
    map.unlockedCellKeys.clear();
    map.occupiedCellMap.clear();
    map.buildingPlacements.clear();

    // 1. Replay and validate chunks (4x4 alignment & dimensions)
    const seenChunkIds = new Set<string>();
    for (const chunk of snapshot.chunks) {
      if (
        !chunk ||
        !isValidCoordinate(chunk.origin) ||
        !chunk.dimensions ||
        chunk.dimensions.width !== CHUNK_WIDTH ||
        chunk.dimensions.height !== CHUNK_HEIGHT
      ) {
        throw new Error(
          `Invalid chunk dimensions or origin in snapshot: expected ${CHUNK_WIDTH}x${CHUNK_HEIGHT}`
        );
      }
      if (chunk.origin.x % CHUNK_WIDTH !== 0 || chunk.origin.y % CHUNK_HEIGHT !== 0) {
        throw new Error(
          `Unaligned chunk origin (${chunk.origin.x}, ${chunk.origin.y}) for ${CHUNK_WIDTH}x${CHUNK_HEIGHT} grid`
        );
      }
      const canonicalId = encodeChunkId(chunk.origin.x, chunk.origin.y);
      if (seenChunkIds.has(canonicalId)) {
        throw new Error(`Duplicate chunk in snapshot at ${canonicalId}`);
      }
      seenChunkIds.add(canonicalId);
      map.unlockChunkCells(chunk.origin.x, chunk.origin.y);
    }
    map.recalculateBoundingBox();

    // 2. Replay and validate buildings
    for (const b of snapshot.buildings) {
      const placeResult = map.placeBuilding(b.buildingInstanceId, b.anchor, b.footprint);
      if (!placeResult.success) {
        throw new Error(
          `Invalid building "${String(b?.buildingInstanceId)}" in snapshot: ${placeResult.reason || 'placement rejected'}`
        );
      }
    }

    return map;
  }
}
