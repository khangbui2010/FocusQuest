# BÁO CÁO NGHIỆM THU CUỐI — MILESTONE 5B.5 / GIAI ĐOẠN 6 + 7

**Giai đoạn:** Milestone 5B.5 — Giai đoạn 6 + 7 *(Hoàn thiện i18n / Error Codes / `RewardHelpModal`, sửa Backlog 4a/4b, đồng bộ tài liệu & nghiệm thu đóng Milestone 5B.5)*  
**Ngày hoàn thành:** 2026-11-19  
**File sao lưu báo cáo cũ:** `/respond_phase67_prev.md` *(sao lưu nguyên vẹn báo cáo Giai đoạn 5c trước khi ghi đè; giữ nguyên toàn bộ các bản `respond_*_prev.md` trước đó)*  
**Trạng thái:** **`605 / 605` tests PASS 3/3 lần** | **`npm run lint` (`tsc --noEmit`) PASS (`0` errors)** | **`npm run clean && npm run build` PASS (`1,205,283 B` / `26` tệp)** — **DỪNG chờ duyệt đóng Milestone 5B.5**

---

## 1. PHẦN A — KẾT QUẢ HOÀN THIỆN MÃ NGUỒN, BACKLOG & KIỂM THỬ

### 1.1. Error Codes có cấu trúc (`src/types/errors.ts`, `src/types/messages.ts`, `src/i18n/errorTranslator.ts`)
- **Hợp đồng tin nhắn (`MessageResponse`):** Giữ nguyên `error?: string` tiếng Anh để tương thích ngược toàn bộ test/caller cũ, đồng thời chuẩn hóa `errorCode?: string` và `errorParams?: ErrorParams`.
- **Phân loại & Bản địa hóa (`98` `ErrorCode` + `4` mã playback legacy):**
  - Toàn bộ `98` mã trong `ALL_KNOWN_ERROR_CODES` (Transport, Session/Transition, Profile/Allowlist, Civilization, Settings, Music Player, Quests) cộng `4` mã Offscreen (`autoplay_blocked`, `network`, `decode`, `unknown`) đều có bản dịch EN/VI tự nhiên, không rò `undefined`/`NaN`, và đồng bộ kiểu TypeScript chặt across `civilizationCoordinator.ts`, `sessionCoordinator.ts`, `ProfileBottomSheet.tsx`, `CivilizationScreen.tsx`.
  - Vá xử lý tại `errorTranslator.ts:761-775` để `'network'` / `'unknown'` vẫn tôn trọng thông báo lỗi tải catalog cụ thể khi khớp `EXACT_VI_ERROR_MAP[rawFallback]` (`musicPlayerSheet.test.ts`).
  - Lỗi kỹ thuật / stack trace (`TypeError`, `ReferenceError`, dòng `at ...`) được làm sạch bằng `isTechnicalErrorString` về thông điệp an toàn cho người dùng (`"Something went wrong. Please try again."` / `"Đã xảy ra lỗi. Vui lòng thử lại."`).

### 1.2. `RewardHelpModal.tsx`, Notification Formatting & Parity Từ điển (`533` khóa)
- **`src/ui/components/RewardHelpModal.tsx`:** Ràng buộc động vào `DEFAULT_REWARD_CONFIG` (`1.5 / 5.0` Countdown, `1.0 / 3.0` Stopwatch, ngưỡng `5m`) và `MultiplierRules.getSessionMultiplier(...)` (`×1.0`..`×2.5`), sửa render `{`×${value}`}` để React SSR không chèn comment node `<!-- -->`. Đầy đủ mục `CoinBonus` + Zero Passive Income, Settlement/All-or-Nothing, Quests thưởng phẳng & độ chính xác số thực IEEE-754 trên cả EN & VI.
- **Thông báo Chrome 7 nhánh (`src/background/notificationFormatter.ts` + `__tests__/background/sessionNotifications.test.ts`):** Đã kiểm chứng trọn vẹn **7 nhánh** (`COUNTDOWN`, `STOPWATCH >= 5m`, `POMODORO_COUNTDOWN` 100%, `SHORT_BREAK`, `LONG_BREAK`, `BREAK_ENDED`, `POMODORO_STOPWATCH` break/finish) trong cả EN & VI, làm tròn hiển thị Coin/XP half-up tối đa 2 chữ số thập phân (`7.875 → 7.88` không hiện `7.875`) và tôn trọng `notificationsEnabled = false`.
- **Kiểm tra tĩnh & Parity (`__tests__/ui/fullBilingual.test.ts`):**
  - `EN_MESSAGES` và `VI_MESSAGES` đạt parity **`533 / 533` khóa** (`0` khóa thiếu, `0` chuỗi rỗng).
  - Quét tĩnh toàn bộ tệp `.tsx` trong `src/ui/` (loại trừ `SpriteGallery.tsx` vốn chỉ dùng ở `#sprites`): **`0` thuộc tính (`aria-label`, `title`, `placeholder`, `alt`) hardcode** và **`0` chuỗi văn bản JSX hardcode** (chỉ giữ 2 token ký hiệu có chủ ý `FQ` và `zZ`).

