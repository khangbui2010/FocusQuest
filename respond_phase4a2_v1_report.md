# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 4a-2 (ĐC-12): ĐẤT ĐẦU GAME 8×8, CHUNK 4×4 & CÂY CỐI ĐỊA HÌNH

**Ngày hoàn thành:** 15/11/2026 (UTC) / 14/11/2026 (-08:00)  
**Phạm vi thực hiện:** Chỉ **Giai đoạn 4a-2 (ĐC-12)** theo `respond_plan_5B.5.md` (`4a → 4a-2 → 4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`).

---

## 1. Tóm tắt
- **Sao lưu báo cáo trước đó:**
  - `respond_phase4a_report.md` (báo cáo Giai đoạn 4a) **đã tồn tại nguyên vẹn** trong repo nên được giữ nguyên không ghi đè.
  - Nội dung `respond.md` trước lượt này (báo cáo đồng bộ `PROJECT_STATUS.md`) đã được sao lưu sang **`respond_status_sync_report.md`** trước khi ghi đè `respond.md` bằng báo cáo Giai đoạn 4a-2 này.
- **Thu nhỏ lưới & đổi kích thước chunk (`src/core/civilization/`):**
  - Chuyển bản đồ đầu game từ `20×20` (4 chunk `10×10` = `400` ô) sang **`8×8`** (`2×2` chunk **`4×4`** = **`64` ô**), mỗi lần mở rộng mở đúng 1 chunk `4×4` (`+16` ô), giữ nguyên miễn phí (0 Coins, không chặn Level — dành cho Milestone 5B.6).
- **Bộ sinh cây xác định & mô hình địa hình (`terrainGenerator.ts`, `GridMap`, `civilizationState.ts`):**
  - Tạo `terrainGenerator.ts` thuần xác định dùng PRNG mulberry32 (`hashChunkSeed` với `TERRAIN_WORLD_SEED = 4240`), tuyệt đối không dùng `Math.random()`, an toàn cho tọa độ âm.
  - Mỗi chunk `4×4` sinh **`1–2` cây nhỏ (`1×1`)** và **`0–1` cây lớn (`1×2`)**, tổng `<= 4` ô cây/chunk (`<= 25%`) và luôn còn ít nhất **1 khối `2×2` trống**. Trên 4 chunk đầu game (`8×8`), tổng số ô cây thực tế là **`9 / 64` ô (~14.1%, `<= 12`)**, đặt vừa đồng thời cả 6 công trình Stone Age.
  - Cây sinh một lần khi tạo/mở chunk và **lưu trực tiếp trong `GridMapSnapshot.terrainFeatures`** (không tái sinh khi `fromSnapshot`); cây chặn đặt công trình với trạng thái `'TERRAIN'` và lý do `'CELL_TERRAIN'`, không tạo Coins/XP/CoinBonus (`Zero Passive Income`), không tính vào số công trình, không bị xóa bởi `removeBuilding`, và chưa có thao tác chặt/gỡ cây.
  - **Giữ nguyên `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2`** (tránh đụng schema v3 dành cho Quest ở Giai đoạn 2a): mọi trạng thái cũ `10×10` hoặc thiếu `terrainFeatures` bị `GridMap.fromSnapshot` / `validateCivilizationState` / `sanitizeCivilizationState` từ chối sạch sẽ để storage tự re-seed bản đồ `8×8` mới.
- **Hiển thị UI `CELL_SIZE = 32`, cây cối & i18n:**
  - Nâng `CELL_SIZE = 32` trong `MapGridView.tsx` (tỷ lệ nguyên chính xác **`2×`** cho pixel art `16×16`; toàn bộ lưới `8×8` = `256×256px` nằm gọn ở `zoom 1.0` trong popup `400×600`).
  - Render cây nhỏ `TREE_SMALL` bằng 4 tile CC0 Kenney Tiny Town (`#15, #16, #27, #28`) và cây lớn `TREE_LARGE` (`1×2`) bằng 2 sprite `16×32` tự vẽ theo bảng màu Tiny Town + viền `#3f2631` (`terrain_tree_large_pine`, `terrain_tree_large_oak`), kèm thông báo hover đỏ `'✕ Tree blocks placement'` / `'✕ Cây cối chắn chỗ đặt'` cho `'CELL_TERRAIN'`.
  - Cập nhật `LandExpansionModal.tsx` (`4×4`, `+16 cells`), `SpriteGallery.tsx` (thêm mục *Section 3: Natural Terrain Trees* ở `1×/2×/4×`), `CREDITS.md` và EN/VI i18n.

