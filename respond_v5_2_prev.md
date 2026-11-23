# BÁO CÁO NGHIỆM THU — MILESTONE CLEANUP-1
**Dự án:** Focus Quest (Chrome MV3 Extension)  
**Ngày hoàn tất:** 2026-11-22  
**Trạng thái:** **HOÀN TẤT MILESTONE CLEANUP-1 — `693 / 693` TESTS PASS (`0` FAIL) 3/3 LƯỢT | `npm run lint` (`0` LỖI) | BUILD PASS (`29` TỆP, `0` FILE AUDIO) — Chưa kiểm chứng trên Chrome thật — DỪNG CHỜ DUYỆT**

> **Sao lưu báo cáo cũ:** Bản `respond.md` trước CLEANUP-1 (báo cáo Milestone Villager V5) đã được sao lưu nguyên vẹn tại `/respond_cleanup1_prev.md`, đồng thời giữ nguyên toàn bộ các tệp `respond_*_prev.md` khác.

---

## 1. Chặng 0 — Kiểm toán 9 Test Fail, 1 Lỗi TypeScript & Truy vết Milestone

*(Lưu ý: Workspace không có thư mục `.git`, do đó quá trình truy vết được thực hiện bằng đối chiếu trực tiếp mã nguồn với lịch sử báo cáo `respond_*_prev.md` và `PRODUCT_SPEC.md` `v1.8.0-synced`.)*