### 1.3. Sửa lỗi Thực tế Phát hiện Trong Quá trình Hoàn thiện (Backlog 4a & 4b)
1. **Backlog 4a — Lỗi hiển thị phần thưởng ở `POMODORO_STOPWATCH` bị tắt/tải lại extension (`src/core/reward/rewardPreview.ts`):**
   - *Nguyên nhân:* Khi `POMODORO_STOPWATCH` kết thúc với `status === 'INTERRUPTED'` và `interruptedReason` là `'EXTENSION_DISABLED'` hoặc `'EXTENSION_RELOADED'`, `SessionCoordinator` hủy toàn bộ thưởng (`0 Coins & 0 XP`) nhưng `getSessionRewardPreview` trước đó chỉ đọc `pomodoroState.accumulatedCoins/Xp` mà chưa kiểm tra `interruptedReason`.
   - *Khắc phục:* Thêm `interruptedReason?: SessionSnapshot['interruptedReason']` vào `SessionRewardPreviewInput` và truyền từ `getSessionRewardPreviewFromSnapshot`. Khi là `POMODORO_STOPWATCH` + `INTERRUPTED` + (`EXTENSION_DISABLED` | `EXTENSION_RELOADED`), trả về `{ coins: 0, xp: 0, eligibleMinutes: 0, isEligible: false }` (giữ nguyên hành vi bảo toàn reward khi `BROWSER_CLOSED` và `COMPLETED`). Xác nhận qua test mới tại `__tests__/ui/ux2PomodoroOutcomeDisplay.test.ts`.
2. **Backlog 4b — A11y cột biểu đồ `StatsBarChart.tsx` (`__tests__/ui/statsBarChart.test.ts:105`):**
   - Đã chuẩn hóa thẻ `<g role="img" tabIndex={0}>` trong `StatsBarChart.tsx` thay cho `role="button"` trước đây nhằm tránh ngữ nghĩa interactive lồng sai; **cập nhật 1 assertion test cũ tại `__tests__/ui/statsBarChart.test.ts:105`** sang `assert.equal(htmlVi.includes('role="button"'), false)` kèm `role="img"`. Đây là **test cũ duy nhất** được chỉnh assertion ngoài việc bổ sung các test Stage 6 / Backlog 4a mới.

---

## 2. PHẦN B — KIỂM TOÁN 8 BẤT BIẾN, ĐÓNG GÓI `dist/` & ĐỒNG BỘ TÀI LIỆU

### 2.1. Bảng Kiểm toán 8 Bất biến Hệ thống (Milestone 5B.5)