---

## 2. Danh sách File Tạo / Sửa / Xóa

### File tạo mới (3 files)
1. `respond_status_sync_report.md` — Bản sao lưu `respond.md` trước lượt này (báo cáo đồng bộ `PROJECT_STATUS.md`), đồng thời giữ nguyên `respond_phase4a_report.md`.
2. `src/core/civilization/terrainGenerator.ts` — Bộ sinh cây xác định cho chunk `4×4` (`generateChunkTerrain`, `hashChunkSeed`, `hasEmpty2x2Block`, `getTerrainFootprint`).
3. `__tests__/core/terrainGenerator.test.ts` — 3 test mới kiểm tra tính xác định (zero `Math.random`), bất biến trên >250 chunk dương/âm, và bất biến `<= 12` ô cây đầu game + đặt đủ 6 công trình Stone Age đồng thời.

### File chỉnh sửa (29 files)
- **Core Civilization Engine (`src/core/civilization/` — 7 files):**
  1. `constants.ts` — `INITIAL_GRID_WIDTH/HEIGHT = 8`, `CHUNK_WIDTH/HEIGHT = 4`, `INITIAL_TOTAL_CELLS = 64`, `TERRAIN_WORLD_SEED = 4240`.
  2. `types.ts` — Thêm `TerrainFeatureKind`, `TerrainFeature`, `CellStatus = 'TERRAIN'`, `PlacementFailureReason = 'CELL_TERRAIN'`, `terrainFeatureId`/`conflictingTerrainId`, `terrainFeatures` trong `GridMapSnapshot`.
  3. `placementValidator.ts` — Thêm `getTerrainFeatureAt` vào `PlacementValidationContext` và trả `'CELL_TERRAIN'` + `conflictingTerrainId` + `conflictingCoordinate`.
  4. `gridMap.ts` — Khởi tạo `8×8` + chunk `4×4` kèm cây xác định; quản lý `terrainCellMap`/`terrainFeatures`; `expandChunk` sinh cây cho chunk mới; `removeBuilding` giữ nguyên cây; `fromSnapshot` kiểm tra toàn vẹn cây (nằm trong ô mở, không chồng cây/công trình, ID không trùng, footprint khớp `1×1`/`1×2`, từ chối chunk khác `4×4`).
  5. `civilizationState.ts` — Cập nhật comment `8×8`/`64` ô, giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2`, deep consistency validation cho `terrainFeatures` và từ chối state `10×10`/thiếu cây trong `validateCivilizationState` & `sanitizeCivilizationState`.
  6. `index.ts` — Export thêm `terrainGenerator.ts` và các type cây mới.
  7. *(Kiểm tra `buildingTypes.ts`, `buildingCatalog.ts`, `civilizationBonusHelper.ts`: không đổi — giữ nguyên 6 công trình Stone Age và Zero Passive Income).*
- **Background & Storage Comments (2 files):**
  8. `src/background/civilizationCoordinator.ts` — Cập nhật comment sang chunk `4×4` (giữ nguyên mở rộng miễn phí & rollback atomicity).
  9. `src/storage/migrations/v2_civilizationSchema.ts` — Cập nhật comment sang lưới `8×8` (`64` ô), giữ `CURRENT_SCHEMA_VERSION = 2`.
- **UI, Sprites, i18n & Credits (7 files):**
  10. `src/ui/components/civilization/spriteData.ts` — Thêm `TREE_ROUND_ORANGE: 15`, `TREE_ROUND_GREEN: 16`, `TREE_PINE_ORANGE: 27`, `TREE_PINE_GREEN: 28`, ma trận `TERRAIN_SPRITE_DATA` (`16×32` `terrain_tree_large_pine`, `terrain_tree_large_oak`), cập nhật `validateAllSpriteData()`.
  11. `src/ui/components/civilization/spriteRegistry.ts` — Export `TerrainFeatureVisual`, `TREE_SMALL_TILE_VARIANTS`, `TREE_LARGE_SPRITE_VARIANTS`, `getTerrainFeatureSprite(feature)`.
  12. `src/ui/components/civilization/MapGridView.tsx` — `CELL_SIZE = 32`, render lớp `(civilizationState.grid.terrainFeatures ?? [])` (`data-terrain-id`, `data-terrain-kind`, `data-terrain-variant`), tách & export `getPlacementPreviewLabel`, gắn i18n hover/controls.
  13. `src/ui/components/civilization/LandExpansionModal.tsx` — Dùng `CHUNK_WIDTH × CHUNK_HEIGHT` (`4×4`, `+16 cells`) qua i18n.
  14. `src/ui/components/civilization/SpriteGallery.tsx` — Thêm *Section 3: Natural Terrain Trees* (`4` tile cây nhỏ + `2` sprite cây lớn `1×2` ở `1×/2×/4×`).
  15. `src/i18n/locales/en.ts` & `src/i18n/locales/vi.ts` (2 files) — Bổ sung các khóa `civ.map.*` (`placeValid`, `placeOccupied`, `placeTerrain`, `placeOutside`, tooltip cây...) và `civ.expand.*`.
  16. `public/assets/sprites/CREDITS.md` — Ghi nhận 4 tile cây nhỏ CC0 `#15, #16, #27, #28` và 2 sprite cây lớn `16×32`.
