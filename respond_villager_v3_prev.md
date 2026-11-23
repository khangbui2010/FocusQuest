# BÁO CÁO NGHIỆM THU — MILESTONE VILLAGER V2
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-22  
**Trạng thái:** **HOÀN TẤT — 650/650 TESTS PASS | BUILD PASS | LINT PASS (Chờ nghiệm thu trên Chrome thật & duyệt)**  

---

## 1. Tóm tắt các hạng mục Milestone Villager — V2 đã hoàn thành

> **Ghi chú V1:** Tài nguyên V1 (`public/assets/sprites/villagers/{elder,crafter,woodworker}.png`, `VillagerSprite.tsx`, helper trong `spriteRegistry.ts`, CSS animation bước nhảy và `SpriteGallery.tsx` §5) đã có sẵn trong repo và được tái sử dụng nguyên vẹn, **không** làm lại. File nén dự phòng `public/assets/sprites/villagers.zip` đã được xóa sạch.

### 1.1. Hang Thiền định (`stone_age_study_cave`) `3×3`, Giới hạn `1` hang & Sprite `48×48`
- **Core (`constants.ts`, `buildingCatalog.ts`, `buildingUpgrade.ts`):**
  - Cập nhật `stone_age_study_cave` lên kích thước **`3 × 3`** (`9` ô bản đồ).
  - Bổ sung `MAX_VILLAGE_CAVES = 1` và `getBuildingPlacementLimit(definition)` trả về `1` cho Hang Thiền định (`CIV_VILLAGE_CAVE_LIMIT_REACHED` khi đã có 1 hang trên bản đồ) và giữ nguyên `4` cho mỗi loại `ECONOMY_EFFECT`.
  - Bổ sung `isBuildingDefinitionUpgradeable(definition)` cho phép nâng cấp `ECONOMY_EFFECT` và `stone_age_study_cave` (`Lv. 1 → Lv. 5`, `baseCost = 50`, `upgradeCostMultiplier = 1.75`, cổng `Player Level >= 1 + currentLevel`), giữ nguyên `isBuildingCategoryUpgradeable('FOCUS_SUPPORT') === false` để **Elder's Hut** tiếp tục cố định hiệu ứng và không nâng cấp.
- **Pixel Art & Campsite (`spriteData.ts`, `FocusSceneArea.tsx`):**
  - Thay `STUDY_CAVE_ROWS` bằng ma trận pixel-art **`48 × 48`** (tuân thủ bảng màu Tiny Town + viền `#3f2631`). Trên bản đồ `MapGridView` (`CELL_SIZE = 32`), Hang hiển thị kích thước `96 × 96 px`.
  - Cập nhật `FocusSceneArea.tsx`: giữ `scene-shelter` ở kích thước gọn `width={48} height={48}` tại vị trí `left-[48px] bottom-[14px]`.

### 1.2. Mô hình Dân làng (`villager.ts`) & Bất biến Kinh tế
- **Dữ liệu tối giản & Bất biến:** `Villager = { id, role: 'elder' | 'crafter' | 'woodworker', recruitedAt }` trong `CivilizationState.villagers?: readonly Villager[]` (**không** lưu tọa độ `x/y` vào storage, **không** di chuyển/wandering, **không** có Passive Income, **không** cộng `CoinBonus` hay XP multiplier).
- **Sức chứa & Chi phí tuyển:**
  - Sức chứa tối đa = `2 × cave.level` (`VILLAGER_CAPACITY_PER_CAVE_LEVEL = 2`; `Lv.1: 2`, `Lv.2: 4`, `Lv.3: 6`, `Lv.4: 8`, `Lv.5: 10`).
  - Chi phí tuyển dân thứ `n` (`0`-indexed) = `Math.round(40 × Math.pow(1.35, currentCount))` (`[40, 54, 73, 98, 133, 179, 242, 327, 441, 596]` Coins).
- **Đứng tĩnh xác định trên bản đồ (`getVillagerIdleSpots`):** Sắp xếp dân làng theo `(recruitedAt, id)` không làm biến đổi mảng gốc, chọn các ô trống đã mở quanh Hang (ưu tiên trước cửa Hang) tránh mọi ô có công trình hoặc ô rừng chưa mở; khi bản đồ bị lấp kín không còn ô trống sẽ bỏ qua phần dư thay vì đặt đè.

### 1.3. Storage Schema v4 (`v4_villagersSchema.ts`, `migrationRunner.ts`)
- Nâng `CURRENT_SCHEMA_VERSION = 4` (giữ nguyên `CivilizationState.schemaVersion = 2` để tương thích validate lõi; bỏ qua an toàn nếu storage đã `>= 4`).
- Backfill `villagers: []` cho state cũ; giữ nguyên 100% các khóa không liên quan (`PROFILES`, `QUESTS`, `DAILY_STATS`, `ECONOMY`, `CURRENT_SESSION`, `SETTINGS`, `MUSIC_*`).
- Khi phát hiện >1 Hang Thiền định cũ: giữ duy nhất 1 hang có `level` cao nhất (tie-break: `placedAt` sớm nhất → thứ tự mảng) và hoàn **`100%`** tổng Coins đã đầu tư cho các hang dư.
- Mở rộng hang giữ lại từ `2×2` sang `3×3` tại cùng anchor nếu 9 ô đều trống và đã mở; nếu xung đột ô/biên, gỡ hang cleanly, hoàn **`100%`** tổng Coins (gốc + nâng cấp) và đặt `villagers: []`.

