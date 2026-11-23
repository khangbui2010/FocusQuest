# BÁO CÁO TRIỂN KHAI MILESTONE 5B.5 — GIAI ĐOẠN 4a-2 (V2 + BỔ SUNG TÁN LÁ) & TRẠNG THÁI CHẶN MILESTONE 5B.6b

**Ngày hoàn thành:** 15/11/2026 (UTC) / 14/11/2026 (-08:00)  
**Phạm vi thực hiện:** Hoàn tất **Giai đoạn 4a-2 (ĐC-12 V2 + Bổ sung tán lá Tiny Town)** theo `respond_plan_5B.5.md`, đồng thời **DỪNG trước Milestone 5B.6b** vì điều kiện tiên quyết **5B.6a chưa được thực hiện**.

---

## 0. Thông báo Dừng Milestone 5B.6b (Điều kiện Tiên quyết Chưa Đạt)

Yêu cầu cho **Milestone 5B.6b (Animation mở rộng đất — rìu chém rừng + rung nhẹ)** ghi rõ:
> *"Điều kiện tiên quyết: 5B.6a đã hoàn tất (mở rộng có chi phí, chọn chunk liền kề, bảng xác nhận). Nếu chưa, dừng và báo cáo."*

Kết quả kiểm tra trực tiếp trên repository xác nhận **Milestone 5B.6a CHƯA được triển khai**:
1. `src/ui/components/civilization/LandExpansionModal.tsx` vẫn là modal mở đất miễn phí 4 hướng (`NORTH`/`EAST`/`WEST`/`SOUTH`), chưa có giao diện chọn chunk liền kề trên bản đồ, chưa có bảng xác nhận hay chi phí Focus Coins (`ExpandLandModal.tsx` chưa tồn tại).
2. `src/core/civilization/constants.ts`, `src/background/civilizationCoordinator.ts` và `PROJECT_STATUS.md` xác nhận Milestone **5B.6a** (và các giai đoạn `4b → 1b → 3 → 2a → 2b → 5c → 6 → 7` của Milestone 5B.5) vẫn đang ở trạng thái chờ triển khai.
3. Theo đúng quy tắc bắt buộc, phiên làm việc này **không triển khai 5B.6a hay 5B.6b**, không tạo `respond_5B6a_report.md`, hoàn tất trọn vẹn **Giai đoạn 4a-2 (V2)** vào `respond.md`, và **dừng chờ duyệt**.

---

## 1. Phần V1 Đã Gỡ (Dọn Sạch Giai đoạn 4a-2 V1 → Khôi phục Chuẩn V2)

- **Sao lưu báo cáo:** Bản báo cáo Giai đoạn 4a (`respond_phase4a_report.md`) và bản báo cáo 4a-2 V1 (`respond_phase4a2_v1_report.md`) được giữ nguyên; `respond.md` được ghi đè bằng báo cáo V2 này.
- **File đã xóa hoàn toàn:**
  1. `src/core/civilization/terrainGenerator.ts` (bộ sinh cây V1 bằng `mulberry32`, `generateChunkTerrain`, `hasEmpty2x2Block`, `getTerrainFootprint`).
  2. `__tests__/core/terrainGenerator.test.ts` (3 unit test chỉ phục vụ cây dữ liệu V1).