- **Tests (10 files sửa + 1 file mới ở trên):**
  17–26. `__tests__/core/{gridMap,civilizationState,civilizationGridIntegration,placementValidator}.test.ts`, `__tests__/storage/v2Migration.test.ts`, `__tests__/background/{civilizationMessages,civilizationConcurrency,civilizationBonusIntegration}.test.ts`, `__tests__/ui/{civilizationView,spriteRegistry}.test.ts`.
- **Tài liệu Kế hoạch & Trạng thái (3 files):**
  27. `respond_plan_5B.5.md` — Ghi nhận **ĐC-12** và đánh dấu **Giai đoạn 4a-2** *(ĐÃ HOÀN TẤT)* trong Mục J.
  28. `PROJECT_STATUS.md` — Cập nhật hiện trạng lên Stage 4a-2 verified (`456/456 PASS`), cập nhật Stage `4b` là bước tiếp theo.
  29. `respond.md` — Ghi đè bằng báo cáo này.

---

## 3. Bảng So sánh Baseline (Sau 4a) vs Sau Giai đoạn 4a-2

| Hạng mục | Baseline (Sau Stage 4a) | Sau Stage 4a-2 (ĐC-12) | Chênh lệch / Ghi chú |
|---|---|---|---|
| `npm test` | **445 / 445 PASS** (`0` fail, `32.97s`) | **456 / 456 PASS** (`0` fail, `0` skipped, `0` cancelled, `0` todo, **`23.07s` / `23,069.74 ms`**) | **+11 tests mới**; UI tests chạy qua React SSR |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0 errors`) | **PASS** (`0 errors, 0 warnings`) | Sạch lỗi TypeScript |
| `npm run clean && npm run build` | **PASS** (`1.05s`, `1,724` modules) | **PASS** (`891ms`, `1,725` modules) | Sạch lỗi Vite |
| `dist/` (tổng kích thước) | `2,125,438 B` *(gồm `aistudio/` `1,255,713 B`)* | **`946,519 B`** *(gồm `aistudio/` `59,927 B`, `sprites/` `14,980 B`)* | File zip CC0 đã được dọn gọn trong `aistudio/` ở môi trường hiện tại |
| `dist/background.js` | `77.67 kB` (gzip `16.84 kB`) | **`77.67 kB`** (`77,672 B`, gzip **`16.84 kB`**) | Không đổi (`terrainGenerator` gọn) |
| `dist/assets/domainNormalizer-*.js` | `21.98 kB` (gzip `6.88 kB`) | **`27.34 kB`** (`27,344 B`, gzip **`8.36 kB`**) | `+5.36 kB` do Vite chia chunk dùng chung phần civilization core mới giữa `popup` & `background` |
| `dist/assets/popup-*.js` | `673.50 kB` (gzip `179.87 kB`) | **`683.38 kB`** (`683,387 B`, gzip **`182.15 kB`**) | `+9.88 kB` cho `TERRAIN_SPRITE_DATA`, logic cây & preview (vẫn giữ hoãn cảnh báo `> 500 kB`) |
| `dist/assets/popup-*.css` | `69.29 kB` (gzip `10.86 kB`) | **`70.41 kB`** (`70,414 B`, gzip **`10.97 kB`**) | `+1.12 kB` |
| `dist/index.html` / `blocked.html` / `manifest.json` | `637 B` / `1,537 B` / `1,007 B` | **`637 B`** / **`1,537 B`** / **`1,007 B`** | Giữ nguyên |

---

## 4. Chi tiết Kiểm thử: Assertions Cũ Đã Cập nhật & Tests Mới

### 4.1. Danh sách các Test Cũ Có Kiểm soát Đã Sửa (10 files)
Tất cả sửa đổi chỉ nhằm đồng bộ giả định cũ (`20×20`, `400` ô, chunk `10×10`, hoặc tọa độ nay có cây địa hình ở chunk `4×4`):

1. **`__tests__/core/gridMap.test.ts`**
   - Cập nhật kích thước khởi tạo `20×20` / `400` ô → `8×8` / `64` ô; chunk `10×10` → `4×4`; mở rộng `+100` → `+16` (`80`, `96`, tọa độ `(8,0)`, `(0,8)`, `(-4,0)`).
   - Cập nhật kỳ vọng `GridMap.fromSnapshot` case 5: `Error: Invalid building "overlap-bld" in snapshot: CELL_TERRAIN` (`/CELL_TERRAIN/i` thay cho `/cannot restore building/i`).
2. **`__tests__/core/civilizationState.test.ts`**
   - Cập nhật `400` → `64` ô, chunk mở rộng `(-10,0)` → `(-4,0)`, `fromSnapshot` validation cho `terrainFeatures`.
3. **`__tests__/core/civilizationGridIntegration.test.ts`**
   - Cập nhật `getEmptyCellCount()` = `unlocked - occupied - terrain`; cập nhật tọa độ thử nghiệm vào vùng trống cây trong `8×8` (như đặt `wall-1` tại `(5, 4)` tránh `campfire-1` `(3,3)` và cây `(5,7)`), mở rộng `(8,0)/(0,8)/(4,-4)` thành `112` ô.
4. **`__tests__/core/placementValidator.test.ts`**
   - Cập nhật biên `8×8` (`0..7`), đổi tọa độ test `OUT_OF_BOUNDS` bên phải sang ô rìa không cây `{ x: 7, y: 2 }` → `{ x: 8, y: 2 }` (vì `(7,0)` có cây `tree_4_0_1`), cập nhật `getEmptyCellCount() === 64 - getTerrainCellCount()`.
5. **`__tests__/storage/v2Migration.test.ts`**
   - Cập nhật `400` → `64` ô và `getEmptyCellCount() === 64 - map.getTerrainCellCount()`.
6. **`__tests__/background/civilizationMessages.test.ts`**
   - Cập nhật tọa độ mở rộng/đặt vào lưới `8×8` & chunk `4×4` (`(8,0)`, `(-4,0)`).
7. **`__tests__/background/civilizationConcurrency.test.ts`**
   - Cập nhật tổng ô sau 1–2 lần mở (`80`, `96`), bounding box (`minY=-4`, `maxY=11`) với chunk `4×4`.
8. **`__tests__/background/civilizationBonusIntegration.test.ts`**
   - Đổi tọa độ `stone_age_food_cache` (`2×3`) từ `(6,6)` (vượt biên `8×8`) sang `(4,4)`.
9. **`__tests__/ui/civilizationView.test.ts`**
   - Cập nhật assertion modal mở đất (`64 cells`, `4×4`, `+16 cells`) và kiểm tra render cây (`data-terrain-id=`, `Wild tree (blocks construction)`).
10. **`__tests__/ui/spriteRegistry.test.ts`**
    - Đổi tọa độ tòa nhà test `b_unknown` từ `(8,2)` (ngoài biên `8×8`) sang `(1,5)`.

### 4.2. Tests Mới Bổ sung (+11 tests)
- `__tests__/core/terrainGenerator.test.ts` (**+3**): xác định zero `Math.random` kể cả tọa độ âm; kiểm tra 256 chunk thỏa `1–2` cây nhỏ, `0–1` cây lớn, `<= 4` ô cây, luôn còn khối `2×2` trống và đủ mọi variant; kiểm tra `<= 12` ô cây đầu game và đặt được cả 6 công trình Stone Age cùng lúc.
- `__tests__/core/gridMap.test.ts` (**+2**): cây chặn đặt công trình (`CELL_TERRAIN`) + `removeBuilding` giữ nguyên cây; `fromSnapshot` từ chối cây ngoài biên, trùng ID, footprint sai, chồng cây, chồng công trình, và từ chối chunk cũ `10×10`.
- `__tests__/core/placementValidator.test.ts` (**+1**): phát hiện va chạm `CELL_TERRAIN` kèm `conflictingTerrainId` và `conflictingCoordinate`.
- `__tests__/background/civilizationMessages.test.ts` (**+1**): `GET_CIVILIZATION_STATE` tự phát hiện state `10×10`/thiếu cây cũ trong storage và re-seed về `8×8` (`64` ô, có cây, `schemaVersion = 2`).
- `__tests__/background/civilizationConcurrency.test.ts` (**+1**, `Test I`): rollback nguyên tử khi `EXPAND_LAND` lỗi ghi storage (khôi phục cả chunk lẫn `terrainFeatures`).
- `__tests__/ui/spriteRegistry.test.ts` (**+3**): validate `TERRAIN_SPRITE_DATA` (`16×32`, bảng màu Tiny Town, viền `#3f2631`); `getTerrainFeatureSprite` cho `TREE_SMALL` / `TREE_LARGE` / input lỗi; SSR `MapGridView` (render cây) & `SpriteGallery` (hiển thị cả 6 biến thể cây ở `1×/2×/4×`).
- Thêm assertion trực tiếp trong `__tests__/ui/civilizationView.test.ts` kiểm tra `getPlacementPreviewLabel(false, 'CELL_TERRAIN', ...)` cả EN (`'✕ Tree blocks placement'`) và VI (`'✕ Cây cối chắn chỗ đặt'`).