| # | Bất biến / Ràng buộc | Trạng thái | Bằng chứng xác minh trực tiếp trong mã nguồn & kiểm thử |
|---|---|---|---|
| 1 | **Zero Passive Income** | **PASS** | Không có timer/alarm tự sinh Coin/XP; Coins/XP chỉ cộng khi kết thúc Focus Session (`SessionCoordinator`) hoặc Claim Quest thủ công (`QuestCoordinator.claimQuestReward` qua `CLAIM_QUEST_REWARD`). Streak & Leaderboard/Civilization không sinh Coin thụ động (`statsViewUpgrade.test.ts`, `questEngine.test.ts`). |
| 2 | **All-or-Nothing (`Countdown` / `POMODORO_COUNTDOWN`)** | **PASS** | `Give Up` / `INTERRUPTED` luôn ghi `0` Coin, `0` XP, `0` tiến độ Quest (`toQuestOutcomeDelta` chỉ nhận `COMPLETED`) nhưng vẫn lưu `validMinutes` vào `fq_daily_stats`. `TimerView` & `getSessionRewardPreview` khớp 100% (`ux2PomodoroOutcomeDisplay.test.ts`, `questCoordinator.test.ts`). |
| 3 | **Allowlist Lock (`declarativeNetRequest`)** | **PASS** | Chặn duy nhất `resourceTypes: ['main_frame']` theo `activeProfile.allowedDomains`; `blocked.html` không có nút mở khóa tạm thời; `ProfileBottomSheet` & `ProfileManager` khóa chỉnh sửa profile/domain trong lúc `RUNNING`/`PAUSED`. |
| 4 | **Công thức thưởng, `CoinBonus` & IEEE-754 Precision** | **PASS** | `DEFAULT_REWARD_CONFIG` giữ nguyên (`1.5/5.0`, `1.0/3.0`, ngưỡng `5m`), `MultiplierRules` giữ `×1.0`..`×2.5`; `CoinBonus` chỉ nhân vào Coins (XP độc lập); storage giữ nguyên số thực IEEE-754 (`7.875 → 63.375`, `8 × 7.875 = 63` exact), UI/Notification mới làm tròn half-up tối đa 2 chữ số (`formatRewardAmount`, `ux4RewardDisplayAndFormatting.test.ts`). |
| 5 | **Schema v3 (`fq_quests`) & Rollback Safety** | **PASS** | `CURRENT_SCHEMA_VERSION = 3` (`migrationRunner.ts`, `v3_questsSchema.ts`); `commitSessionOutcomeInternal` & `commitQuestClaimInternal` thực thi trong `StorageMutex` + rollback compensation; Claim thưởng Quest chỉ vào `ECONOMY` (dùng `calculatePlayerLevel`), không ghi vào `fq_daily_stats`. |
| 6 | **Nút Upgrade `"Milestone 5C"` & Tab `Awards` `"Coming soon"`** | **PASS** | `Awards` giữ nguyên `awards-placeholder-view` (`Coming soon` / `Sắp ra mắt`); nút nâng cấp trong `BuildingDetailsModal` vẫn khóa ở nhãn `'Milestone 5C'`. Không có trang ẩn hay tính năng `5C` rò rỉ. |
| 7 | **`0` File Audio Cục bộ & `CREDITS.md` Chính xác** | **PASS** | Quét toàn bộ `public/` và `dist/`: **`0`** tệp audio (`.mp3/.ogg/.wav/.m4a/.flac/.aac/.opus`). `CREDITS.md` (nhạc GitHub Archive) & `public/assets/sprites/CREDITS.md` (Kenney CC0 + Stone Age sprites) khớp 100% tài sản thực tế (`musicPackaging.test.ts`). |
| 8 | **UX-5 Canvas Một Tấm & Thuật toán Rừng `M1–M6`** | **PASS** | `terrainDecor.ts` (`getCellDecor`, `TERRAIN_DECOR_SEED = 5202402`, 6 mẫu `M1–M6`) và `terrainBitmapRenderer.ts` / `TerrainBitmapCanvas.tsx` giữ nguyên 100%; `INITIAL_GRID_WIDTH/HEIGHT = 8`, `CHUNK_WIDTH/HEIGHT = 4` (`ux5TerrainBitmap.test.ts`, `terrainDecor.test.ts`). |

### 2.2. Kiểm tra Đóng gói Clean Build (`dist/`)
- **`npm run clean && npm run build`:** **PASS** — Vite `v8.3.8`, `1,754 modules transformed`, **`789ms`**.
- **Tổng số tệp & dung lượng `dist/`:** **`26` tệp**, tổng cộng **`1,205,283 B`** (**`0` file audio**):
  - `dist/background.js`: **`98,215 B`** (`98.21 kB`, gzip: `21.72 kB`)
  - `dist/assets/popup-Bl0ohACp.js`: **`846,554 B`** (`846.55 kB`, gzip: `217.75 kB`) *(chủ ý hoãn tách chunk ngoài phạm vi 5B.5)*
  - `dist/assets/popup-DcexGFhy.css`: **`91,821 B`** (`91.82 kB`, gzip: `14.18 kB`)
  - `dist/assets/questEngine-C4eZ1Cf9.js`: **`67,378 B`** (`67.37 kB`, gzip: `18.68 kB`)
  - `dist/assets/translator-CXd5AzTc.js`: **`65,741 B`** (`65.74 kB`, gzip: `18.39 kB`)
  - `dist/assets/storageKeys-C4hhw6ET.js`: **`398 B`** (`0.39 kB`, gzip: `0.27 kB`)
  - `dist/offscreen.js`: **`3,878 B`** (`3.87 kB`, gzip: `1.48 kB`) + `dist/offscreen.html`: **`264 B`**
  - `dist/blocked.js`: **`1,321 B`** (`1.32 kB`, gzip: `0.60 kB`) + `dist/blocked.html`: **`1,810 B`**
  - `dist/index.html`: **`712 B`** (`0.71 kB`, gzip: `0.39 kB`), `dist/manifest.json`: **`984 B`**
  - `dist/_locales/en/messages.json`: **`382 B`**, `dist/_locales/vi/messages.json`: **`440 B`**
  - `dist/icons/`: `icon16.png` (`749 B`), `icon32.png` (`1,283 B`), `icon48.png` (`1,751 B`), `icon128.png` (`4,517 B`), `icon.svg` (`874 B`)
  - `dist/assets/sprites/`: `CREDITS.md` (`4,262 B`), `kenney-tiny-town/*`, `kenney-tiny-dungeon/*`