- **Thành phần V1 đã gỡ trong `src/core/civilization/` (khôi phục `GridMap` API/snapshot đúng như trước 4a-2, chỉ giữ lưới `8×8` & chunk `4×4`):**
  - `constants.ts`: xóa `TERRAIN_WORLD_SEED`.
  - `types.ts`: xóa `TerrainFeatureKind`, `TerrainFeature`, `'TERRAIN'` khỏi `CellStatus`, `'CELL_TERRAIN'` khỏi `PlacementFailureReason`, `terrainFeatureId`/`conflictingTerrainId`, và trường `terrainFeatures` khỏi `GridMapSnapshot`.
  - `index.ts`: xóa các export của `terrainGenerator.ts` và type `TerrainFeature*`.
  - `placementValidator.ts`: xóa `getTerrainFeatureAt` khỏi `PlacementValidationContext` và nhánh trả `'CELL_TERRAIN'`.
  - `gridMap.ts`: xóa `terrainCellMap`, `terrainFeatures`, `getTerrainFeatures()`, `getTerrainFeatureAt()`, `isCellTerrainBlocked()`, `getTerrainCellCount()`, toàn bộ logic sinh/kiểm tra `terrainFeatures` trong constructor / `expandChunk` / `clone` / `toSnapshot` / `fromSnapshot`. `GridMapSnapshot` trở lại sạch `{ chunks, buildings }`; `getEmptyCellCount()` = `unlocked - occupied`.
  - `civilizationState.ts`: xóa toàn bộ validate/check `terrainFeatures` trong `validateCivilizationState` & `sanitizeCivilizationState` (giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2` và từ chối chunk khác `4×4`).
- **Thành phần V1 đã gỡ ở UI, i18n, Credits & Tests:**
  - `src/ui/components/civilization/spriteData.ts`: xóa `TERRAIN_SPRITE_DATA` (2 sprite cây lớn `16×32` tự vẽ `terrain_tree_large_pine` / `terrain_tree_large_oak`) và kiểm tra V1 trong `validateAllSpriteData()`.
  - `src/ui/components/civilization/spriteRegistry.ts`: xóa `TerrainFeatureVisual`, `TREE_SMALL_TILE_VARIANTS`, `TREE_LARGE_SPRITE_VARIANTS`, `getTerrainFeatureSprite()`.
  - `src/ui/components/civilization/MapGridView.tsx`: xóa render lớp entity `(civilizationState.grid.terrainFeatures ?? [])` và nhánh `'CELL_TERRAIN'` trong `getPlacementPreviewLabel`.
  - `src/ui/components/civilization/SpriteGallery.tsx`: xóa Section 3 V1 (`gallery-terrain-trees`).
  - `src/i18n/locales/{en,vi}.ts`: xóa `civ.map.placeTerrain` và `civ.map.treeTitle`.
  - Tests V1 đã gỡ/thay thế: toàn bộ assertion `terrainFeatures`, `CELL_TERRAIN`, `TERRAIN_SPRITE_DATA`, `getTerrainFeatureSprite`, `data-terrain-id`, `getTerrainCellCount` trong `__tests__/core/{gridMap,placementValidator,civilizationState,civilizationGridIntegration}.test.ts`, `__tests__/storage/v2Migration.test.ts`, `__tests__/background/{civilizationMessages,civilizationConcurrency}.test.ts`, `__tests__/ui/{spriteRegistry,civilizationView}.test.ts`.

---

## 2. Tóm tắt Triển khai Giai đoạn 4a-2 (V2 + Bổ sung Tán lá)

1. **Lưới đầu game `8×8` & chunk `4×4` (`src/core/civilization/`):**
   - Lưới khởi tạo **`8×8`** (`2×2` chunk **`4×4`** = **`64` ô**), mỗi lần mở rộng mở đúng `1` chunk `4×4` (`+16` ô, giữ nguyên miễn phí tới Milestone 5B.6).
   - Giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2`; state cũ dùng chunk `10×10` bị `GridMap.fromSnapshot` / `validateCivilizationState` / `sanitizeCivilizationState` từ chối để re-seed về `8×8` sạch.
2. **Cảnh quan & Rừng Vùng chưa mở Thuần UI (`src/ui/components/civilization/terrainDecor.ts`):**
   - `getCellDecor(x, y, isUnlocked, seed = TERRAIN_DECOR_SEED, isCellUnlockedFn?)` dùng hash tọa độ 32-bit xác định (`TERRAIN_DECOR_SEED = 5202402`), **tuyệt đối không dùng `Math.random()`**, an toàn tọa độ âm (`getAlignedOrigin`).
   - **Vùng đã mở (`isUnlocked = true`):**
     - Nền cỏ chiếm chủ đạo (`0` cỏ trơn, `1` cỏ bụi, `2` hoa dại thưa ~6%).
     - Mảng đất thưa theo chunk `4×4` (`getChunkDirtPatchTile`: cụm `2×2`, `3×3`, hoặc `3×3` khuyết góc dùng các ô `12–14, 24–26, 36–38` + góc khuyết `39–42`), đá rêu thưa (`43`, tối đa 1 ô ở ~16% chunk), và trang trí vi mô thưa trên nền cỏ không hoa: mầm cây `17` (~3%) và nấm `29` (~2%).
     - **Tuyệt đối không có cây hoặc mảnh tán lá, và hoàn toàn không chặn đặt công trình.**
   - **Vùng chưa mở (`isUnlocked = false`):**
     - `MapGridView` bọc quanh `boundingBox` một viền rừng chưa mở tối thiểu **`FOREST_MARGIN_CELLS = 2`** ở mỗi cạnh (lưới đầu game `8×8` → stage **`12×12` = `384×384px`** ở `CELL_SIZE = 32px`, `zoom 1.0`).
     - Rừng rậm làm tối (`bg-slate-950/50`, `data-locked-forest="true"`) kết hợp **khối tán lá ghép liền** trên nền cỏ `0, 1`:
       - Khối `2×2` khép kín: xanh `[6, 8] / [30, 32]` & cam `[9, 11] / [33, 35]`.
       - Cặp dọc `1×2` khép kín: xanh `[7] / [31]` & cam `[10] / [34]`.
       - Truyền `isCellUnlockedFn` vào `getCellDecor` để bảo đảm khối `2×2` / `1×2` chỉ ghép khi **mọi ô thành phần đều đang khóa**, tự hạ xuống cây đứng riêng (`4, 16, 28, 5` xanh; `3, 15, 27` cam) ở góc chữ L để **không bao giờ xuất hiện mảnh tán lá đứng lẻ hoặc bị cắt mép**.
3. **SpriteGallery (`#sprites`), `TILE_INDEX.md` & `CREDITS.md`:**
   - Thêm *Section 3 (`data-testid="gallery-landscape-v2"`)* vào `SpriteGallery.tsx` hiển thị: khối tán lá `2×2` xanh (`[6,8]/[30,32]`), `2×2` cam (`[9,11]/[33,35]`), `1×2` (`[7]/[31]`), khối kim cương sâu `3×3` (`[6,19,8]/[30,19,32]/[·,31,·]`), các ô tham chiếu `17 · Sprout`, `29 · Mushrooms`, `43 · Mossy Stone`, `25/39` đất, cây `3–5, 15–16, 27–28`, và mẫu đối chiếu `6×4` vùng mở vs vùng khóa làm tối.

---

## 3. Vai trò Ô Sprite Đã Xác Minh (`Kenney Tiny Town` — `docs/sprites/tiny-town-labeled.png`)

Đã kiểm tra trực tiếp hình `docs/sprites/tiny-town-labeled.png` kết hợp kiểm tra alpha/mép pixel thực tế trên `public/assets/sprites/kenney-tiny-town/tilemap_packed.png` (`192×176px`, `12×11` ô `16×16`):

| Nhóm | Chỉ số ô (`index`) | Vai trò đã xác minh | Ghi chú ghép nối & phạm vi sử dụng |
|---|---|---|---|
| **Cỏ nền (opaque)** | `0`, `1`, `2` | `0` cỏ trơn, `1` cỏ bụi, `2` hoa dại | Dùng làm nền vùng đã mở (`0, 1, 2`) và nền dưới lớp cây/tán lá vùng chưa mở (`0, 1` — không hoa ở rừng tối) |
| **Đất có viền cỏ (opaque)** | `12–14`, `24–26`, `36–38` | Bộ mảng đất `3×3` (`12` TL, `13` T, `14` TR, `24` L, `25` tâm, `26` R, `36` BL, `37` B, `38` BR) | Dùng làm cụm `2×2` (`[12,14]/[36,38]`) và `3×3` thưa ở **vùng đã mở** |
| **Góc khuyết đất (opaque)** | `39`, `40`, `41`, `42` | Góc trong nối viền cỏ cho mảng đất hình chữ L (`39` khuyết TL, `40` TR, `41` BR, `42` BL) | Dùng ở tâm mảng `3×3` khuyết 1 góc tại **vùng đã mở** |
| **Trang trí nhỏ (unlocked)** | `17`, `29`, `43` | `17` **mầm cây** (nền trong suốt), `29` **nấm đỏ chấm trắng** (nền trong suốt), `43` **đá phủ rêu trên cỏ** (opaque) | Dùng thưa ở **vùng đã mở** (~3% `17`, ~2% `29`, ~1% `43`); tuyệt đối không phải cây lớn |
| **Cây đứng riêng (transparent bg)** | `3`, `4`, `5`, `15`, `16`, `27`, `28` | Cây hoàn chỉnh: `4` thông xanh, `16` cây tròn xanh, `28` thông nhọn xanh, `5` bụi xanh; `3` thông cam, `15` cây tròn cam, `27` thông nhọn cam | Dùng xen kẽ cùng khối tán lá tại **vùng chưa mở** (rừng tối) và thay thế tại biên tiếp giáp |
| **Mảnh tán lá xanh (transparent bg)** | `6, 7, 8, 18, 19, 20, 30, 31, 32` | `6`/`8` góc trên trái/phải, `7` ngọn cột dọc, `19` ruột tán lá lặp vô hạn, `30`/`32` gốc dưới trái/phải, `31` đáy cột dọc; `18`/`20` viền mép trong | **Quy tắc pixel đã xác minh:** ghép `[6,8]/[30,32]` (`2×2` khép kín), `[7]/[31]` (`1×2`), `[6,19,8]/[30,19,32]/[·,31,·]` (`3×3` kim cương). **Không đặt `18`/`20` trực tiếp giữa `6` và `30`** vì tán đáy `6` rộng hơn `18` sẽ gây khấc cắt ngang; mảnh tán lá **không bao giờ đứng lẻ** |
| **Mảnh tán lá cam (transparent bg)** | `9, 10, 11, 21, 22, 23, 33, 34, 35` | Bản đổi bảng màu mùa thu có alpha & mép khớp 100% với bộ xanh (`9–11, 21–23, 33–35` tương ứng `6–8, 18–20, 30–32`) | Ghép `[9,11]/[33,35]` (`2×2`) và `[10]/[34]` (`1×2`) tại **vùng chưa mở** |
| **Vật dụng tham chiếu (4a)** | `106`, `107`, `130` | `106` khúc gỗ, `107` bao tải/chum, `130` thùng/giỏ | Giữ tham chiếu đồng bộ cho sprite công trình Stone Age & `#sprites` |

---

## 4. Danh sách File Tạo / Sửa / Xóa (Đợt V2)

- **File tạo mới:**
  1. `src/ui/components/civilization/terrainDecor.ts` — Mô-đun thuần xác định sinh cảnh quan vùng mở & khối tán lá ghép liền vùng chưa mở.
  2. `__tests__/ui/terrainDecor.test.ts` — 5 tests kiểm tra tính xác định/tọa độ âm, bất biến vùng mở (không cây/tán lá, cỏ chủ đạo), bất biến vùng khóa (mật độ rừng, **0 mảnh tán lá đứng lẻ**), biên góc chữ L (`isCellUnlockedFn`), và tích hợp `GridMap` (cỏ/đất/mầm/nấm không chặn đặt + mở chunk xóa lớp tối rừng).
- **File chỉnh sửa:**
  - Core Engine (`src/core/civilization/`): `constants.ts`, `types.ts`, `index.ts`, `placementValidator.ts`, `civilizationState.ts`, `gridMap.ts`.
  - UI, i18n & Docs tài nguyên: `src/ui/components/civilization/{spriteData,spriteRegistry}.ts`, `MapGridView.tsx`, `SpriteGallery.tsx`, `src/i18n/locales/{en,vi}.ts`, `docs/sprites/TILE_INDEX.md`, `public/assets/sprites/CREDITS.md`.
  - Tests cập nhật V2: `__tests__/core/{gridMap,placementValidator,civilizationState,civilizationGridIntegration}.test.ts`, `__tests__/storage/v2Migration.test.ts`, `__tests__/background/{civilizationMessages,civilizationConcurrency}.test.ts`, `__tests__/ui/{spriteRegistry,civilizationView}.test.ts`.
  - Tài liệu dự án: `respond_plan_5B.5.md`, `PROJECT_STATUS.md`, `respond.md`.
- **File đã xóa:**
  - `src/core/civilization/terrainGenerator.ts`, `__tests__/core/terrainGenerator.test.ts`.

---

## 5. Kết quả Kiểm định Thực tế (So sánh Baseline Stage 4a vs Stage 4a-2 V2)

| Hạng mục | Baseline (Sau Stage 4a) | Sau Stage 4a-2 V2 + Tán lá | Ghi chú |
|---|---|---|---|
| `npm test` | **445 / 445 PASS** (`32.97s`) | **455 / 455 PASS** (`0` fail, `0` skipped, `0` cancelled, `0` todo, **`23.37s`**) | **+10 tests mới** vs 4a (gỡ 3 test V1, giữ/thay bằng test V2 & 5 test `terrainDecor.test.ts`) |
| `npm run lint` (`tsc --noEmit`) | **PASS** (`0 errors`) | **PASS** (**`0 errors, 0 warnings`**) | Sạch lỗi TypeScript |
| `npm run clean && npm run build` | **PASS** (`1.05s`, `1,724` modules) | **PASS** (**`1.04s`**, Vite `v8.3.5`, **`1,725` modules**) | Sạch lỗi Vite |
| `dist/` (tổng dung lượng) | `2,125,438 B` *(gồm aistudio)* | **`947,461 B`** *(gồm `aistudio/` `59,927 B`, `sprites/` `15,350 B`)* | Đã copy đủ `CREDITS.md` (`3,101 B`) và 2 packs CC0 |
| `dist/background.js` | `77.67 kB` (gzip `16.84 kB`) | **`77.67 kB`** (`77,672 B`, gzip **`16.84 kB`**) | Không phình service worker |
| `dist/assets/domainNormalizer-*.js` | `21.98 kB` (gzip `6.88 kB`) | **`22.75 kB`** (`22,755 B`, gzip **`7.10 kB`**) | `+0.77 kB` (nhẹ hơn đáng kể so với V1 `27.34 kB` vì đã gỡ cây khỏi core) |
| `dist/assets/popup-*.js` | `673.50 kB` (gzip `179.87 kB`) | **`689.39 kB`** (`689,397 B`, gzip **`183.96 kB`**) | Gồm `terrainDecor.ts` & `SpriteGallery` V2 (vẫn hoãn chunk warning `>500 kB`) |
| `dist/assets/popup-*.css` | `69.29 kB` (gzip `10.86 kB`) | **`69.56 kB`** (`69,565 B`, gzip **`10.90 kB`**) | Giữ Tailwind clean |
| `dist/index.html` / `blocked.html` / `manifest.json` | `637 B` / `1,537 B` / `1,007 B` | **`637 B` / `1,537 B` / `1,007 B`** | Không đổi |

### Tóm tắt Test cũ đã cập nhật & Lý do:
- `__tests__/core/{gridMap,placementValidator,civilizationState,civilizationGridIntegration}.test.ts` & `__tests__/storage/v2Migration.test.ts`: chuyển kỳ vọng kích thước khởi tạo `20×20` (`400` ô, chunk `10×10`) sang `8×8` (`64` ô, chunk `4×4`, mở rộng `+16` ô), gỡ assertions `terrainFeatures`/`CELL_TERRAIN` V1, thêm kiểm tra `GridMap.fromSnapshot` từ chối chunk `10×10` cũ và `GridMapSnapshot` sạch chỉ còn `['buildings', 'chunks']`.
- `__tests__/background/{civilizationMessages,civilizationConcurrency}.test.ts`: bỏ kiểm tra `terrainFeatures` V1 trong `EXPAND_LAND` & Test I rollback, giữ kiểm tra `GET_CIVILIZATION_STATE` từ chối state `10×10` cũ và re-seed về `8×8` sạch.
- `__tests__/ui/{spriteRegistry,civilizationView}.test.ts`: bỏ kiểm tra `TERRAIN_SPRITE_DATA` / `getTerrainFeatureSprite` / `CELL_TERRAIN` V1; chuyển sang kiểm tra `getCellDecorVisual`, `MapGridView` `12×12` với `data-locked-forest="true"`, `SpriteGallery` `gallery-landscape-v2`, và nhãn preview EN/VI cho `OUT_OF_BOUNDS` / `CELL_OCCUPIED`.

---

## 6. Giới hạn Kiểm chứng & Bước Tiếp theo

- **Giới hạn kiểm chứng:** Toàn bộ **455 unit tests** (kể cả UI tests `MapGridView`, `LandExpansionModal`, `SpriteGallery`) chạy qua **React SSR (`renderToString`) trên Node.js**. Việc kiểm tra trực quan và tương tác thực tế trên **Chrome Extension thật (`Load unpacked`)** & `#sprites` trong trình duyệt — độ khít pixel của khối tán lá ghép `2×2`/`1×2`/`3×3`, mầm `#17`/nấm `#29`/mảng đất ở `CELL_SIZE = 32px`, viền tối rừng chưa mở, pan/zoom — **chưa được thực hiện**.
- **Trạng thái tiếp theo:**
  1. Trong **Milestone 5B.5**: bước kế tiếp là **Giai đoạn 4b — Hoạt ảnh Cảnh Nhóm Người (`FocusSceneArea`, ĐC-11)** *(hoặc chuỗi `4b → 1b → 3 → 2a → 2b → 5c → 6 → 7`)*.
  2. **Milestone 5B.6b** đang **DỪNG CHỜ** cho tới khi **Milestone 5B.6a** được phê duyệt và hoàn tất.
