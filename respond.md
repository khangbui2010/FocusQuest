# BÁO CÁO NGHIỆM THU — MILESTONE 5G: TÍCH HỢP BỘ ASSET THEO ERA & ĐỔI TÊN TOTEM (`Standing Stone` / `Đá dựng`)

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5D-2 + 5E-3** trước đó đã được sao lưu nguyên vẹn tại `respond_5g_prev.md`; mọi tệp `respond_*_prev.md` khác trong repo đều được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Milestone 5G (Asset Integration Only)**: giải nén và sắp xếp gọn toàn bộ bộ tài nguyên từ `public/assets/bronze_assets/` (`tool_skins_16.png` `64×48`, `smith.png` / `merchant.png` / `mason.png` `64×64`, `bronzeSpriteData.ts` 10 công trình Bronze Age, `bronzeConstructionSpriteData.ts` 4 giai đoạn × 10 công trình, cùng preview & script tham chiếu đưa sang `docs/assets/era/`, xóa sạch `public/assets/bronze_assets/`), tích hợp `EraToolTileIcon` + `getEraToolSkinSpec` vào `FocusSceneArea` và `Awards` (`builder`, `master_builder`, `land_clearer`), đăng ký cô lập các asset Bronze Age trong `spriteRegistry.ts` và trưng bày ở `#sprites` (`SpriteGallery.tsx` §7), đổi tên hiển thị `stone_age_totem` → **`Standing Stone`** / **`Đá dựng`** (`0` tàn dư `Ancient Totem` / `Vật tổ`), cập nhật đầy đủ tài liệu (`CREDITS.md`, `TILE_INDEX.md`, `README.md`, `ARCHITECTURE.md`, `PRODUCT_SPEC.md`, `PROJECT_STATUS.md`) và kiểm định xanh toàn repo (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`34` tệp, `1,341,100 B`**, **`npm test` = `775 / 775 PASS`**, **`756 / 756` khóa EN/VI**, **`131` ErrorCodes**). **Luồng trực quan & chạy thật trên trình duyệt Chrome thật (`>= 116`) chưa kiểm chứng trên Chrome thật** vì môi trường headless không chạy trình duyệt Chrome; chi tiết checklist kiểm tra ghi tại mục 5.

---

## 1. Phạm Vi & Ràng Buộc Milestone 5G (Asset-Only Guard)

- **Không kích hoạt Bronze Age & không đụng luật chơi:**
  - `civilization.era` mặc định giữ **`'STONE_AGE'`**; `eraRules.ts` không kích hoạt chuyển Era.
  - `STONE_AGE_BUILDING_DEFINITIONS` giữ nguyên **`6`** công trình; không thêm bất kỳ công trình hay dân làng Bronze nào vào `buildingCatalog.ts`, menu xây dựng, công thức giá, buff, XP, Quests hay ngưỡng/tên Awards.
  - `VILLAGER_ROLES` giữ nguyên `['elder', 'crafter', 'woodworker']`.
  - `CURRENT_SCHEMA_VERSION` giữ nguyên **`7`**; không thêm migration; `public/manifest.json` giữ nguyên **`5`** quyền cũ.
  - Không thêm lore/chữ kể chuyện, không ma thuật/siêu nhiên, không thu nhập thụ động, và không tự vẽ lại asset nhị phân mới ngoài gói được cung cấp.

---

## 2. Chi Tiết Triển Khai Đã Thực Hiện