### 2.3. Tài liệu đã Đồng bộ
- `/PRODUCT_SPEC.md` (`Version 1.5.0-synced`): cập nhật Giai đoạn 6+7, Backlog 4a ở §9, 7 nhánh Chrome Notification ở §11, parity 533 khóa & `98` ErrorCodes ở §12–§13.
- `/ARCHITECTURE.md` (`Version 1.8.0`): cập nhật `MessageResponse` (`errorCode`, `errorParams`), kiến trúc `AppError`/`errorTranslator`, `notificationFormatter`, `RewardHelpModal` động & `StatsBarChart` `<g role="img">`.
- `/PROJECT_STATUS.md`: đánh dấu Stage 5c **ĐÃ DUYỆT**, bổ sung chi tiết Stage 6+7, cập nhật số liệu build `1,205,283 B` / `605/605` tests 3x và phân định chính xác phạm vi đã/chưa nghiệm thu trên Chrome thật.
- `/README.md`: cập nhật `605/605 tests`, tóm tắt Stage 6+7, phạm vi kiểm chứng Chrome thật, và Roadmap tiếp theo (`Awards` & `Milestone 5C`).

---

## 3. KẾT QUẢ CHẠY LỆNH XÁC MINH CUỐI (SAU MỌI CHỈNH SỬA CODE & TÀI LIỆU)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (Exit code `0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (Exit code `0`, Vite `v8.3.8`, `1,754 modules transformed`, **`789ms`**).
- **`npm test` (`tsx --test`) — 3 lần chạy liên tiếp:**
  - **Lần 1:** **`605 / 605` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,973.72 ms`**)
  - **Lần 2:** **`605 / 605` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,590.95 ms`**)
  - **Lần 3:** **`605 / 605` PASS** (`0` fail, `0` skipped, `0` cancelled, **`17,680.29 ms`**)

---

## 4. RANH GIỚI KIỂM CHỨNG & CHECKLIST CHROME THẬT TRƯỚC KHI ĐÓNG 5B.5

- **Phạm vi kiểm chứng hiện tại:** Môi trường tự động chạy trên Node.js (`tsx --test`) với React SSR (`renderToString`), mock 2D canvas context và mock Chrome adapters. Theo xác nhận của người dùng, các luồng trước UX-5 (**popup `400×600` thanh 5 tab, bản đồ DOM/rừng/lớp tối, rìu chém, `blocked.html` DNR, `chrome.i18n`, `manifest.json`, Offscreen Audio kể cả Pause > 30s, fetch catalog nhạc**) đã được nghiệm thu thủ công trên Chrome thật. **Giai đoạn 5c (`QuestView`/`StatsView`), canvas `<TerrainBitmapCanvas>` của UX-5, Service Worker thực tế của Stage 2b, và thông báo/hộp thoại Stage 6+7 chưa được kiểm chứng trực quan trên Chrome thật.**
- **Checklist nghiệm thu cuối trên Chrome thật (`chrome://extensions` → Load unpacked `/dist`):**
  1. **UX-5 Canvas & Rừng tối:** Pan/zoom bản đồ ở các mức DPR (`125%`, `150%`) và mở rộng đất để xác nhận không còn khe sáng sub-pixel giữa các ô và animation rìu chém lật ô sạch sẽ.
  2. **Stage 2b + 5c (`Quests` & `Stats`):** Hoàn thành 1 phiên Focus → xác nhận Service Worker cộng `fq_quests`, huy hiệu `Navbar` nhảy số, bấm `Claim` cộng đúng Coins/XP vào Header mà không cộng vào `Focus Coins` của `StatsView`, kiểm tra `Day | Month | Year` & mở khóa `Focus Streak` khi đặt `Elder's Hut`.
  3. **Stage 6+7 (`Notifications`, `RewardHelpModal`, `ErrorTranslator`, `Backlog 4a`):**
     - Đổi ngôn ngữ `EN ↔ VI` rồi mở modal `?` (`RewardHelpModal`): đối chiếu bảng Base Rate, Multiplier `×1.0`..`×2.5`, mục `CoinBonus`, Settlement, Quests & IEEE-754.
     - Cho `COUNTDOWN` / `POMODORO_COUNTDOWN` / `POMODORO_STOPWATCH` hoàn thành hoặc chuyển pha Break khi bật/tắt thông báo: xác nhận Chrome Notification hiển thị đúng EN/VI và số Coin/XP làm tròn half-up tối đa 2 chữ số (ví dụ `7.88`).
     - Thử reload extension khi đang chạy `POMODORO_STOPWATCH` rồi mở lại popup: xác nhận màn hình kết thúc hiển thị `+0` Coin / `+0` XP khớp thông báo hủy thưởng (Backlog 4a).

---

**DỪNG — CHỜ NGƯỜI DÙNG NGHIỆM THU VÀ DUYỆT ĐÓNG MILESTONE 5B.5.**