| # | Tệp kiểm thử / Mã nguồn lỗi | Triệu chứng trước CLEANUP-1 | Milestone phát sinh & Nguyên nhân gốc | Phân loại |
|---:|---|---|---|---|
| 1 | `src/ui/components/Header.tsx(132,22)` + `__tests__/ui/lofi2MusicUi.test.ts:339` | `npm run lint` lỗi `TS2345`: argument `"header.levelShort"` không thuộc `TranslationKey`; test #574 fail vì `Header` render literal key `"header.levelShort"` thay vì `"Lv. 7"`. | `Header.tsx` và `lofi2MusicUi.test.ts` dùng khóa `'header.levelShort'`, nhưng khóa này bị thiếu trong `EN_MESSAGES`/`VI_MESSAGES` (và từ điển chưa từng có guard kiểm tra khóa gọi trong `t(...)`). | **(a) Lỗi mã nguồn / từ điển** |
| 2 | `__tests__/ui/i18nStaticGuard.test.ts:28` (`civ.details.effectCaveSupport`) | Test #567 fail vì placeholder mismatch giữa EN (`['capacity', 'capacity']`) và VI (`['capacity']`). | Xuất hiện ở **Villager V2** (`en.ts` viết lặp `({capacity} max · ...)` trong `'Houses up to {capacity} villagers ({capacity} max · zero passive income · no bonus multipliers).'`), trong khi `vi.ts` chỉ dùng `{capacity}` 1 lần. | **(a) Lỗi mã nguồn / từ điển** |
| 3 | `__tests__/ui/i18nStaticGuard.test.ts:76` (`MapGridView.tsx`) | Test #569 fail ở `assert.equal(/Lv\.\{/.test(mapSrc), false)`. | `src/ui/components/civilization/MapGridView.tsx` dòng `952` và `965` dùng chuỗi hardcode `Lv.{inst.level}` từ **Giai đoạn 5C-1** (`respond_villager_prev.md` mục 12) trước khi `i18nStaticGuard.test.ts` được bổ sung để bắt chuỗi hardcode. | **(a) Lỗi mã nguồn / từ điển** |
| 4 | `__tests__/ui/i18nStaticGuard.test.ts:94` | Kiểm tra tĩnh yêu cầu `RewardHelpModal.tsx` chứa `SESSION_MULTIPLIER_TIERS`. | Từ **Giai đoạn 6+7** (`respond_ux6_prev.md`), `RewardHelpModal.tsx` đã chuyển sang dùng `MultiplierRules.getSessionMultiplier(...)` theo kiến trúc chuẩn. | **(b) Test lỗi thời so với spec đã duyệt** |
| 5 | `__tests__/ui/rewardHelpModal.test.ts:67` | Test #600 fail khi tìm chuỗi copy cũ (`'(1 + CoinBonus)'`, `'boosts Coins only (never XP)'`, `'at most 2 decimals'`, `'Give Up or Interrupted = 0 Coins, 0 XP'`, `'flat manual claim rewards'`, và các cụm VI cũ). | Copy trong `en.ts`/`vi.ts` đã được chuẩn hóa ở **Giai đoạn 6+7** (`respond_ux6_prev.md` — `help.coinBonusBody`, `help.precisionRule`, `help.settlementCountdownRule`, `help.questsFlatRule`), nhưng test cũ từ các giai đoạn đầu chưa cập nhật theo copy mới. | **(b) Test lỗi thời so với spec đã duyệt** |
| 6 | `__tests__/ui/ux2PomodoroOutcomeDisplay.test.ts:283` | Test #652 fail khi mong đợi `timer.outcome.endedInterruptedDesc` cho `POMODORO_STOPWATCH` bị `INTERRUPTED` bởi `EXTENSION_DISABLED`/`EXTENSION_RELOADED`. | **Backlog 4a** ở **Giai đoạn 6+7** (`PRODUCT_SPEC.md` §9 dòng 166 & `respond_ux6_prev.md` mục 1.3) đã duyệt rõ: `POMODORO_STOPWATCH` khi bị `EXTENSION_DISABLED`/`EXTENSION_RELOADED` bị hủy toàn bộ thưởng (`+0`) và hiển thị mô tả chuyên biệt `timer.outcome.pomoStopwatchInterruptedForfeitedDesc`. | **(b) Test lỗi thời so với spec đã duyệt** |
| 7–10 | `__tests__/background/errorCodesAndTranslator.test.ts` (4 tests `#58..61` + ~16 lỗi TS) | Fail cả 4 test và lỗi `tsc`: import `CodedError`, `translateErrorCode`, `PROFILE_CANNOT_DELETE_LAST`, `INVALID_COUNTDOWN_DURATION`, và truyền object `{ locale, rawError }` vào `localizeErrorMessage`. | Tệp test này viết cho bản nháp trước khi **Giai đoạn 6+7** (`respond_ux6_prev.md` §1.1) chốt API chuẩn trong `src/types/errors.ts` (`AppError`, `ErrorCode`, `ErrorParams`) và `src/i18n/errorTranslator.ts` (`ALL_KNOWN_ERROR_CODES`, `localizeErrorMessage(locale, rawError, errorCode, errorParams)`, `toUiErrorPayload`). | **(b) Test lỗi thời so với spec đã duyệt** *(kèm phát hiện bug thật ở `errorTranslator.ts:631`)* |

- **Ghi chú về tệp nháp `src/i18n/errorCodes.ts`:** Giữ nguyên không xóa vì `src/core/timer/timerStateMachine.ts:2` vẫn đang import `ERROR_CODES`, `ErrorCode`, `ErrorParams` từ tệp đó (biên dịch sạch, `0` xung đột, nằm ngoài phạm vi sửa core logic của CLEANUP-1).

---

## 2. Chi tiết Các Thay đổi Theo Đúng Phân loại (a) vs (b)

### (a) Sửa lỗi Mã nguồn & Từ điển (`src/`)
1. **`src/i18n/locales/en.ts` & `src/i18n/locales/vi.ts` (`580` → `582` khóa parity 100%):**
   - Thêm `'header.levelShort': 'Lv. {level}'` ở cả `EN_MESSAGES` (`en.ts:31`) và `VI_MESSAGES` (`vi.ts:33`) → khắc phục lỗi `tsc` tại `Header.tsx:132` và test `lofi2MusicUi.test.ts:339`.
   - Thêm `'civ.map.buildingLevelBadge': 'Lv.{level}'` ở cả `EN_MESSAGES` (`en.ts:327`) và `VI_MESSAGES` (`vi.ts:329`).
   - Sửa `en.ts:368` (`'civ.details.effectCaveSupport'`): bỏ `({capacity} max · ...)` bị lặp thành `'Houses up to {capacity} villagers (zero passive income · no bonus multipliers).'` để khớp placeholder `['capacity']` của `VI_MESSAGES`.
