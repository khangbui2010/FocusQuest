# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER (V1 HOÀN TẤT · V2 DỪNG & HOÀN TÁC THEO V2-E)

**Milestone:** Milestone Villager — **V1** *(Asset & renderer sprite dân làng — **HOÀN TẤT & ĐẠT**)* và **V2** *(Mô hình dân làng, Cave 3×3, tuyển dân — **DỪNG & ĐÃ HOÀN TÁC SẠCH VỀ V1 + 5C-1 DO VƯỚNG QUY TẮC ALLOWLIST V2-E**)*  
**File sao lưu báo cáo cũ:** `/respond_villager_prev.md` *(được giữ nguyên vẹn `103` dòng từ báo cáo Stage 5C-1; giữ nguyên toàn bộ các bản `respond_*_prev.md` khác)*  
**Trạng thái hiện tại trên repo (sau khi hoàn tác V2, giữ trọn V1 + 5C-1):**  
- **`npm run clean && npm run build`:** **PASS** (`vite v8.3.8`, `1,757 modules transformed`, `769ms` | `dist/`: **`29` tệp**, **`1,249,452 B`**)  
- **`npm run lint` (`tsc --noEmit`):** **PASS** (`0` errors)  
- **`npm test`:** **PASS** (**`632 / 632` tests PASS**, `0` fail, `0` skipped, `0` cancelled, **`19,537.85 ms`** = `625` tests 5C-1 + `7` tests V1)

---

## 1. BASELINE GHI NHẬN TỪ GIAI ĐOẠN TRƯỚC (5C-1)

- Tham chiếu `/respond_villager_prev.md` & `PROJECT_STATUS.md`:
  - **`npm test`:** `625 / 625` PASS (`20,454.79 ms`).
  - **`npm run lint` (`tsc --noEmit`):** PASS (`0` errors).
  - **`npm run clean && npm run build`:** PASS (`vite v8.3.8`, `1,756 modules transformed`, `806ms` | `dist/`: `26` tệp, `1,237,298 B`).
  - Ghi nhận trước V1 trong `public/assets/sprites/` từng có gói `villagers.zip` (~51 kB); sau khi hoàn tất V1, gói nén này đã được trích xuất/dọn sạch và không còn tồn tại trong `public/assets/sprites/` hay `dist/assets/sprites/`.

---

## 2. PHẦN V1 — ASSET & RENDERER SPRITE DÂN LÀNG (**HOÀN TẤT & XANH 100%**)

Toàn bộ thành phần của **V1** được giữ nguyên vẹn và đã qua kiểm chứng tự động đầy đủ:

1. **Sprite sheets RGBA 64×64 (`public/assets/sprites/villagers/`):**
   - `elder.png` (`1,184 B`) — trích xuất/dựng từ CC0 Tiny Dungeon tile `#100` (Tribal Elder).
   - `crafter.png` (`1,073 B`) — trích xuất/dựng từ CC0 Tiny Dungeon tile `#88` (Crafter/Settler).
   - `woodworker.png` (`1,048 B`) — trích xuất/dựng từ CC0 Tiny Dungeon tile `#86` (Woodworker/Craftsman).
   - Quy chuẩn sheet `64×64` px RGBA (4 cột × 4 hàng, mỗi ô `16×16` px):
     - Hàng `0`: `idle` (`2` frames, `600ms/frame` = `1200ms`)
     - Hàng `1`: `walk_down` (`4` frames, `150ms/frame` = `600ms`)
     - Hàng `2`: `walk_right` (`4` frames, `150ms/frame` = `600ms`)
     - Hàng `3`: `walk_left` (`4` frames, `150ms/frame` = `600ms`)
2. **Ghi công bản quyền (`public/assets/sprites/CREDITS.md`):**
   - Bổ sung mục **Milestone Villager — Animated Villager Sprite Sheets** ghi rõ nguồn CC0 1.0 `kenney-tiny-dungeon/tilemap_packed.png` (`#100`, `#88`, `#86`) và bố cục 4 hàng animation.
3. **CSS Stepped Animation & Reduced Motion (`src/index.css`):**
   - Bổ sung `@keyframes fq-villager-steps-2`, `@keyframes fq-villager-steps-4`, lớp `.fq-villager-anim-2`, `.fq-villager-anim-4` và quy tắc tắt animation trong `@media (prefers-reduced-motion: reduce)`.
4. **Registry & Component (`spriteRegistry.ts`, `VillagerSprite.tsx`):**
   - `src/ui/components/civilization/spriteRegistry.ts`: hằng số `VILLAGER_CELL_PX = 16`, `VILLAGER_SHEET_COLUMNS = 4`, `VILLAGER_ROLES = ['elder', 'crafter', 'woodworker']`, `VILLAGER_ANIMATIONS`, `isVillagerRole`, `getVillagerSheetUrl`, `getVillagerAnimation`, `getVillagerAnimationForDirection` *(bảo đảm hướng `'up'` luôn fallback an toàn về `'idle'` do sheet gốc không có `walk_up`)*.
   - `src/ui/components/civilization/VillagerSprite.tsx`: component SSR-safe (`imageRendering: 'pixelated'`, `pointerEvents: 'none'`, hỗ trợ `scale`, `reducedMotion`, `ariaLabel`, `data-villager-role`, `data-villager-animation`).