### 1.4. Background Coordinator, Messages & Simulator Parity
- **`CivilizationCoordinator` (`civilizationCoordinator.ts`), `MessageHandler` (`messageHandler.ts`), `messages.ts`, `errors.ts`:**
  - Thêm `RECRUIT_VILLAGER` (`{ role }` → `{ villager, cost, civilizationState, economy }`) chạy hoàn toàn trong `StorageManager.executeCivilizationTransaction` dưới `StorageMutex` kèm rollback compensation khi ghi thất bại.
  - Bổ sung **6 mã lỗi mới** (`CIV_INVALID_RECRUIT_PAYLOAD`, `CIV_INVALID_VILLAGER_ROLE`, `CIV_NO_VILLAGE_CAVE`, `CIV_VILLAGER_CAPACITY_REACHED`, `CIV_VILLAGER_INSUFFICIENT_COINS`, `CIV_VILLAGE_CAVE_LIMIT_REACHED`, `CIV_CAVE_HAS_VILLAGERS` — tổng **`113`** `ErrorCode` chuẩn hóa trong `ALL_KNOWN_ERROR_CODES`).
  - Khóa `PLACE_BUILDING` tối đa 1 Hang (`CIV_VILLAGE_CAVE_LIMIT_REACHED`), chặn `REMOVE_BUILDING` nếu Hang còn dân (`CIV_CAVE_HAS_VILLAGERS`), hang trống vẫn hoàn `50%`, và bảo toàn `villagers` qua mọi giao dịch `placeBuilding` / `upgradeBuilding` / `removeBuilding` / `expandLand`.
- **`extensionClient.ts`:** Đồng bộ đầy đủ simulator (`recruitVillagerClient`, `RECRUIT_VILLAGER`, `CIV_VILLAGE_CAVE_LIMIT_REACHED`, `CIV_CAVE_HAS_VILLAGERS`).

### 1.5. Giao diện UI, Map Layer & Song ngữ EN/VI
- **`MapGridView.tsx`:** Bổ sung `<div data-testid="map-villagers-layer">` tính từ `useMemo(findVillageCave + getVillagerIdleSpots)`, render từng dân làng qua `<VillagerSprite role={spot.role} animation="idle" scale={2} />` đứng tĩnh trên lưới `CELL_SIZE × CELL_SIZE`.
- **`BuildingDetailsModal.tsx`:** Modal hỗ trợ cuộn (`max-h-[90%] flex flex-col` + `overflow-y-auto`); hiển thị khu vực làng `cave-village-section` với 3 nút chọn vai trò dùng `<VillagerSprite reducedMotion={true} scale={2} />`, nút tuyển có khóa chống bấm đúp, banner thành công/lỗi nội tuyến, preview nâng cấp sức chứa (`2 → 4` .. `8 → 10`), và vô hiệu hóa nút Demolish kèm `demolish-blocked-villagers-hint` khi Hang còn dân.
- **`BuildingCatalogPanel.tsx` & `CivilizationScreen.tsx`:** Dùng `isBuildingDefinitionUpgradeable(def)` (Hang hiện `Max Lv. 5` và `Build Limit: 1/1`, hiệu ứng `+2 villagers / Lv`), nối `handleRecruitVillager` và reset trạng thái modal khi đóng/mở.
- **i18n (`en.ts`, `vi.ts`, `errorTranslator.ts`):** Bổ sung đầy đủ các khóa song ngữ EN/VI lên **`561` khóa parity** (`0` chuỗi/thuộc tính hardcode trong `src/ui/`) và bản địa hóa đủ **`113` mã lỗi** (xử lý an toàn cả khi `params === undefined`, không rò `undefined`/`NaN`).

---