2. **`src/ui/components/civilization/MapGridView.tsx` (dòng `952` & `965`):**
   - Thay cả 2 chỗ hardcode `Lv.{inst.level}` bằng `{t('civ.map.buildingLevelBadge', { level: inst.level })}`.
3. **`src/i18n/errorTranslator.ts` (dòng `631` — lỗi thật bắt được khi nâng cấp test ErrorCodes):**
   - Khi kiểm tra chuỗi thật `MessageHandler` → `CivilizationCoordinator.placeBuilding` (`src/background/civilizationCoordinator.ts:155`), coordinator ném `AppError('CIV_UNKNOWN_BUILDING_DEF', ..., { buildingId })`, trong khi simulator `src/ui/services/extensionClient.ts:1722` truyền `{ buildingDefinitionId }`. Trước đây dòng `631` chỉ đọc `str('buildingDefinitionId')` nên bỏ sót tham số khi đi qua background thật. Đã sửa thành `const defId = str('buildingDefinitionId') || str('buildingId');` (chỉ sửa tầng dịch hiển thị, không đổi giao thức hay logic).

### (b) Cập nhật Test Lỗi thời Theo `PRODUCT_SPEC.md` Đã duyệt (`__tests__/`)
*(Tuyệt đối không dùng `.skip`, không nới lỏng assertion làm mất phủ kiểm tra.)*
1. **`__tests__/ui/rewardHelpModal.test.ts` (dòng `67–73` & `93–100`):**
   - Cập nhật 7 assertion chuỗi EN & 7 assertion chuỗi VI theo đúng copy đã duyệt ở **Giai đoạn 6+7** (`help.coinBonusBody`, `help.precisionRule`, `help.settlementCountdownRule`, `help.questsFlatRule`), giữ nguyên 100% kiểm tra động `DEFAULT_REWARD_CONFIG`, `SESSION_MULTIPLIER_TIERS` và độ phủ đầy đủ của `RewardHelpModal` EN/VI (`Stage 6`).
2. **`__tests__/ui/ux2PomodoroOutcomeDisplay.test.ts` (dòng `280–316`):**
   - Cập nhật kiểm tra `POMODORO_STOPWATCH` `INTERRUPTED` với `EXTENSION_DISABLED` & `EXTENSION_RELOADED` từ `endedInterruptedDesc` sang `timer.outcome.pomoStopwatchInterruptedForfeitedDesc` (EN & VI) khớp **Backlog 4a** / **`PRODUCT_SPEC.md` §9**.
   - Bổ sung case `BROWSER_CLOSED` với `0` focus interval hoàn thành để vẫn giữ nguyên độ phủ khẳng định `timer.outcome.endedInterruptedDesc` (EN & VI).
3. **`__tests__/background/errorCodesAndTranslator.test.ts` (viết lại trên API chuẩn `src/types/errors.ts` + `src/i18n/errorTranslator.ts`):**
   - Giữ đủ 4 test ở độ chặt tối đa: (1) quét toàn bộ `113` mã `ALL_KNOWN_ERROR_CODES` trong EN/VI không rỗng và không rơi về fallback chung (trừ `ACTION_FAILED`), (2) nội suy tham số `buildingDefinitionId` lẫn `buildingId` cho `CIV_UNKNOWN_BUILDING_DEF` & `QUEST_NOT_COMPLETED`, (3) lọc stack trace `TypeError`/`ReferenceError`/`SyntaxError` + dịch `AppError('PROFILE_DELETE_LAST')`, (4) kiểm tra tích hợp thật `MessageHandler` + `SessionCoordinator` + `CivilizationCoordinator` (`PROFILE_DELETE_LAST`, `INVALID_TARGET_MINUTES`, `CIV_UNKNOWN_BUILDING_DEF` với `{ buildingId }`, `UNKNOWN_ACTION`).