### 2.1. Giải nén, Tổ chức & Dọn sạch `public/assets/bronze_assets/`
- **`public/assets/sprites/era/tool_skins_16.png`** (`64 × 48` px, `4` cột × `3` hàng ô `16 × 16` px: `axe`, `pickaxe`, `sickle`, `hammer` theo các hàng `STONE_AGE`, `BRONZE_AGE`, `IRON_AGE` trở lên).
- **`public/assets/sprites/villagers/{smith,merchant,mason}.png`** (`64 × 64` px mỗi file, `4 × 4` ô `16 × 16` px chuẩn `VILLAGER_ANIMATIONS`).
- **`src/ui/components/civilization/bronzeSpriteData.ts`** (`10` ma trận công trình Bronze Age: `bronze_forge`, `bronze_market_stall`, `bronze_grain_silo`, `bronze_irrigated_field`, `bronze_apiary`, `bronze_scribe_hall`, `bronze_craft_workshop`, `bronze_watchtower`, `bronze_longhouse`, `bronze_town_hall`) & **`src/ui/components/civilization/bronzeConstructionSpriteData.ts`** (`4` giai đoạn xây dựng × `10` công trình).
- **`docs/assets/era/`** (ngoài `public/` & `dist/`): lưu giữ `tool_skins_preview.png`, `bronze_buildings_preview.png`, `bronze_construction_stages_preview.png`, `villagers_bronze_preview.png`, `gen_bronze_construction.py`.
- Đã gỡ hoàn toàn thư mục nguồn tạm `public/assets/bronze_assets/` sau khi phân phối.

### 2.2. Skin Công Cụ Theo Era (`FocusSceneArea` & `Awards`)
- **`src/ui/components/civilization/constructionTools.ts`:** Bổ sung `ToolKind` (`'axe' | 'pickaxe' | 'sickle' | 'hammer'`), `TOOL_SKINS_SHEET_PATH`, `getEraToolSkinRow`, `getEraToolSkinSpec`, `getConstructionToolKind`, `getAwardToolKind`; giữ nguyên `CONSTRUCTION_TOOL_TILES` & `getConstructionToolSpec` cho tương thích ngược.
- **`src/ui/components/civilization/TileImage.tsx`:** Bổ sung `EraToolTileIcon` (`data-tool-kind`, `data-tool-era`, `data-tool-skin-row`, `data-tool-skin-col`, `imageRendering: 'pixelated'`, rào NaN cho `size`).
- **`src/ui/utils/{focusSceneModel,focusWorkSceneModel}.ts` & `src/ui/components/FocusSceneArea.tsx`:** Gắn `toolKind` lên `SceneVillagerPose` và `WorkSubSceneModel`; `FocusSceneArea` thay render công cụ trong cả cảnh trại (camp) lẫn các khung làm việc (`1–4` work sub-scenes) bằng `<EraToolTileIcon>`, lấy `toolEra = civilizationState?.era ?? era ?? 'STONE_AGE'`.
- **`src/ui/components/awards/{AwardIcon,AwardDetailsModal,AwardsView}.tsx` & `src/App.tsx`:** Truyền prop `era` tùy chọn (mặc định `'STONE_AGE'`) từ `AwardsView`, `AwardDetailsModal`, và `App.tsx` toast; `AwardIcon` dùng `getAwardToolKind` hiển thị `<EraToolTileIcon>` cho `builder` (`hammer`), `master_builder` (`pickaxe`), và `land_clearer` (`axe`), các huy hiệu khác giữ nguyên tile CC0/gốc.

### 2.3. Đăng Ký Cô Lập Bronze Age & `#sprites` §7
- **`src/ui/components/civilization/spriteRegistry.ts`:** Re-export `EraToolTileIcon`, các helper `tool_skins_16`, `BRONZE_AGE_SPRITE_DATA`, `BRONZE_AGE_BUILDING_IDS`, `BRONZE_CONSTRUCTION_STAGE_COUNT`, `BRONZE_CONSTRUCTION_SPRITE_STAGES`, `getBronzeBuildingSprite`, `getBronzeConstructionSprite` (tái sử dụng `getConstructionStageIndex(stageIndexOrRemaining, totalSeconds)`), `BRONZE_VILLAGER_ROLES`, `BronzeVillagerRole`, `BRONZE_VILLAGER_SHEETS`, `isBronzeVillagerRole`, và `getBronzeVillagerSheetUrl`.
- **`src/ui/components/civilization/SpriteGallery.tsx`:** Thêm mục 7 **`data-testid="gallery-era-assets-5g"`** trưng bày:
  1. Bảng `4 × 3` skin công cụ theo Era (`tool_skins_16.png`: Stone / Bronze / Iron+ × `axe` / `pickaxe` / `sickle` / `hammer`).
  2. Toàn bộ `10` công trình Bronze Age ở `1×` và `2×`.
  3. Toàn bộ `4` giai đoạn xây dựng của từng công trình Bronze Age.
  4. `3` spritesheet dân làng Bronze (`smith`, `merchant`, `mason`) với đầy đủ 4 animation (`idle`, `walk_down`, `walk_right`, `walk_left`).