5. **Preview Gallery (`src/ui/components/civilization/SpriteGallery.tsx`):**
   - Bổ sung **Section 5 (`data-testid="gallery-villagers-section"`)** trưng bày cả 3 vai trò (`gallery-villager-card-elder`, `gallery-villager-card-crafter`, `gallery-villager-card-woodworker`) across đủ 4 animation ở tỷ lệ `2× (32px)` và `4× (64px)`.
6. **Kiểm thử V1 (`__tests__/ui/villagerSprite.test.ts` — `7` tests mới):**
   - Kiểm chứng hằng số & cấu hình animation, `isVillagerRole` / `getVillagerSheetUrl`, ánh xạ 4 hướng kèm `up -> idle`, SSR `VillagerSprite` (scale `2×`/`4×`, `reducedMotion`), xác thực nhị phân PNG IHDR `64×64` bit-depth `8` color-type `6` (RGBA) cho đủ 3 file, và SSR Section 5 của `SpriteGallery` (`7 / 7` PASS).

---

## 3. PHẦN V2 — BÁO CÁO DỪNG & HOÀN TÁC BẮT BUỘC THEO QUY TẮC V2-E

### 3.1. Diễn biến triển khai & kết quả kiểm chứng trước khi hoàn tác
- Trong lượt thử nghiệm **V2** (mô hình dân làng, nâng Cave `stone_age_study_cave` lên footprint `3×3`, tuyển dân `RECRUIT_VILLAGER`, schema v4 `v4_villagersSchema`), mã nguồn V2 đã đạt:
  - **`npm run lint` (`tsc --noEmit`):** PASS (`0` errors).
  - **`npm run build`:** PASS (`vite v8.3.8`, `1,759 modules`, `792ms`).
  - **`npm test`:** **`635 / 639` PASS** — toàn bộ các test V2 mới (core `villager.ts`, background `RECRUIT_VILLAGER`, migration `v4_villagersSchema`, UI `villagerMapUi`, kiểm tra song ngữ `fullBilingual`, `Sprite Data (4a)`, `Sprite Palette (4a)`) đều **PASS** *(trong quá trình chạy test V2 đã phát hiện và sửa bug `villager.ts:215` kiểm tra `getOccupyingBuilding(cx, cy) === undefined` thay vì `=== null`)*.

### 3.2. Bốn (4) assertion test cũ thất bại nằm NGOÀI V2-E Allowlist (Lý do buộc phải DỪNG & HOÀN TÁC)
Bộ test thất bại đúng **4 vị trí** thuộc các file test cũ không nằm trong danh sách được phép sửa của quy tắc **V2-E**:

1. **`__tests__/storage/v3Migration.test.ts:121,122`** — kỳ vọng `res.currentVersion === 3` và `SCHEMA_VERSION === 3` (thực tế V2 nâng `CURRENT_SCHEMA_VERSION` lên `4`).
2. **`__tests__/storage/v3Migration.test.ts:154,164`** — kỳ vọng `resEmpty.currentVersion === 3` và `resV1.currentVersion === 3` (thực tế V2 nâng lên `4`).
3. **`__tests__/storage/v3Migration.test.ts:191,192`** — kỳ vọng `second.previousVersion === 3` và `second.currentVersion === 3` (thực tế V2 nâng lên `4`).
4. **`__tests__/ui/spriteRegistry.test.ts:300`** — kỳ vọng chuỗi `'Fixed effect · Cannot be upgraded'` xuất hiện khi render chi tiết `stone_age_study_cave` (vì V2 mở nâng cấp cho Cave nên assertion cũ cho Cave bị fail).

Tuân thủ nghiêm ngặt quy tắc **V2-E** (không tự ý sửa các test cũ ngoài allowlist), toàn bộ thay đổi của **V2** đã được **dừng và hoàn tác hoàn toàn** về nền **V1 + 5C-1**.

### 3.3. Xác nhận hoàn tác sạch toàn bộ V2
- **Xóa 6 tệp chỉ thuộc V2:**
  - `src/core/civilization/villager.ts`
  - `src/storage/migrations/v4_villagersSchema.ts`
  - `__tests__/core/villager.test.ts`
  - `__tests__/background/recruitVillager.test.ts`
  - `__tests__/storage/villagerMigration.test.ts`
  - `__tests__/ui/villagerMapUi.test.ts`
