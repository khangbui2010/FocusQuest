# BÁO CÁO NGHIỆM THU — MILESTONE 5E-1: CÔNG VIỆC XÂY DỰNG THEO ĐỘI DÂN LÀNG, ĐẾM NGƯỢC ĐẾN GIÂY, MỞ ĐẤT CẤP SỐ CỘNG, DÂN LÀNG KHỞI ĐẦU & ĐỔI TÊN HANG

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5D-1** trước đó đã được sao lưu nguyên vẹn sang `respond_5e1_prev.md`; mọi file `respond_*_prev.md` khác (`respond_5d1_prev.md`, `respond_v5_2_prev.md`, `respond_cleanup1_prev.md`, `respond_villager_*_prev.md`, `respond_5c1_prev.md`, `respond_5c_prev.md`, v.v.) vẫn được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã triển khai hoàn chỉnh **Milestone 5E-1** qua đủ **5 chặng A → E**, đồng bộ toàn bộ tài liệu (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md`, `docs/sprites/TILE_INDEX.md`) và hoàn tất kiểm định tự động (**`715 / 715 PASS`** liên tiếp 3/3 lượt, **`npm run lint` = `0` lỗi TypeScript**, **`npm run build` = PASS** với **`30` tệp, `1,423,416 B`, `0` tệp audio**, không tồn tại `public/assets/aistudio`). **Kiểm tra trực quan & tương tác trên Google Chrome thật (`>= 116`) chưa thực hiện và cần bạn kiểm chứng khi nghiệm thu.**

---

## 1. Đối Chiếu Chặng 0 Với Mã Hiện Tại

1. **Giữ nguyên Schema & ID công trình cũ:** Giữ `CURRENT_SCHEMA_VERSION = 5` (`fq_civilization` giữ `CURRENT_CIVILIZATION_SCHEMA_VERSION = 2` với các trường bổ sung tùy chọn tương thích ngược `jobs?: readonly ConstructionJob[]` và `founderRole?: VillagerRole | null`), giữ `era === 'STONE_AGE'` (`5C-2 Bronze Age` chưa kích hoạt), giữ nguyên ID `stone_age_study_cave` ở mọi tầng dữ liệu/storage/migration (`v4_villagersSchema.ts` giữ nguyên hành vi lịch sử).
2. **Đặt tên móc đồng bộ & helper chuẩn mã hiện hành:**
   - Tiến độ công việc xây dựng nối qua `advanceCivilizationJobsSeconds` trong `StorageManager.commitSessionOutcomeInternal` (cùng giao dịch `setMultiple` dưới `StorageMutex` + cập nhật `CivilizationCoordinator.refreshCachedBonuses()`), được `SessionCoordinator` truyền vào **duy nhất** ở 4 nhánh `COMPLETED` hợp lệ (`questOutcomeDelta.completedFocusMinutes * 60`).
   - Hỗ trợ dân làng khởi đầu dùng `FOUNDER_VILLAGER_ID = 'founder_villager'` + helper thuần `getEffectiveVillagersForDisplay(villagers, founderRole)` trong `src/core/civilization/villager.ts` để giữ nguyên mảng `villagers` đã tuyển trong storage và không phá công thức sức chứa Hang.
3. **Bù đường dẫn & tài nguyên:** Nối tài sản `public/assets/sprites/clock_tiles_16.png` (`48×16`, 3 tile `CLOCK`/`HOURGLASS`/`STOPWATCH`) và ma trận 4 giai đoạn dựng khung trong `src/ui/components/civilization/constructionSpriteData.ts`.

---

## 2. Chi Tiết Triển Khai Theo Chặng (A → E)

### Chặng A — Động cơ Job, Hàng Đợi Đội Dân Làng FIFO & Quyết Toán Giây Focus
- **`src/core/civilization/jobs.ts` (nguồn chân lý duy nhất):**
  - Bảng thiết kế tập trung: *Campfire* (`0` dân / `0s` tức thì); *Ancient Totem*, *Rock Shelter*, *Foraging Post* (`1` dân / `3600s` = `60` phút); *Elder's Hut*, *Primitive Granary* (`2` dân / `7200s` = `120` phút); nâng cấp `L → L+1` (`1` dân nếu `L <= 2`, `2` dân nếu `L >= 3`, thời lượng `300 × L` giây = `5, 10, 15, 20` phút); mở rộng 1 chunk đất (`2` dân / `3600s` = `60` phút).
  - **`assignJobsFifo(jobs, totalVillagers)`:** Tối đa `MAX_ACTIVE_CONSTRUCTION_JOBS = 4` việc `ACTIVE` cùng lúc theo thứ tự FIFO trong giới hạn tổng thợ (`recruited + founder`); các việc nâng cấp cùng `buildingId` chạy tuần tự theo `targetLevel` tăng dần.
  - **`advanceJobs` & `projectJobs`:** Mô phỏng theo bước sự kiện rời rạc liên tục theo **số nguyên giây Focus** (mang phần giây thừa trong cùng phiên sang job tiếp theo vừa mở khóa khi có thợ rảnh); `0` lời gọi `Date.now()` / `Math.random()`.
- **`CivilizationCoordinator`, `SessionCoordinator` & `StorageManager`:**
  - `PLACE_BUILDING`, `UPGRADE_BUILDING` (cho phép xếp hàng nhiều bậc liên tiếp qua `getEffectiveTargetLevel`, chặn khi nhà đang xây lần đầu bằng `CIV_BUILDING_UNDER_CONSTRUCTION`), `EXPAND_LAND` (chặn trùng chunk đang dọn bằng `CIV_EXPAND_ALREADY_QUEUED`), và `CANCEL_CONSTRUCTION_JOB` (hoàn **`100%`** nếu chưa làm giây nào, **`50%`** nếu `> 0s`, hủy nối tầng upgrade cao hơn trên cùng công trình; `REMOVE_BUILDING` hoàn `50%` luôn mọi job gắn với công trình bị phá).
  - Cô lập hoàn toàn công trình đang xây lần đầu (`isBuildingUnderConstruction`): **`0` `CoinBonus`**, không tính sức chứa *Rock Shelter* (`findVillageCave`), không mở `Focus Streak` (`focusStatUnlock.ts`), và không tính vào `evaluateEraAdvance`.
  - Kiểm thử Chặng A: `__tests__/core/jobs.test.ts` & `__tests__/background/constructionJobsIntegration.test.ts`.

### Chặng B — Sprite 4 Giai Đoạn, Badge Đồng Hồ, Chiếu `1s` UI & Modals
- **Assets & Registry:** Tích hợp `public/assets/sprites/clock_tiles_16.png` (`ClockTileIcon` / `CLOCK_TILE_INDEX` trong `TileImage.tsx` & `spriteRegistry.ts`) và `constructionSpriteData.ts` (`0–24%` phác thảo xanh, `25–49%` lộ `35%`, `50–74%` lộ `65%`, `75–99%` lộ `90%`).
- **Chiếu `1s` thuần UI (`src/ui/components/civilization/jobProjection.ts`):** `computeLiveSessionElapsedFocusSeconds` + `isLiveFocusTicking` chỉ đếm tiến 1s trên UI khi `status === 'RUNNING'` ở pha `FOCUS`; đứng yên khi `PAUSED`, `SHORT_BREAK`, `LONG_BREAK` hoặc kết thúc (`0` ghi storage).
- **UI & Simulator:** Cập nhật `MapGridView.tsx` (hiển thị sprite 4 giai đoạn, huy hiệu đồng hồ `MM:SS`/`H:MM:SS`, nút/khung chunk đang dọn rừng), `ClearingChunkModal.tsx`, `BuildingDetailsModal.tsx` (danh sách hàng đợi job, nút Cancel hiển thị đúng hoàn `100%`/`50%` từ `getCancelJobRefundPreview`), `BuildingCatalogPanel.tsx` (hiện số thợ & phút thi công), `FocusSceneArea.tsx` + `focusSceneModel.ts` (ẩn công trình đang xây lần đầu khỏi trại cho tới khi xong), và đồng bộ 100% simulator `extensionClient.ts`.
- Kiểm thử Chặng B: `__tests__/ui/constructionJobsUi.test.ts`.

### Chặng C — Mở Rộng Đất Theo Cấp Số Cộng Bậc Thang
- Cập nhật `src/core/civilization/constants.ts` & `src/core/civilization/landExpansion.ts`:
  - `LAND_EXPANSION_BASE_COST = 30`, `INITIAL_INCREMENT = 10`, `STEP_BONUS = 5` mỗi `5` lần mở rộng → `k = 1..8: [30, 40, 50, 60, 70, 80, 95, 110]`, `k = 20: 355`.
  - Giữ cổng `Player Level >= k + 2` và giảm giá **Woodworker** (`-5%/người`, trần `-40%` via `applyCostDiscount`), nối trực tiếp vào job dọn đất `2` dân / `60` phút của `EXPAND_LAND`.
- Cập nhật test tương ứng: `__tests__/core/landExpansion.test.ts` & `__tests__/core/eraRules.test.ts`.

### Chặng D — Dân Làng Khởi Đầu (`Founder Villager`) & Đổi Tên Hang Trú Ẩn
- **Dân làng khởi đầu miễn phí (`SELECT_FOUNDER`):**
  - Thêm `SelectFounderPayload`, `CIV_INVALID_FOUNDER_PAYLOAD`, `CIV_FOUNDER_ALREADY_SELECTED`, `CIV_FOUNDER_NOT_SELECTED` (`src/types/{errors,messages}.ts`, `src/i18n/errorTranslator.ts`), `CivilizationCoordinator.selectFounder`, `MessageHandler`, và parity simulator trong `extensionClient.ts`.
  - Tạo `src/ui/components/civilization/FounderPickerModal.tsx` (`absolute inset-0 z-40` bên trong `CivilizationScreen.tsx`), buộc chọn `1` lần trong 3 vai trò (`crafter | elder | woodworker`). Miễn phí `0` Coin, `0` chỗ trong *Rock Shelter*, cộng `+1` thợ ngay lập tức (kích hoạt job pending nếu có), tính vào công thức giá tuyển thêm `Math.round(25 × 1.35^totalCount)`, và hiển thị qua `getEffectiveVillagersForDisplay` trên cả `MapGridView` lẫn `FocusSceneArea`.
- **Đổi tên hiển thị Hang (`stone_age_study_cave`):** Đổi toàn bộ nhãn giao diện, thông báo lỗi & tài liệu người dùng từ `"Meditation Cave"` / `"Hang Thiền định"` sang **`"Rock Shelter"`** / **`"Hang trú ẩn"`** (giữ nguyên ID `stone_age_study_cave`).
- Kiểm thử Chặng D: `__tests__/background/founderSelection.test.ts` + cập nhật `civilizationView.test.ts`, `fullBilingual.test.ts`, `spriteRegistry.test.ts`, `villagerMapUi.test.ts`.

### Chặng E — Mô Hình Kinh Tế 5E-1, Tài Liệu & Kiểm Định Toàn Repo
- Nâng cấp `__tests__/core/economyBalance.test.ts`:
  - `simulateStoneToBronzeProgression5E1` chạy thật với Founder Villager, `assignJobsFifo`, `advanceJobs(civState, mins * 60)`, `GridMap` đặt công trình/mở rộng thật và đánh giá `evaluateEraAdvance` chỉ trên công trình + chunk đã hoàn thành.
  - Kết quả đo thực tế trên 7 hồ sơ (Founder `crafter`):
    - **`3h: 1×180m`**: **6 ngày** *(không buff: 9 ngày)*
    - **`3h: 3×60m` (tham chiếu)**: **7 ngày** *(không buff: 8 ngày)*
    - **`3h: 4×45m`**: **8 ngày** *(không buff: 9 ngày)*
    - **`2h: 1×120m`**: **9 ngày** *(không buff: 12 ngày)*
    - **`2h: 2×60m`**: **10 ngày** *(không buff: 12 ngày)*
    - **`1.5h: 2×45m`**: **14 ngày** *(không buff: 17 ngày)*
    - **`1h: 1×60m`**: **18 ngày** *(không buff: 23 ngày)*
  - Bổ sung Suite 5 kiểm tra Founder counts in roles (0 Cave slots), dãy mở rộng `[30, 40, 50, 60, 70, 80, 95, 110]`, và cô lập công trình/Hang đang xây.
- Đồng bộ đầy đủ `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md` và `docs/sprites/TILE_INDEX.md`.

---

## 3. Kết Quả Kiểm Định Tự Động Thực Tế

| Hạng mục kiểm định | Lệnh / Công cụ | Kết quả đo được | Ghi chú |
|---|---|---|---|
| **Typecheck & Lint (Node)** | `npm run lint` (`tsc --noEmit`) & `lint_applet` | **PASS (Exit 0 — `0` lỗi)** | Không lỗi TS/nhập thiếu trên toàn bộ `src/` và `__tests__/` |
| **Compile Applet** | `compile_applet` | **PASS** | Biên dịch sạch |
| **Test Suite (`npm test`)** | `tsx --test` (**3 lượt liên tiếp**) | **`715 / 715 PASS` (`0` fail, `0` skipped)** | 3/3 lượt xanh hoàn toàn (~37s/lượt) |
| **Production Build** | `npm run clean && npm run build` | **PASS (`30` tệp, `1,423,416 B`)** | **`0` tệp audio**, không có `public/assets/aistudio` |
| **Artifacts chính trong `dist/`** | Vite 8 MV3 build | `popup-*.js`: `902.95 kB` · `popup-*.css`: `101.67 kB` · `questEngine-*.js`: `173.50 kB` · `background.js`: `120.40 kB` · `translator-*.js`: `83.75 kB` · `offscreen.js`: `3.88 kB` · `blocked.js`: `1.32 kB` | MV3 CSP-safe |
| **Parity EN/VI & ErrorCodes** | Static Guard (`i18nStaticGuard.test.ts`) | **`665 / 665` khóa (`100%`)** · **`122` ErrorCodes** | Dịch đầy đủ EN/VI, 0 khóa mồ côi |

---

## 4. Bảng Kiểm Bất Biến Kinh Tế & Kiến Trúc 5E-1

- [x] **Zero Passive Income & Đồng hồ hệ thống:** Tuyệt đối không có thu nhập thụ động hay tiến độ công trình chạy nền; `advanceJobs` chỉ cộng tiến độ theo **số nguyên giây Focus** của phiên `COMPLETED` hợp lệ (`Give Up`, `INTERRUPTED` và thời gian Break không đẩy tiến độ).
- [x] **Chiếu `1s` UI tách biệt Storage:** `projectJobs` / `jobProjection.ts` không ghi storage và không làm thay đổi thưởng Coins/XP đang quyết toán.
- [x] **Mở đất cấp số cộng & Đội thợ FIFO:** Chi phí `[30, 40, 50, 60, 70, 80, 95, 110, ...]` (`k=20 → 355`), `Player Level >= k + 2`, giảm giá Woodworker `-5%.. -40%`, tối đa `4` việc `ACTIVE` đồng thời theo thứ tự FIFO.
- [x] **Dân làng khởi đầu & Đổi tên Hang:** `Founder Villager` chọn 1 lần (`0` Coin, `0` slot Hang), tính vào đội xây dựng + tuyển dân `25×1.35^n`; tên hiển thị dùng `"Rock Shelter"` / `"Hang trú ẩn"` (giữ nguyên ID `stone_age_study_cave`), giữ nguyên `era = 'STONE_AGE'` (`5C-2` chưa kích hoạt), giữ nguyên `manifest.json`.

---

## 5. Checklist Kiểm Chứng Thủ Công Trên Chrome (`>= 116`) *(Chờ Thực Hiện)*

1. Mở `chrome://extensions/` → Bật Developer mode → **Load unpacked** (hoặc Reload) thư mục `dist/`.
2. Mở Popup tab **Map** lần đầu (khi chưa chọn Founder): kiểm tra `FounderPickerModal` hiện 3 vai trò với sprite pixel & cảnh báo chọn cố định; chọn 1 vai trò và xác nhận dân làng xuất hiện ngay trên bản đồ + thanh đếm dân/buff cập nhật.
3. Đặt **Campfire** (`0s` — xong tức thì) rồi đặt **Foraging Post** hoặc **Rock Shelter** (`1` dân, `60m`): kiểm tra sprite khung dựng 4 giai đoạn, huy hiệu đồng hồ `clock_tiles_16.png` (`CLOCK`/`HOURGLASS`) + đếm ngược `MM:SS`, thử nâng/xếp hàng & nút hủy (`100%` trước khi chạy / `50%` sau khi chạy Focus).
4. Hoàn thành một phiên Focus ngắn và kiểm tra: tiến độ xây/dọn đất giảm đúng theo giây Focus thực tế, `FocusSceneArea` ẩn công trình chưa xây xong và hiển thị Founder Villager, thông báo lỗi/chi tiết hiển thị `"Rock Shelter"` / `"Hang trú ẩn"` đúng ngôn ngữ EN/VI.
5. Kiểm tra bảng mở đất (`LandExpansionModal` & `ClearingChunkModal`) hiển thị giá khởi đầu `30` Coins (giảm theo Woodworker nếu có) + yêu cầu `2` dân / `60m`.

DỪNG — CHỜ DUYỆT MILESTONE 5E-1.
