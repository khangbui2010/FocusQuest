# BÁO CÁO NGHIỆM THU — MILESTONE 5C — GIAI ĐOẠN 5C-2a: ERA ADVANCE (`STONE → BRONZE`) ENGINE & GIAO DIỆN (CÔNG TẮC TẮT MẶC ĐỊNH)

> **Lưu trữ báo cáo cũ:** Bản báo cáo **Milestone 5C-2b** trước đó đã được sao lưu nguyên vẹn từng byte tại `respond_5c2a_prev.md` (`cmp -s` PASS); mọi tệp `respond_*_prev.md` khác trong repo được giữ nguyên vẹn.
>
> **Trạng thái nghiệm thu:** Đã hoàn tất trọn vẹn **Milestone 5C — Giai đoạn 5C-2a**: triển khai đầy đủ engine thuần, coordinator, giao dịch Storage 2 khóa dưới `StorageMutex`, giao thức message, 5 mã lỗi `ERA_*`, simulator parity, 34 khóa song ngữ EN/VI, và giao diện `EraAdvanceModal` + badge Era tương tác trên `CivilizationHeader`, đồng thời giữ **công tắc phát hành `ERA_ADVANCE_ENABLED = false` mặc định**, giữ nguyên danh mục Stone Age (`6` công trình, `3` vai trò dân làng), và vượt qua toàn bộ kiểm định (**`npm run lint` = `0` lỗi**, **`npm run clean && npm run build` = PASS** với **`34` tệp / `1,369,518 B`**, **`npm test` = `780 / 780 PASS` qua `3/3` lượt chạy liên tiếp**).

---

## 1. Đối Chiếu Mã Nguồn Hiện Tại (Bước 0 References)

- **Luật Era & Giới hạn danh mục:**
  - `src/core/civilization/constants.ts:51` (`ERA_ADVANCE_ENABLED = false`)
  - `src/core/civilization/eraRules.ts:74-97` (`STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`, `ERA_ADVANCE_REQUIREMENTS_BY_ERA`) & `:231` (`evaluateEraAdvance`)
  - `src/core/civilization/buildingCatalog.ts:20` (`STONE_AGE_BUILDING_DEFINITIONS` — giữ nguyên `6` công trình Đồ Đá, chưa thêm Bronze Age)
  - `src/core/civilization/villager.ts` (`VILLAGER_ROLES` — giữ nguyên `['elder', 'crafter', 'woodworker']`, chưa thêm dân làng Bronze)
  - `src/core/awards/awardsEngine.ts:135` (sử dụng `evaluateEraAdvance` cho thành tựu `era_ready`, giữ nguyên)
  - `src/dev/devStateHelpers.ts:491-614` (sử dụng `STONE_TO_BRONZE_ADVANCE_REQUIREMENTS`, `evaluateEraAdvance`, `VILLAGER_ROLES`, giữ nguyên)
- **Storage, Coordinator & Giao thức:**
  - `src/storage/migrations/migrationRunner.ts:12` (`CURRENT_SCHEMA_VERSION = 7`, giữ nguyên)
  - `src/storage/storageManager.ts:687, 741, 746, 958` (`executeCivilizationTransaction` + `skipAwardsEvaluation`)
  - `src/background/civilizationCoordinator.ts:107-111, 1114-1277` (`options.allowEraAdvance`, `isEraAdvanceEnabled`, `getEraAdvanceStatus`, `advanceEra`)
  - `src/background/messageHandler.ts:537-564` (`GET_ERA_ADVANCE_STATUS`, `ADVANCE_ERA`)
  - `src/ui/services/extensionClient.ts:490, 2869-2987, 3537-3552` (`mockEraAdvanceEnabledForTest = false`, `setMockEraAdvanceEnabledForTest`, simulator + client API)
- **UI & Header:**
  - `src/ui/components/Header.tsx:28-35, 64` (đọc `era` và hiển thị qua `ERAS_TRANSLATION_KEYS`)
  - `src/ui/components/civilization/CivilizationHeader.tsx:25-26, 53-80` (`civ-era-badge-btn`, `civ-era-ready-dot`)
  - `src/ui/components/civilization/EraAdvanceModal.tsx:28-43` (modal `role="dialog"`)
  - `src/ui/components/civilization/CivilizationScreen.tsx:358, 373, 846-865, 1008-1009, 1153` (nối status, submit & gọi `onStateMutated()` làm mới `Header.tsx`)

---

## 2. Tóm Tắt Thay Đổi & Tuân Thủ Phạm Vi 5C-2a