---

## 5. Xử lý Trạng thái Bản đồ Cũ & Kiểm soát Ràng buộc

1. **Dữ liệu bản đồ cũ (trước 4a-2):**
   - `CURRENT_CIVILIZATION_SCHEMA_VERSION` giữ nguyên **`= 2`** để tránh đụng schema v3 (Quest — Giai đoạn 2a).
   - Mọi bản đồ lưu cũ dùng chunk `10×10` hoặc không có `terrainFeatures` đều bị `GridMap.fromSnapshot` / `validateCivilizationState` / `sanitizeCivilizationState` từ chối → `CivilizationCoordinator` / `StorageManager` re-seed lại bản đồ `8×8` mới có cây cối (chấp nhận mất vị trí công trình cũ vì game chưa xuất bản; ví dụ trong `civilizationMessages.test.ts` xác minh tự động).
2. **Ràng buộc được bảo toàn 100%:**
   - **Zero Passive Income:** Cây không mang lại Coins, XP hay `CoinBonus`.
   - **Không chặt/gỡ cây ở 4a-2:** Không có handler, nút UI hay logic gỡ `TerrainFeature`.
   - **Mở rộng đất giữ nguyên miễn phí:** Không thêm chi phí Coins, chặn Level hay UI chọn vị trí mới (Milestone 5B.6).
   - **Khóa Milestone 5C:** Nút Upgrade giữ nguyên nhãn `"Milestone 5C"`.
   - **Simulator parity:** `src/ui/services/extensionClient.ts` dùng trực tiếp `createInitialCivilizationState()`, `GridMap.fromSnapshot()`, `canPlaceBuilding()`, `placeBuilding()`, `expandChunk()`, `expandInDirection()` nên tự động đồng bộ 100% logic `8×8`/`4×4` & cây cối.