## 2. Kết quả kiểm định thực tế

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **Baseline trước V2** | `npm run clean && npm run build` / `npm test` | **PASS** | `1,757` modules, `dist/`: `30` files (`1,300,402 B`), `636/636` tests PASS |
| **Typecheck & Lint sau V2** | `npm run lint` (`tsc --noEmit`) | **PASS (Exit 0)** | **0** errors, **0** warnings |
| **Test Suite sau V2** | `npm test` (`tsx --test`) | **PASS (Exit 0)** | **650 / 650 PASS (100%, 0 fail)** — `39,160.52 ms` *(0 test ngoài allowlist V2-E bị lỗi hay chỉnh sửa)* |
| **Production Build sau V2** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,759 modules transformed`, `2.84s` |
| **Kiểm tra `dist/`** | Kiểm tra cây `dist/` & `dist/assets/sprites/villagers/` | **SẠCH** | Tổng **`29`** tệp (`1,274,337 B`). `dist/assets/sprites/villagers/` chỉ chứa `crafter.png` (`1,073 B`), `elder.png` (`1,184 B`), `woodworker.png` (`1,048 B`); **0** file `.zip`, `.gif`, preview hay `2x` |

---

## 3. Danh sách tệp đã tạo / sửa / xóa

### Tạo mới (7 tệp)
- `respond_villager_v2_prev.md` *(sao lưu `respond.md` trước khi chạy V2)*
- `src/core/civilization/villager.ts`
- `src/storage/migrations/v4_villagersSchema.ts`
- `__tests__/core/villager.test.ts`
- `__tests__/background/recruitVillager.test.ts`
- `__tests__/storage/villagerMigration.test.ts`
- `__tests__/ui/villagerMapUi.test.ts`

### Đã sửa (30 tệp, trong đó chỉ 5 tệp test nằm đúng allowlist V2-E)
- **Core & Storage & Background:** `src/core/civilization/{constants.ts, buildingCatalog.ts, buildingUpgrade.ts, civilizationState.ts, index.ts}`, `src/storage/migrations/migrationRunner.ts`, `src/types/{errors.ts, messages.ts}`, `src/background/{civilizationCoordinator.ts, messageHandler.ts}`
- **UI, Simulator & i18n:** `src/ui/components/FocusSceneArea.tsx`, `src/ui/components/civilization/{spriteData.ts, BuildingCatalogPanel.tsx, BuildingDetailsModal.tsx, MapGridView.tsx, CivilizationScreen.tsx}`, `src/ui/services/extensionClient.ts`, `src/i18n/{errorTranslator.ts, locales/en.ts, locales/vi.ts}`
- **Tests trong allowlist V2-E (a)–(d):** `__tests__/storage/v3Migration.test.ts`, `__tests__/ui/spriteRegistry.test.ts`, `__tests__/background/upgradeBuilding.test.ts`, `__tests__/core/civilizationState.test.ts`, `__tests__/storage/v2Migration.test.ts`
- **Tài liệu:** `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `README.md`, `PROJECT_STATUS.md`, `respond.md`

### Đã xóa (1 tệp)
- `public/assets/sprites/villagers.zip`

---

## 4. Hướng dẫn kiểm thử thủ công trên Chrome thật (`Load unpacked`)

> *Lưu ý: Môi trường CLI headless không có giao diện đồ họa Chrome nên các kiểm chứng dưới đây cần người dùng thực hiện trực tiếp khi Load unpacked thư mục `dist/`.*

1. Mở `chrome://extensions/`, bật **Developer mode**, bấm **Load unpacked** và chọn thư mục `dist/`.
2. Kiểm tra **Danh mục công trình (Build Catalog)** trên tab `Map`:
   - Xác nhận *Meditation Cave* (`Hang Thiền định`) hiển thị `Max Lv. 5`, `Build Limit: 0/1`, và mô tả sức chứa `+2 dân làng / Cấp (Tối đa 1 Hang)`.
   - Xác nhận *Elder's Hut* và nhóm `DECORATIVE` vẫn giữ nhãn `Can't Upgrade` / `Không thể nâng cấp`.
3. Kiểm tra **Đặt Hang `3×3` & Giới hạn `1` Hang:**
   - Đặt *Meditation Cave* lên ô đất mở `8×8`: ghost preview phủ vùng `3×3`, sprite Cave hiển thị sắc nét (`96×96 px`), sau khi đặt Build Limit chuyển thành `1/1` và từ chối đặt Hang thứ 2.
4. Kiểm tra **Nâng cấp Hang & Tuyển dân (`BuildingDetailsModal`):**
   - Mở chi tiết Hang tại `Lv. 1` (`0/2` dân): thử bấm tuyển `Elder`, `Crafter`, `Woodworker` với giá lần lượt `40` và `54` Coins. Khi đạt `2/2`, nút tuyển chuyển sang trạng thái đầy sức chứa.
   - Xác nhận khi còn `>= 1` dân, nút **Demolish / Phá dỡ** bị vô hiệu hóa kèm giải thích rõ không thể phá Hang khi còn dân.
   - Nâng cấp Hang lên `Lv. 2` (`2 → 4 sức chứa`), tuyển thêm dân với chi phí `73` Coins; kiểm tra các dân làng xuất hiện tĩnh đúng lưới trong `map-villagers-layer` xung quanh Hang bằng hoạt ảnh `idle`.
5. Kiểm tra **Bất biến Focus Session & Song ngữ EN/VI:**
   - Chạy 1 phiên Focus ngắn: kiểm tra `Header` giữ `+0%` bonus từ Cave/Dân làng, Coins/XP nhận được khớp đúng công thức gốc (0 passive income, 0 multiplier từ dân làng); kiểm tra `FocusSceneArea` hiển thị Hang `48×48` gọn gàng.
   - Đổi ngôn ngữ `EN ↔ VI` trên `Header` để kiểm tra toàn bộ nhãn tuyển dân, sức chứa, cảnh báo và lỗi.

---

DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU VÀ DUYỆT MILESTONE VILLAGER V2.