- **Khôi phục nguyên trạng 21 tệp đã sửa cho V2** *(constants, buildingCatalog, buildingUpgrade, civilizationState, index, migrationRunner về `CURRENT_SCHEMA_VERSION = 3`, errors, messages, errorTranslator, locales `en.ts`/`vi.ts` kèm dọn khóa trùng `'civ.map.buildingTooltip'`, civilizationCoordinator, messageHandler, extensionClient, spriteData `32×32` 2×2 cho Cave, FocusSceneArea `64×64`, BuildingCatalogPanel, BuildingDetailsModal, MapGridView, CivilizationScreen, và 4 file test đã chỉnh khi thử V2)*.
- **Kiểm tra tàn dư ký hiệu V2 (`grep -rnE ... src/ __tests__/`)**: **`0` kết quả** (`GREP_EXIT=1`).

---

## 4. KẾT QUẢ KIỂM CHỨNG THỰC TẾ SAU HOÀN TÁC (V1 + 5C-1)

Toàn bộ các lệnh dưới đây được chạy trực tiếp sau chỉnh sửa cuối cùng:

1. **`npm run clean && npm run build`:** **PASS** (Exit code `0`, Vite `v8.3.8`, **`1,757 modules transformed`**, **`769ms`**).
   - Tổng dung lượng tệp thực tế trong `dist/`: **`29` tệp**, **`1,249,452 B`** *(tăng đúng `3` tệp ảnh PNG của V1 so với `26` tệp ở 5C-1; `0` file audio; `0` file `villagers.zip`)*.
   - Danh sách `dist/assets/sprites/`:
     - `dist/assets/sprites/CREDITS.md` (`4,836 B`)
     - `dist/assets/sprites/kenney-tiny-dungeon/License.txt` (`570 B`)
     - `dist/assets/sprites/kenney-tiny-dungeon/Tilesheet.txt` (`238 B`)
     - `dist/assets/sprites/kenney-tiny-dungeon/tilemap_packed.png` (`5,294 B`)
     - `dist/assets/sprites/kenney-tiny-town/License.txt` (`567 B`)
     - `dist/assets/sprites/kenney-tiny-town/Tilesheet.txt` (`238 B`)
     - `dist/assets/sprites/kenney-tiny-town/tilemap_packed.png` (`5,042 B`)
     - `dist/assets/sprites/villagers/crafter.png` (`1,073 B`)
     - `dist/assets/sprites/villagers/elder.png` (`1,184 B`)
     - `dist/assets/sprites/villagers/woodworker.png` (`1,048 B`)
2. **`npm run lint` (`tsc --noEmit`):** **PASS** (Exit code `0`, **`0` errors**).
3. **`npm test`:** **PASS** (Exit code `0`, **`632 / 632` tests PASS**, `0` fail, `0` skipped, `0` cancelled, **`19,537.85 ms`** — gồm `625` tests của 5C-1 + `7` tests V1 trong `__tests__/ui/villagerSprite.test.ts`).

---

## 5. KẾT QUẢ CHROME VERIFICATION (TRUNG THỰC TUYỆT ĐỐI)

- **Chưa kiểm chứng trên Chrome thật** (môi trường thực thi hiện tại là Node.js CLI headless, không có Chrome GUI / DevTools runtime).
- Toàn bộ kiểm chứng hiện tại chạy qua Vite build, TypeScript `tsc --noEmit`, React SSR `renderToString`, phân tích nhị phân PNG và mock Chrome/Storage adapters. Section 5 `#sprites` của V1 (`VillagerSprite`) cần được kiểm tra trực quan thêm khi mở Web Preview hoặc Chrome thật.

---

## 6. ĐỀ XUẤT CẤP QUYỀN ALLOWLIST ĐỂ TRIỂN KHAI LẠI V2 (NẾU DUYỆT)

Để **V2** có thể triển khai lại mà không vi phạm quy tắc kiểm thử V2-E, cần người dùng duyệt **1 trong 2 phương án allowlist** dưới đây cho lượt tiếp theo:
1. **Allowlist cho `__tests__/storage/v3Migration.test.ts` (dòng `121, 122, 154, 164, 191, 192`):** Cho phép cập nhật test v3 sang truyền `overrideTargetVersion = 3` (hoặc đồng bộ assertion kỳ vọng schema mới `v4`), bảo toàn mục tiêu test migration v2→v3 độc lập với version tiếp theo.
2. **Allowlist cho `__tests__/ui/spriteRegistry.test.ts:300`:** Cho phép cập nhật assertion kiểm tra `'Fixed effect · Cannot be upgraded'` sang một công trình `FOCUS_SUPPORT` cố định khác (như `stone_age_elder_hut`) và bổ sung assertion phù hợp cho `stone_age_study_cave` khi nâng cấp Cave ở V2.

---

**DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU VÀ DUYỆT MILESTONE VILLAGER V1/V2.**