---

## 6. Giới hạn Kiểm chứng & Đề xuất Tiếp theo

- **Giới hạn kiểm chứng (QUAN TRỌNG):** Toàn bộ 456 unit tests (bao gồm UI tests cho `MapGridView`, `LandExpansionModal`, `SpriteGallery`) chạy qua **React SSR (`renderToString`) trên Node.js**. Việc kiểm tra trực quan và tương tác thực tế trên **Chrome Extension thật (`Load unpacked`)** — bao gồm độ sắc nét của lưới `8×8` ở `CELL_SIZE = 32px`, hiển thị cây nhỏ CC0 & cây lớn `16×32` tràn 2 ô dọc, hover màu đỏ khi vướng cây, pan/zoom, và `#sprites` trong Web Preview — **chưa được thực hiện**.
- **Bước kế tiếp trong Milestone 5B.5:** **Giai đoạn 4b — Hoạt ảnh Cảnh Nhóm Người (`FocusSceneArea`, ĐC-11)** sử dụng bộ nhân vật CC0 Kenney Tiny Dungeon (`public/assets/sprites/kenney-tiny-dungeon/tilemap_packed.png`).

**TRẠNG THÁI:** ĐÃ HOÀN TẤT GIAI ĐOẠN 4a-2 (ĐC-12). **DỪNG CHỜ DUYỆT TRƯỚC KHI SANG GIAI ĐOẠN 4b.**