1. **Công tắc an toàn mặc định TẮT (`ERA_ADVANCE_ENABLED = false`):**
   - `src/core/civilization/constants.ts` xuất `ERA_ADVANCE_ENABLED = false`.
   - `src/background/index.ts` giữ nguyên khởi tạo mặc định `new CivilizationCoordinator(storageManager)` (không truyền `{ allowEraAdvance: true }`), nên bản extension chạy thật (`dist/`) luôn trả `ERA_ADVANCE_DISABLED` khi gọi `ADVANCE_ERA`.
   - `CivilizationCoordinator` chỉ cho phép bật trong unit/integration test qua `new CivilizationCoordinator(storage, { allowEraAdvance: true })`; simulator `extensionClient.ts` mặc định `mockEraAdvanceEnabledForTest = false` và chỉ bật qua `setMockEraAdvanceEnabledForTest(true)` trong test. Không rò rỉ `DEV_*`, `GOD_MODE`, hay `jsxDEV` vào `src/` production hay `dist/`.
2. **Engine thuần & Giao dịch nguyên tử 2 khóa:**
   - `eraRules.ts` bổ sung `getNextEra(era)` và `applyEraAdvance(state, fromEra, targetEra)` thuần túy chỉ cập nhật `era` (chưa áp dụng `entryFloor` hay thay đổi level/công trình — thuộc `5C-2c`).
   - `storageManager.ts` thêm `skipAwardsEvaluation?: boolean` trên `CivilizationTransactionOutcome<T>` để `advanceEra` chỉ ghi nghiêm ngặt đúng 2 khóa `['fq_civilization', 'fq_economy']` dưới `StorageMutex` (trừ `feeCoins` bằng số học IEEE-754 chuẩn xác + rollback compensation nếu lỗi ghi).
   - Khi chỉ thiếu Focus Coins (mọi điều kiện khác đã đạt), coordinator và simulator trả `CIV_INSUFFICIENT_BUILDING_COINS` với `{ eraName, buildingName, cost, balance }` để `errorTranslator.ts` hiển thị đúng tên Era mục tiêu (`params?.eraName`).
3. **Giao thức, i18n (`790` khóa / `136` ErrorCodes) & UI popup `400px`:**
   - Bổ sung 5 mã lỗi `ERA_*` (`ERA_ADVANCE_DISABLED`, `ERA_REQUIREMENTS_NOT_MET`, `ERA_ALREADY_ADVANCED`, `ERA_FROM_MISMATCH`, `ERA_TARGET_INVALID`) nâng tổng `ALL_KNOWN_ERROR_CODES` từ `131` lên **`136`**.
   - Bổ sung 34 khóa EN/VI (`civ.header.eraBadgeAria`, `civ.header.eraBadgeTitle`, và 32 khóa `civ.era.*`) nâng tổng từ điển EN/VI parity 100% từ `756` lên **`790`** khóa (`vi.ts` dùng đúng `'Thời đại Đồ Đá'` / `'Thời đại Đồ Đồng'`).
   - `CivilizationHeader` thay nhãn Era tĩnh bằng `<button data-testid="civ-era-badge-btn">` kèm chấm sẵn sàng `civ-era-ready-dot` (chỉ sáng khi switch ON và `eligible`).
   - `EraAdvanceModal` (`max-w-[356px] max-h-[520px]`) hỗ trợ Esc & click backdrop đóng khi không submitting, focus trap + initial focus, khóa bấm đúp `isConfirmInFlightRef`, banner báo khóa công tắc OFF, checklist điều kiện với icon non-hue-only + badge `Met`/`Unmet` (`Đạt`/`Chưa đạt`) + `role="progressbar"`, panel xác nhận 2 bước vĩnh viễn (`-{feeCoins} Coins`), banner lỗi `role="alert"`, banner chúc mừng `"Welcome to the Bronze Age!"` / `"Chào mừng đến Thời đại Đồ Đồng!"`, và trạng thái đã lên Bronze Age (`"Iron Age: coming later"` / `"Thời đại Đồ Sắt: sẽ có sau"`, không có nút lên tiếp). Khi chuyển Era thành công, `CivilizationScreen` gọi `await Promise.all([refreshEraAdvanceStatus(), onStateMutated?.()])` để badge Era trên `Header.tsx` cập nhật ngay lập tức.

---

## 3. Danh Sách Tệp Tạo Mới & Sửa Đổi

### Tệp mã nguồn sản phẩm (`src/`)
- **Tạo mới (1):** `src/ui/components/civilization/EraAdvanceModal.tsx`
- **Sửa đổi (13):**
  - `src/core/civilization/constants.ts`
  - `src/core/civilization/eraRules.ts`
  - `src/types/errors.ts`
  - `src/types/messages.ts`
  - `src/i18n/errorTranslator.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/vi.ts`
  - `src/storage/storageManager.ts`
  - `src/background/civilizationCoordinator.ts`
  - `src/background/messageHandler.ts`
  - `src/ui/services/extensionClient.ts`
  - `src/ui/components/civilization/CivilizationHeader.tsx`
  - `src/ui/components/civilization/CivilizationScreen.tsx`
  *(Tổng: 1 tệp mới + 13 tệp sản phẩm sửa đổi; giữ nguyên hoàn toàn `buildingCatalog.ts`, `villager.ts`, `RewardEngine`, `QuestCoordinator`, `AwardsEngine`, `MigrationRunner`, và `src/background/index.ts`.)*