4. **`__tests__/ui/i18nStaticGuard.test.ts` (dòng `94`):**
   - Cập nhật dòng `94` thành `assert.ok(helpSrc.includes('SESSION_MULTIPLIER_TIERS') || helpSrc.includes('MultiplierRules'))` cho khớp `RewardHelpModal.tsx` dùng `MultiplierRules.getSessionMultiplier`.

---

## 3. Rào chắn Chống Tái diễn (`i18n Static Key-Usage Guard`) & Quy chuẩn Mới

1. **Test tĩnh mới trong `__tests__/ui/i18nStaticGuard.test.ts` (dòng `104–223` — nâng tổng test repo từ `692` → `693`):**
   - Quét toàn bộ tệp `src/**/*.{ts,tsx}` (trừ `SpriteGallery.tsx`).
   - Xác minh mọi lệnh gọi tĩnh `t('...')` và `translate(locale, '...')` đều tồn tại đồng thời trong cả `EN_MESSAGES` và `VI_MESSAGES`.
   - Kiểm tra nhóm template/danh mục động theo nguồn chân lý domain: `civ.villager.role.${role}` qua `VILLAGER_ROLES`, `eras.*` & `header.eraShort.*` qua `CIVILIZATION_ERAS`, `buildings.<id>.*` qua `getAllBuildingDefinitions()`, `quests.*` qua `ALL_QUEST_DEFINITIONS`, và `stats.monthShort.1..12`.
   - Chặn mọi biểu thức `t(...)` động lạ không nằm trong `ALLOWED_DYNAMIC_T_EXPRESSIONS` để tránh lọt lỗi về sau.
2. **Tự kiểm thử Rào chắn (Self-Verification bắt buộc):**
   - Thử nghiệm tạm gỡ `'header.levelShort'` khỏi `src/i18n/locales/en.ts` và `vi.ts`, rồi chạy `npx tsx --test __tests__/ui/i18nStaticGuard.test.ts`: Test 5 **FAIL ngay lập tức** với thông báo chính xác `src/ui/components/Header.tsx:132 -> 'header.levelShort' (en=false, vi=false)`.
   - Khôi phục `'header.levelShort'` ở cả hai từ điển và chạy lại: **`5 / 5` PASS**.
3. **Quy chuẩn vận hành từ sau CLEANUP-1:** Ghi nhận trong `PROJECT_STATUS.md` yêu cầu mọi báo cáo milestone tương lai bắt buộc đạt **`npm run lint` = `0` lỗi** và **`npm test` = `0` fail**.

---

## 4. Cam kết Bảo toàn Bất biến

- **Không thay đổi** công thức tính thưởng, `RewardEngine`, `MultiplierRules`, giá công trình, chi phí mở rộng đất, buff dân làng, luật Era (`eraRules.ts`), dữ liệu mô phỏng kinh tế, hay trạng thái `era = 'STONE_AGE'`.
- **Không thay đổi** schema lưu trữ (`CURRENT_SCHEMA_VERSION = 4`), `fq_civilization`, `fq_quests`, giao thức tin nhắn extension (`MessageResponse` / actions), hay tệp `PRODUCT_SPEC.md`.

---

## 5. Kết quả Kiểm định Thực tế (Chạy sau khi hoàn tất toàn bộ Mã nguồn & Tài liệu)