### 2.4. Đổi Tên `stone_age_totem` → `Standing Stone` / `Đá dựng`
- Cập nhật tên & mô tả trong `src/core/civilization/buildingCatalog.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/vi.ts`, và đồng bộ chú thích trong `spriteData.ts`, `devStateHelpers.ts`, `focusSceneModel.ts`, `CREDITS.md`, `TILE_INDEX.md`, `README.md`, `ARCHITECTURE.md`, `PRODUCT_SPEC.md`, `PROJECT_STATUS.md`.
- Giữ nguyên `definitionId = 'stone_age_totem'`, giá, giới hạn đặt `3`, và toàn bộ khóa i18n để bảo toàn 100% tương thích save cũ.
- Quét toàn bộ `src/` và `__tests__/`: **`0`** chuỗi `"Ancient Totem"` hoặc `"Vật tổ"` còn sót lại (ngoại trừ biểu thức kiểm tra chặn hồi quy trong `eraAssets5g.test.ts`).

---

## 3. Tài Liệu & Kiểm Thử (Chỉ Chạy `npm test` 1 Lần Cuối)

- **Test mới (`__tests__/ui/eraAssets5g.test.ts` — 7 subtests):**
  1. Kiểm tra kích thước IHDR PNG thật (`tool_skins_16.png` `64×48`, `{smith,merchant,mason}.png` `64×64`).
  2. Kiểm định toàn bộ `10` ma trận công trình Bronze Age và `40` ma trận 4 giai đoạn xây dựng (`validateSpriteMatrix`).
  3. Kiểm tra `getEraToolSkinSpec` qua mọi `ToolKind` × mọi Era và render `<EraToolTileIcon>`.
  4. Kiểm tra tích hợp UI `FocusSceneArea` (camp + work sub-scenes) và `Awards` (`AwardIcon`, `AwardsView`) với các prop Stone/Bronze/Iron.
  5. Kiểm tra `#sprites` (`SpriteGallery` §7) hiển thị đủ `4×3` công cụ, `10` công trình Bronze, `4` giai đoạn xây dựng và `3` dân làng Bronze.
  6. Kiểm tra đổi tên `stone_age_totem` → `Standing Stone` / `Đá dựng`, zero leftover `"Ancient Totem"` / `"Vật tổ"`, và guard cô lập Stone Age (`era === 'STONE_AGE'`, `VILLAGER_ROLES.length === 3`, `STONE_AGE_BUILDING_DEFINITIONS.length === 6`).
  7. Kiểm tra đóng gói sạch `public/` và `dist/` (chỉ có asset runtime, không có `.zip`/`.py`/`.ts`/preview/`bronze_assets`).
- **Cập nhật các test bị ảnh hưởng bởi `EraToolTileIcon` & `Standing Stone` / `Đá dựng`:**
  - `__tests__/ui/focusSceneArea.test.ts`, `__tests__/ui/focusWorkSceneScaleAndTools5e2b.test.ts`, `__tests__/ui/focusJobAssignmentUi5e2.test.ts`, `__tests__/ui/focusRunningView.test.ts`, `__tests__/ui/civilizationView.test.ts`, `__tests__/ui/fullBilingual.test.ts`, `__tests__/background/awardsIntegration.test.ts`, `__tests__/background/sessionJobAssignment5e2.test.ts`.

---