### Tệp kiểm thử (`__tests__/`)
- **Tạo mới (2):**
  - `__tests__/background/eraAdvance5c2a.test.ts` (`5` tests)
  - `__tests__/ui/eraAdvanceUi5c2a.test.ts` (`4` tests)
- **Sửa đổi test hiện có (2 — bổ sung tham số mẫu cho 5 mã lỗi `ERA_*` mới):**
  - `__tests__/background/errorCodesAndTranslator.test.ts`
  - `__tests__/ui/fullBilingual.test.ts`

### Tài liệu & Báo cáo
- **Tạo mới (1):** `respond_5c2a_prev.md` (sao lưu báo cáo `5C-2b`)
- **Sửa đổi (5):** `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `PROJECT_STATUS.md`, `README.md`, `respond.md`

---

## 4. Kết Quả Kiểm Định Toàn Repo Sau Chỉnh Sửa Cuối

### 4.1. Typecheck & Production Build (`dist/` trước vs sau `5C-2a`)

| Hạng mục | Trước `5C-2a` (Baseline `5C-2b`) | Sau `5C-2a` (Thực tế đo được) | Ghi chú |
|---|---|---|---|
| **Typecheck (`npm run lint`)** | `0` lỗi | **PASS (`0` lỗi TypeScript)** | `tsc --noEmit` trên toàn bộ `src/` & `__tests__/` |
| **Build (`npm run clean && npm run build`)** | **PASS (`34` tệp, `1,341,836 B`)** | **PASS (`34` tệp, `1,369,518 B`)** | `+27,682 B` tổng `dist/` |
| **`dist/background.js`** | `127,271 B` | **`130,945 B`** | `+3,674 B` (`ERA_ADVANCE_ENABLED = false` giữ nguyên) |
| **`dist/assets/popup-*.js`** | `681,639 B` (`popup-B5OhcyBt.js`) | **`699,973 B`** (`popup-lNZD4SPK.js`) | `+18,334 B` |
| **`dist/assets/popup-*.css`** | `118,793 B` | **`120,875 B`** (`popup-CYID-3Qq.css`) | `+2,082 B` |
| **Kiểm tra sạch `dist/`** | `0` leak | **PASS (`0` hits)** | `0` `DEV_*` (trừ `DEV_SERVER_MOCK_LIMITS` ngoài scope), `0` `GOD_MODE`, `0` `jsxDEV` |

### 4.2. Toàn Bộ Bộ Kiểm Thử (`npm test` — `3` lượt chạy liên tiếp)

| Lượt chạy | Kết quả (`tests / pass / fail / skipped`) | Thời lượng (`duration_ms`) |
|---|---|---|
| **Run 1** | **`780 / 780 PASS` (`0` fail, `0` skipped)** | `36,637.67 ms` |
| **Run 2** | **`780 / 780 PASS` (`0` fail, `0` skipped)** | `36,530.26 ms` |
| **Run 3** | **`780 / 780 PASS` (`0` fail, `0` skipped)** | `36,857.72 ms` |

> **Phạm vi kiểm thử tự động:** Các bài kiểm thử chạy trên Node.js (`tsx --test`) bằng React SSR (`renderToString`), mock canvas 2D và mock Chrome storage/messaging adapters; **chưa chạy trực tiếp trong popup/Service Worker Chrome thật**.

---

## 5. Checklist Nghiệm Thu Thủ Công Trên Chrome Unpacked (`dist/`)

1. Mở `chrome://extensions/` → bật **Developer mode** → **Load unpacked** thư mục `dist/`.
2. Mở popup extension (tab mặc định `Map`), xác nhận badge Era **`Stone Age`** (`Thời đại Đồ Đá`) trên `CivilizationHeader` bấm được và mở `EraAdvanceModal` gọn trong khung `400×600px`.
3. Xác nhận `EraAdvanceModal` hiển thị **banner khóa tính năng / công tắc TẮT mặc định** (`ERA_ADVANCE_DISABLED`), danh sách 5 nhóm điều kiện kèm icon + nhãn `Met`/`Unmet` (`Đạt`/`Chưa đạt`) và thanh tiến độ, **không thể trừ Coin hoặc chuyển sang Bronze Age** trong bản build phát hành này.
4. Thử đóng modal bằng phím `Esc` hoặc click ra ngoài vùng modal, và đổi ngôn ngữ `EN | VI` trên `Header` để kiểm tra bản dịch đầy đủ không còn khóa thô.

**DỪNG — CHỜ DUYỆT MILESTONE 5C — GIAI ĐOẠN 5C-2a.**
