# BÁO CÁO NGHIỆM THU — MILESTONE 5B.5 / GIAI ĐOẠN 2a & ĐỒNG BỘ TÀI LIỆU

**Giai đoạn:** Milestone 5B.5 — Giai đoạn 2a *(Đồng bộ tài liệu + Dọn mô tả quy tắc 0.5x + Types, Schema v3 `fq_quests`, Migration v3 & Pure Quest Engine — CHƯA nối vào `SessionCoordinator`, `MessageHandler` hay UI)*  
**Ngày hoàn thành:** 2026-11-18  
**File sao lưu báo cáo cũ:** `/respond_2a_prev.md` *(sao lưu từ báo cáo UX-4; `/respond_ux4_prev.md` vẫn giữ nguyên)*  
**Trạng thái:** Đã hoàn tất kiểm định (`574 / 574` tests PASS 3/3 lần, Build PASS, Lint PASS) — **DỪNG chờ duyệt Giai đoạn 2a**

---

## 1. BẤT BIẾN & PHẠM VI ĐƯỢC BẢO TOÀN

- **Toàn bộ bất biến lõi giữ nguyên 100%:** Zero Passive Income, All-or-Nothing (Pomodoro Countdown), Allowlist Lock, công thức thưởng Coins/XP & CoinBonus, độ chính xác IEEE-754 trong `chrome.storage`, và nút Upgrade công trình vẫn khóa `"Milestone 5C"`.
- **Biên kiến trúc Giai đoạn 2a được giữ chặt:**
  - Tuyệt đối **không** sửa `StorageManager.commitSessionOutcomeInternal`, `SessionCoordinator` (trừ JSDoc của `handleExtensionDisabledRecovery` ở mục dọn 0.5x), `MessageHandler`, `extensionClient.ts` hay bất kỳ component UI nào.
  - Pure Quest Engine (`src/core/quests/*.ts`) đạt `0` lời gọi `Date.now()` và `0` lời gọi `Math.random()`.
  - Migration v3 (`v3_questsSchema.ts`) idempotent, `0` backfill giả dữ liệu phiên cũ, và giữ tương thích hoàn toàn với các test v1/v2 hiện có.

---

## 2. PHẦN A — ĐỒNG BỘ TÀI LIỆU & TRẠNG THÁI NGHIỆM THU

1. **`README.md`:**
   - Cập nhật thông số bộ test lên `574/574`, sửa cụm `"Under 30 min (< 30 min)"`, bổ sung điểm nhấn LOFI Offscreen Streaming, 5-tab map-first, Stats SVG Engine, UX-4 formatting, nền tảng Quest Engine Stage 2a và mục `Roadmap` (`Stage 2b -> 5c -> Awards -> Milestone 5C`).
   - Ghi rõ phạm vi kiểm chứng: automated tests chạy trên Node.js (`tsx --test`) với React SSR (`renderToString`) và mock Chrome adapters; đồng thời các luồng lõi (`400×600` popup, 5-tab, bản đồ/rừng/lớp tối, hoạt ảnh rìu chém, `blocked.html` DNR, `chrome.i18n`, `manifest`, Offscreen Audio kể cả Pause > 30s, fetch catalog nhạc) đã được nghiệm thu thủ công trên Chrome thật (`>= 116`).
2. **`ARCHITECTURE.md` (`Version: 1.5.1`):** Cập nhật Schema v3 (`fq_quests` qua `v3_questsSchema.ts`) và ghi chú rõ hai message `GET_QUEST_STATE` / `CLAIM_QUEST_REWARD` chưa nối ở 2a (chờ Stage 2b).
3. **`PRODUCT_SPEC.md` (`1.4.2-synced`):** Bổ sung `§13` tóm tắt đặc tả Quest Engine Stage 2a (đánh dấu rõ chưa nối vào runtime/UI).
4. **`PROJECT_STATUS.md`:**
   - Cập nhật trạng thái **ĐÃ DUYỆT** cho toàn bộ các giai đoạn trước: **UX-1, UX-2, UX-3, UX-4, LOFI-1, LOFI-1b, LOFI-2, 5B.5 Giai đoạn 1b & Giai đoạn 3**.
   - Bỏ yêu cầu nghiệm thu Giai đoạn 3 & Giai đoạn 1b khỏi mục Bước tiếp theo (`§5`).
   - Cập nhật `§3` và `§4.2` đúng thực tế: giữ rõ automated tests chạy qua React SSR & mock adapters, đồng thời chuyển **popup `400×600` (thanh 5 tab, bản đồ, rừng, lớp tối), hoạt ảnh rìu chém, `blocked.html` với DNR, `chrome.i18n`, `manifest`, Offscreen Audio (kể cả Pause > 30s) và fetch catalog nhạc** sang **đã nghiệm thu thủ công trên Chrome thật theo xác nhận của người dùng** (chỉ còn Quest Engine / Schema v3 là chưa nối UI vì thuộc 2b/5c).