## 4. Kết Quả Kiểm Định Tự Động & So Sánh `dist/` Trước / Sau 5G

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được thực tế | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Sạch toàn bộ `src/`, `src/dev/` và `__tests__/` |
| **Production Build** | `npm run clean && npm run build` & `compile_applet` | **PASS (`34` tệp, `1,341,100 B`)** | Trước 5G: `30` tệp / `1,227,503 B` → tăng `+4` tệp PNG (`tool_skins_16.png` `1,148 B`, `smith.png` `1,030 B`, `merchant.png` `1,102 B`, `mason.png` `1,165 B`) + code đăng ký/UI; **`0`** tệp audio; **`0`** `.zip`/`.py`/`.ts`/preview/`bronze_assets`; **`0`** God Mode / `jsxDEV` trong `dist/` |
| **Artifacts chính trong `dist/`** | Vite 8.3.8 MV3 build | `popup-DU2Aw12i.js`: `682.18 kB` (`682,182 B`) · `dateUtils-24k24qHS.js`: `272.11 kB` (`272,111 B`) · `background.js`: `127.27 kB` (`127,272 B`) · `popup-BIw40qB-.css`: `118.79 kB` (`118,793 B`) · `translator-D3dynBhf.js`: `93.98 kB` (`93,980 B`) · `offscreen.js`: `3.87 kB` (`3,878 B`) · `blocked.js`: `1.32 kB` (`1,321 B`) | MV3 CSP-safe; `manifest.json` giữ nguyên `5` quyền |
| **Test Suite toàn repo** | `npm test` (chạy 1 lần ở cuối) | **`775 / 775 PASS` (`0` fail, `0` cancelled, `0` skipped)** | `34,124.55 ms` (~34.1s) |
| **Parity EN/VI & ErrorCodes** | `locales/{en,vi}.ts` & `errorTranslator.ts` | **`756 / 756` khóa (`100%`) · `131` ErrorCodes** | `i18nStaticGuard` xanh toàn repo |
| **Chrome thật (`>= 116`)** | Kiểm thử trực quan & tương tác trên Chrome thật | **CHƯA KIỂM CHỨNG TRÊN CHROME THẬT** | Môi trường headless không chạy trình duyệt Chrome thật; vui lòng kiểm chứng theo checklist mục 5 |

---

## 5. Checklist Kiểm Chứng Thủ Công Trên Dev Server & Chrome Thật

1. **Web Preview `#sprites` (`npm run dev` → mở `/#sprites`):**
   - Kéo xuống cuối trang tới **Section 7 (`gallery-era-assets-5g`)**: kiểm tra bảng `4 × 3` skin công cụ (`axe`, `pickaxe`, `sickle`, `hammer` cho Stone / Bronze / Iron+), `10` công trình Bronze Age (`1×` & `2×`) sắc nét `pixelated`, `4` giai đoạn xây dựng của từng công trình Bronze, và `3` dân làng Bronze (`smith`, `merchant`, `mason`) chạy animation bước/đứng bình thường.
2. **Popup UI (`npm run dev` & unpacked Chrome `dist/`):**
   - **Map & Catalog:** Kiểm tra công trình `stone_age_totem` hiển thị tên mới **`Standing Stone`** (EN) / **`Đá dựng`** (VI) ở catalog, bản đồ và chi tiết công trình; chỉ có `6` công trình Stone Age và `3` vai trò dân làng Stone Age (`Era` giữ nguyên `Stone Age`).
   - **FocusSceneArea:** Bắt đầu một phiên Focus (cả trường hợp `0` job cảnh trại và `1–4` job đang xây dựng), xác nhận dân làng cầm skin công cụ Stone Age từ `tool_skins_16.png` sắc nét, vung khi `FOCUSING` và đứng yên khi `PAUSED` / `BREAK` / `Reduce motion`.
   - **Tab `Awards`:** Kiểm tra 3 huy hiệu `Builder`, `Master Builder`, `Land Clearer` hiển thị icon búa / cuốc chim / rìu hàng Stone Age từ `tool_skins_16.png`, cùng toàn bộ 5 tab (`Quests | Focus | Map | Awards | Stats`) không có lỗi console/CSP khi load `dist/` trong `chrome://extensions/`.

**DỪNG — CHỜ DUYỆT MILESTONE 5G.**