| Hạng mục | Lệnh thực tế | Kết quả | Chi tiết đo được |
|---|---|---|---|
| **Typecheck (`tsc`)** | `npm run lint` (`tsc --noEmit`) | **PASS (Exit 0)** | **`0` lỗi TypeScript** trên toàn bộ `src/` và `__tests__/` |
| **Full Suite — Lượt 1** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`25,115.31 ms`** |
| **Full Suite — Lượt 2** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`24,121.73 ms`** |
| **Full Suite — Lượt 3** | `npm test` | **PASS (Exit 0)** | **`693 / 693` PASS** (`0` fail, `0` skipped) · **`24,732.13 ms`** |
| **Production Build** | `npm run clean && npm run build` | **PASS (Exit 0)** | Vite `v8.3.8`, `1,765` modules transformed trong **`958ms`**; `dist/` có **`29` tệp (`1,309,901 B`)**, **`0` file audio** (`.mp3/.ogg/.wav/.m4a/.flac`) |
| **i18n EN/VI Parity** | Kiểm tra `EN_MESSAGES` / `VI_MESSAGES` | **582 / 582 khóa** | Parity 100% khóa & placeholder; `0` lỗi hardcoded `aria-label`/`title`/`placeholder` |

**Chi tiết chunk chính trong `dist/` sau build sạch:**
- `dist/index.html`: `1.37 kB` (gzip: `0.49 kB`)
- `dist/background.js`: `112.25 kB` (gzip: `25.35 kB`)
- `dist/offscreen.js`: `3.87 kB` (gzip: `1.48 kB`)
- `dist/blocked.js`: `1.32 kB` (gzip: `0.60 kB`)
- `dist/assets/popup-DvAxlcqV.js`: `858.82 kB` (gzip: `217.23 kB`)
- `dist/assets/popup-CAdNM5Ro.css`: `96.68 kB` (gzip: `14.74 kB`)
- `dist/assets/questEngine-az4OSDqy.js`: `129.02 kB` (gzip: `37.65 kB`)
- `dist/assets/translator-BqVD4RpM.js`: `73.00 kB` (gzip: `21.60 kB`)
- `dist/assets/storageKeys-C4hhw6ET.js`: `0.39 kB` (gzip: `0.27 kB`)

---

## 6. Tài liệu Đã Đồng bộ & Tình trạng Kiểm thử Chrome Thật

- **Tài liệu đã cập nhật:**
  - `PROJECT_STATUS.md` (cập nhật trạng thái Milestone CLEANUP-1, phân loại sửa lỗi, rào chắn tĩnh `i18n`, quy tắc `npm run lint` = 0 lỗi & `693/693 PASS`).
  - `ARCHITECTURE.md` (v`1.12.1` — cập nhật `errorTranslator.ts` `buildingDefinitionId || buildingId`, `582` khóa i18n parity & static key-usage guard).
  - `README.md` (cập nhật `693/693 PASS`, `0` TypeScript errors, `582` khóa i18n).
  - `/respond_cleanup1_prev.md` (sao lưu báo cáo Villager V5; giữ nguyên mọi `respond_*_prev.md` khác; không chỉnh sửa `PRODUCT_SPEC.md`).
- **Trạng thái kiểm thử trình duyệt:** **Chưa kiểm chứng trên Chrome thật** *(mới xác minh qua Node.js CLI, React SSR, `tsc --noEmit` và Vite build)*. Khi duyệt, vui lòng tải lại thư mục `dist/` ở `chrome://extensions` và kiểm tra nhanh:
  1. Badge cấp độ trên `Header.tsx` hiển thị `Lv. X` bình thường trên cả EN & VI (không hiện `header.levelShort`).
  2. Công trình trên `MapGridView` hiển thị `Lv.X` bình thường ở cả EN & VI.
  3. Mở **Help `?`** kiểm tra bảng hướng dẫn thưởng/buff dân làng hiển thị trọn vẹn EN & VI; thử đặt 1 công trình ID không tồn tại qua message/simulator kiểm tra thông báo lỗi `CIV_UNKNOWN_BUILDING_DEF` hiển thị đúng ID công trình.

---

DỪNG — CHỜ DUYỆT MILESTONE CLEANUP-1.