---

## 3. DỌN QUY TẮC 0.5x *(CHỈ TÀI LIỆU, COMMENT & TÊN TEST — KHÔNG ĐỔI LOGIC)*

Theo quyết định đã chốt: quy tắc *"phạt 0.5x cho interval dở dang"* là **SAI và đã bị loại bỏ**. Quy tắc đúng (`PRODUCT_SPEC.md §5.3 & §9`): pha tập trung trong Pomodoro bị bỏ dở nhận **0 Coins / 0 XP**, nhưng số phút tập trung thực tế của interval đó vẫn được ghi vào Daily Stats.

- **Các vị trí đã rà & cập nhật chính xác:**
  1. `PROJECT_STATUS.md §2.4` (dòng `132`): Bỏ cụm *"tính phạt 0.5x cho interval dở dang nếu gián đoạn hợp lệ"*, thay bằng *"chỉ thưởng các interval đã hoàn thành trọn vẹn; interval đang dở dang không được thưởng nhưng số phút vẫn ghi vào Daily Stats (khớp `PRODUCT_SPEC.md` §5.3 & §9; đã loại bỏ mọi mô tả sai về \"phạt 0.5x\")"*.
  2. `src/background/sessionCoordinator.ts` (`handleExtensionDisabledRecovery`, dòng `1658–1663`): Xóa khối JSDoc bị lặp hai lần và viết lại 1 khối JSDoc duy nhất đúng hành vi thực tế hiện tại trong thân hàm (`0` Coins/XP cho cả 4 chế độ; ghi nhận số phút tập trung hợp lệ vào Daily Stats ở Countdown, Pomodoro Countdown, Stopwatch và Pomodoro Stopwatch khớp `PRODUCT_SPEC §9`).
  3. `__tests__/background/sessionIntegrity.test.ts` (dòng `146`): Đổi tiêu đề `Test 4` từ `... (0.5x penalty)` thành `"Session Integrity [Test 4]: Extension Disable/Re-enable interrupts Countdown and Stopwatch with 0 rewards"` (giữ nguyên 100% assertions; comment ở dòng `172` đã là `"// B. Stopwatch: 0 reward when extension disabled"` nên giữ nguyên).
- **Đối chiếu sạch sẽ:** Các kết quả grep còn lại trong repo chỉ là kiểm tra chống hồi quy tại `__tests__/core/rewardEngine.test.ts:137-138` (`Must not award 50% penalty; must be 0 Coins/XP`), thuật ngữ lifecycle chung, và các báo cáo `respond_*.md` lịch sử (được giữ nguyên).
- **Xác nhận baseline:** Trước khi thêm `+13` tests của Giai đoạn 2a, toàn bộ bộ test giữ nguyên `561 / 561 PASS` (`0` thay đổi hành vi runtime).

---

## 4. PHẦN B — TRIỂN KHAI GIAI ĐOẠN 2a (TYPES, SCHEMA v3 & PURE QUEST ENGINE)

### 4.1. Types & Storage Keys (`B1`)
- **`src/types/quests.ts` (mới):** Định nghĩa `QuestPeriod` (`'DAILY' | 'WEEKLY'`), `QuestMetric` (`'COMPLETED_SESSIONS' | 'DAILY_FOCUS_MINUTES' | 'WEEKLY_ACTIVE_DAYS' | 'WEEKLY_LONG_SESSIONS' | 'WEEKLY_COMPLETED_SESSIONS'`), `QuestDefinition`, `QuestProgress`, `QuestStreak`, `QuestState`, `QuestOutcomeDelta`, `QuestResetCountdown`, `ClaimQuestResult`, `CURRENT_QUEST_STATE_VERSION = 1`, `MAX_RECENT_CLAIMED_KEYS = 14`, `MAX_PROCESSED_PERIOD_KEYS = 14`.
- **`src/types/storageSchema.ts` & `src/types/index.ts`:** Thêm `quests?: QuestState` vào `StorageSchema` và re-export `./quests.ts`.
- **`src/storage/storageKeys.ts`:** Bổ sung `STORAGE_KEYS.QUESTS = 'fq_quests'`.

### 4.2. Pure Quest Engine (`B2` — `src/core/quests/`)
- **`src/core/quests/questCatalog.ts`:**
  - **3 Daily Quests** (tổng tối đa cố định `40 Coins · 100 XP` / ngày):
    1. `daily_first_spark` — Hoàn thành `1` phiên (`10 Coins · 25 XP`).
    2. `daily_steady_rhythm` — Tổng `50` phút tập trung trong ngày (`15 Coins · 35 XP`).
    3. `daily_double_tap` — Hoàn thành `2` phiên (`15 Coins · 40 XP`).
  - **3 Weekly Quests** 3 trục trực giao (tổng tối đa cố định `150 Coins · 370 XP` / tuần):
    1. `weekly_habit_builder` — Có `>= 4` ngày hoạt động trong tuần (`50 Coins · 120 XP`).
    2. `weekly_deep_diver` — Hoàn thành `3` phiên sâu `>= 45` phút (`50 Coins · 125 XP`).
    3. `weekly_tenacity_10` — Hoàn thành `10` phiên trong tuần (`50 Coins · 125 XP`).
  - Hệ số & CoinBonus **không** nhân thêm vào phần thưởng nhiệm vụ (flat reward cố định).
- **`src/core/quests/questDates.ts`:** Tái sử dụng `statsAggregator.ts` cho số học lịch Gregory thuần (`getLocalWeekStartKeyFromDateKey` tìm Thứ Hai đầu tuần an toàn qua mốc giao năm `2026-12-31 → 2027-01-01` và năm nhuận `29/02`; `getResetCountdown` tính chính xác mili-giây tới `00:00` ngày mới & Thứ Hai kế tiếp).
- **`src/core/quests/questEngine.ts` & `index.ts`:**
  - `createInitialQuestState`, `sanitizeQuestState` (tự phục hồi trạng thái corrupt mà không crash).
  - `rolloverQuestState`: Đóng/mở kỳ ngày & tuần mới, cập nhật streak khi có phiên hoạt động, **bảo vệ chống lùi đồng hồ hệ thống** (anti-clock-rollback guard) và dọn bộ nhớ `recentClaimedKeys` / `processedDayKeys` / `processedWeekKeys` theo ring-buffer tối đa `14` mục.
  - `applyCompletedSession`, `canClaim`, `claimQuest` (Manual Claim, chặn nhận 2 lần cùng kỳ kể cả sau rollover), `countUnclaimed`.
  - `toQuestOutcomeDelta`: Ánh xạ đúng All-or-Nothing — Pomodoro Countdown chỉ tính khi `COMPLETED`, Pomodoro Stopwatch chỉ cộng `completedFocusCount × intervalDuration` khi có ít nhất 1 interval trọn vẹn (không cộng interval dở dang).

### 4.3. Schema v3, Migration v3 & Storage Accessors (`B3`)
- **`src/storage/migrations/v3_questsSchema.ts` (mới):** Nâng v2 → v3 bằng cách khởi tạo `fq_quests` sạch (`sanitizeQuestState` nếu đã có sẵn dữ liệu hợp lệ/corrupt), `0` backfill giả phiên lịch sử.
- **`src/storage/migrations/migrationRunner.ts`:** Nâng `CURRENT_SCHEMA_VERSION = 3` và đăng ký `v3_questsSchema` (các test v1/v2 cũ không bị ảnh hưởng).
- **`src/storage/storageManager.ts`:** Thêm `getQuests`, `setQuests`, `updateQuests` (tự sanitize khi đọc dữ liệu corrupt). **Không đụng** `commitSessionOutcomeInternal`.

### 4.4. Bộ Kiểm Thử Mới (`B4` — `+13` tests)
- **`__tests__/core/questEngine.test.ts` (9 tests):** Khớp trần thưởng 40/100 & 150/370, rollover qua giao năm & `29/02`, tiến độ 6 quest + Manual Claim + chặn double-claim, 3 trục trực giao weekly, hết hạn claim sau rollover, anti-clock-rollback + giữ ring-buffer `14` phần tử, quy tắc Streak, ánh xạ 4 mode `toQuestOutcomeDelta`, kiểm tra tĩnh `0` `Date.now()`/`Math.random()` & tự vá state corrupt.
- **`__tests__/storage/v3Migration.test.ts` (4 tests):** Bảo toàn Economy/Civilization/Profiles/Stats/Settings khi nâng v2 → v3 & `0` backfill, nâng từ schema rỗng/v1 → v3, idempotent & vá `fq_quests` corrupt, và kiểm chứng `StorageManager` + hồi quy `SessionCoordinator` (Coins/XP/Level/DailyStats giữ nguyên 100%, `fq_quests` không bị chạm).

---

## 5. KẾT QUẢ KIỂM ĐỊNH THỰC TẾ (VERIFIED REAL OUTPUTS)

- **`npm run lint` (`tsc --noEmit`):** **PASS** (`Exit code 0`, `0` errors).
- **`npm run clean && npm run build`:** **PASS** (`Vite v8.3.8`, `1,746 modules transformed`, **`727ms`**, tổng dung lượng `dist/`: **`1,089,594 B`**):
  - `dist/index.html`: `716 B` | `dist/assets/popup-07l23r0d.js`: `765,071 B` (`765.07 kB`, gzip: `201.50 kB`) | `dist/assets/popup-D9z-9pA-.css`: `88,298 B` (`88.29 kB`, gzip: `13.79 kB`)
  - `dist/assets/translator-B5-w4v6G.js`: `52,477 B` (`52.47 kB`) | `dist/assets/statsAggregator-C5H9LvvS.js`: `55,154 B` (`55.15 kB`) | `dist/assets/storageKeys-C4hhw6ET.js`: `398 B` (`0.39 kB`)
  - `dist/background.js`: `93,016 B` (`93.01 kB`, gzip: `20.37 kB`) | `dist/offscreen.js`: `3,878 B` (`3.87 kB`) | `dist/blocked.js`: `1,321 B` (`1.32 kB`)
  - `dist/manifest.json`: `984 B` | `dist/offscreen.html`: `264 B` | `dist/blocked.html`: `1,810 B` | `dist/_locales/{en,vi}/messages.json`: `382 B` / `440 B`
- **`npm test` — chạy 3 lần liên tiếp (sau toàn bộ chỉnh sửa cuối):**
  - **Lần 1:** `574 / 574 PASS` (`0` fail, `0` skipped, `0` cancelled, `16,073.80 ms`, Exit `0`).
  - **Lần 2:** `574 / 574 PASS` (`0` fail, `0` skipped, `0` cancelled, `15,952.22 ms`, Exit `0`).
  - **Lần 3:** `574 / 574 PASS` (`0` fail, `0` skipped, `0` cancelled, `16,633.53 ms`, Exit `0`).
  - *Phạm vi test:* Automated tests chạy trên Node.js qua React SSR (`renderToString`) và mock Chrome adapters; các luồng UI/extension hiện có (popup `400×600`, thanh 5 tab, bản đồ/rừng/lớp tối, hoạt ảnh rìu chém, `blocked.html` DNR, `chrome.i18n`, `manifest`, Offscreen Audio kể cả Pause > 30s và fetch catalog nhạc) đã có **nghiệm thu thủ công trên Chrome thật** bởi người dùng. Phần Quest Engine Stage 2a chưa nối vào UI/background nên hiện kiểm chứng ở tầng pure logic & migration tests.

---

## 6. BƯỚC TIẾP THEO (CHỜ DUYỆT GIAI ĐOẠN 2a)

- **DỪNG tại đây chờ người dùng duyệt Giai đoạn 2a.**
- Sau khi được duyệt, sẽ bước sang **Giai đoạn 2b (`QuestCoordinator` & Atomic Wiring)**: nối nguyên tử `questOutcomeDelta` qua `commitSessionOutcomeInternal` dưới `StorageMutex`, bổ sung `GET_QUEST_STATE` & `CLAIM_QUEST_REWARD` vào `MessageHandler` + simulator `extensionClient.ts`, rồi tiếp tục **Giai đoạn 5c** để mở UI cho tab `Quests` & nâng cấp `StatsView`.
